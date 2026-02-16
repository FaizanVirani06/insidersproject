#!/usr/bin/env python3
"""SQLite -> Postgres migration helper.

This is a **best-effort** copier intended for local/dev and controlled migrations.

Key features vs. the earlier one-off:
- Creates a **consistent SQLite snapshot** first (SQLite is in WAL mode in this project).
- Copies **only the column intersection** (handles schema drift between DBs).
- Streams rows in batches (doesn't load entire tables in memory).
- Optionally truncates the Postgres target before copying.

Usage:

  python scripts/migrate_sqlite_to_postgres.py \
    --sqlite ./insider_platform.sqlite \
    --postgres "postgresql://postgres:postgres@localhost:5432/insider_platform" \
    --truncate

If you want to validate what changed between this repo's bundled SQLite and dump.sql:

  python scripts/compare_sqlite_vs_dump.py --sqlite ./insider_platform.sqlite --dump ./dump.sql
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable, List, Sequence


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


from insider_platform.db import init_db  # noqa: E402


def _debug(msg: str) -> None:
    print(f"[migrate] {msg}")


def _sqlite_tables(conn: sqlite3.Connection) -> List[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    return [str(r[0]) for r in rows]


def _sqlite_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [str(r[1]) for r in rows]  # (cid, name, type, notnull, dflt_value, pk)


def _pg_columns(cur: Any, table: str) -> List[str]:
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=%s
        ORDER BY ordinal_position
        """,
        (table,),
    )
    return [str(r[0]) for r in cur.fetchall()]


def _iter_sqlite_rows(
    conn: sqlite3.Connection, *, table: str, cols: Sequence[str], fetch_size: int
) -> Iterable[tuple[Any, ...]]:
    col_list = ", ".join(cols)
    cur = conn.execute(f"SELECT {col_list} FROM {table}")
    while True:
        batch = cur.fetchmany(fetch_size)
        if not batch:
            break
        for row in batch:
            # row is a tuple because we don't set row_factory
            yield tuple(row)


def _make_sqlite_snapshot(src_path: str) -> str:
    """Create a consistent snapshot using sqlite backup API.

    The project runs SQLite in WAL mode, so copying only the main *.sqlite file
    can miss committed data that still lives in the -wal file.

    The backup API produces a single-file snapshot that is safe to migrate from.
    """
    src_path = os.path.abspath(src_path)
    fd, dst_path = tempfile.mkstemp(prefix="sqlite_snapshot_", suffix=".sqlite")
    os.close(fd)

    _debug(f"Creating SQLite snapshot: {dst_path}")

    src = sqlite3.connect(src_path, timeout=60, check_same_thread=False)
    try:
        # Try to checkpoint WAL so the snapshot is smaller (safe to ignore failures).
        try:
            src.execute("PRAGMA wal_checkpoint(FULL);")
        except Exception:
            pass

        dst = sqlite3.connect(dst_path)
        try:
            with dst:
                src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()

    return dst_path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", required=True, help="Path to SQLite DB file")
    ap.add_argument("--postgres", required=True, help="Postgres DSN (postgresql://...)")
    ap.add_argument("--batch", type=int, default=2000, help="Batch size for inserts")
    ap.add_argument(
        "--truncate",
        action="store_true",
        help="Truncate all destination tables before copying (recommended for one-shot migrations)",
    )
    ap.add_argument(
        "--no-snapshot",
        action="store_true",
        help="Read from the source SQLite file directly (not recommended if WAL mode is enabled)",
    )
    ap.add_argument(
        "--on-conflict-do-nothing",
        action="store_true",
        help="Add ON CONFLICT DO NOTHING to inserts (useful if re-running into a non-empty DB)",
    )
    args = ap.parse_args()

    # Ensure schema exists on the target.
    init_db(args.postgres)

    try:
        import psycopg2
        import psycopg2.extras
    except Exception as e:
        raise SystemExit(
            "psycopg2 not installed; install psycopg2-binary to run this migration."
        ) from e

    snapshot_path: str | None = None
    src_path = args.sqlite
    if not args.no_snapshot:
        snapshot_path = _make_sqlite_snapshot(src_path)
        src_path = snapshot_path

    try:
        src = sqlite3.connect(src_path)
        try:
            # Use tuple rows for fastest iteration.
            src.row_factory = None

            tables = _sqlite_tables(src)
            _debug(f"Found {len(tables)} tables in SQLite")

            dst = psycopg2.connect(args.postgres)
            try:
                dst.autocommit = False
                cur = dst.cursor()

                if args.truncate:
                    _debug("Truncating destination tables...")
                    # No FKs in this schema, so order doesn't matter.
                    for t in tables:
                        cur.execute(f'TRUNCATE TABLE "{t}" RESTART IDENTITY CASCADE;')
                    dst.commit()

                for table in tables:
                    src_cols = _sqlite_columns(src, table)
                    if not src_cols:
                        continue

                    dst_cols = _pg_columns(cur, table)
                    # Copy only intersecting columns; allow defaults on the rest.
                    cols = [c for c in dst_cols if c in src_cols]
                    if not cols:
                        _debug(f"{table}: no matching columns; skipped")
                        continue

                    # Count source rows for reporting.
                    n_src = src.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                    if not n_src:
                        _debug(f"{table}: 0 rows")
                        continue

                    _debug(f"{table}: copying {n_src} rows ({len(cols)} cols)")

                    col_list = ", ".join([f'"{c}"' for c in cols])
                    conflict_clause = " ON CONFLICT DO NOTHING" if args.on_conflict_do_nothing else ""
                    insert_sql = f"INSERT INTO \"{table}\" ({col_list}) VALUES %s{conflict_clause}"

                    buf: list[tuple[Any, ...]] = []
                    inserted = 0

                    for row in _iter_sqlite_rows(src, table=table, cols=cols, fetch_size=args.batch):
                        buf.append(row)
                        if len(buf) >= args.batch:
                            psycopg2.extras.execute_values(cur, insert_sql, buf, page_size=len(buf))
                            inserted += len(buf)
                            buf.clear()

                    if buf:
                        psycopg2.extras.execute_values(cur, insert_sql, buf, page_size=len(buf))
                        inserted += len(buf)
                        buf.clear()

                    dst.commit()
                    _debug(f"{table}: inserted ~{inserted} rows")

                # Bump sequences for known serial columns (safe if missing)
                serials = [
                    ("users", "user_id"),
                    ("form4_rows_raw", "row_id"),
                    ("ai_outputs", "ai_output_id"),
                    ("jobs", "job_id"),
                    ("data_issues", "issue_id"),
                    ("user_feedback", "feedback_id"),
                ]
                for table, col in serials:
                    try:
                        cur.execute(
                            """
                            SELECT setval(pg_get_serial_sequence(%s, %s),
                                (SELECT COALESCE(MAX(""" + col + """), 1) FROM """ + table + """))
                            """,
                            (table, col),
                        )
                    except Exception:
                        dst.rollback()
                        continue

                dst.commit()
                _debug("Migration complete.")
            finally:
                dst.close()
        finally:
            src.close()
    finally:
        if snapshot_path:
            try:
                os.remove(snapshot_path)
            except Exception:
                pass


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Compare a SQLite database file against a Postgres pg_dump file.

This is a forensic helper for tracking down migration discrepancies.

It prints:
- row counts per table (SQLite vs dump)
- tables whose counts differ
- for a few frequently-changing tables, the max timestamp column (if present)

Notes:
- The bundled dump in this repo is UTF-16LE; we auto-decode it.
- The dump is expected to contain COPY ... FROM stdin sections.
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
from collections import defaultdict
from typing import Dict, Tuple


def _read_text_auto(path: str) -> str:
    # pg_dump can be UTF-16LE (as in this repo). Detect BOM.
    with open(path, "rb") as f:
        raw = f.read()
    if raw.startswith(b"\xff\xfe"):
        return raw.decode("utf-16le", errors="replace")
    if raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16be", errors="replace")
    return raw.decode("utf-8", errors="replace")


def _dump_copy_counts(dump_text: str) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    current: str | None = None
    for line in dump_text.splitlines():
        if current is None:
            if line.startswith("COPY "):
                m = re.match(r"COPY\s+[\w\.]+\.([a-zA-Z0-9_]+)\s*\(", line)
                if m:
                    current = m.group(1)
                    counts.setdefault(current, 0)
            continue

        if line == "\\.":
            current = None
            continue

        counts[current] += 1
    return dict(counts)


def _sqlite_counts(sqlite_path: str) -> Dict[str, int]:
    # If the DB is in WAL mode, opening may require writing the -shm file.
    # immutable=1 avoids that; it's sufficient for counts.
    uri = f"file:{os.path.abspath(sqlite_path)}?immutable=1"
    conn = sqlite3.connect(uri, uri=True)
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
        ]
        out: Dict[str, int] = {}
        for t in tables:
            out[t] = int(conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
        return out
    finally:
        conn.close()


def _try_max(conn: sqlite3.Connection, table: str, col: str) -> str | None:
    try:
        return conn.execute(f"SELECT MAX({col}) FROM {table}").fetchone()[0]
    except Exception:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", required=True)
    ap.add_argument("--dump", required=True)
    args = ap.parse_args()

    dump_text = _read_text_auto(args.dump)
    dump_counts = _dump_copy_counts(dump_text)
    sqlite_counts = _sqlite_counts(args.sqlite)

    tables = sorted(set(sqlite_counts) | set(dump_counts))
    diffs = []
    for t in tables:
        a = sqlite_counts.get(t)
        b = dump_counts.get(t)
        if a != b:
            diffs.append((t, a, b))

    print("\nRow counts (SQLite vs dump):")
    for t in tables:
        print(f"  {t:24s} sqlite={sqlite_counts.get(t, 0):>8} dump={dump_counts.get(t, 0):>8}")

    print("\nTables with differing counts:")
    if not diffs:
        print("  (none)")
    else:
        for t, a, b in diffs:
            delta = (b or 0) - (a or 0)
            print(f"  {t:24s} sqlite={a} dump={b} delta={delta:+}")

    # Helpful timestamps (if present)
    uri = f"file:{os.path.abspath(args.sqlite)}?immutable=1"
    conn = sqlite3.connect(uri, uri=True)
    try:
        print("\nSQLite max timestamps (sanity):")
        for table, col in [
            ("jobs", "updated_at"),
            ("backfill_queue", "updated_at"),
            ("filing_documents", "fetched_at"),
            ("insider_events", "event_computed_at"),
        ]:
            v = _try_max(conn, table, col)
            if v is not None:
                print(f"  {table:24s} MAX({col}) = {v}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

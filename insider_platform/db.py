from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

from insider_platform.schema import get_schema_sql
from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[db] {msg}")


def _detect_dialect(dsn: str) -> str:
    """Return 'postgres' or 'sqlite'."""
    s = (dsn or "").strip()
    if not s:
        return "sqlite"
    try:
        scheme = urlparse(s).scheme.lower()
    except Exception:
        scheme = ""
    if scheme in ("postgres", "postgresql"):
        return "postgres"
    # Allow sqlite:///path style, but default is file path.
    if scheme in ("sqlite",):
        return "sqlite"
    return "sqlite"


def _qmark_to_pct(sql: str) -> str:
    """Convert SQLite qmark placeholders (?) to psycopg2 placeholders (%s).

    This is a lightweight conversion that avoids replacing '?' inside single/double-quoted
    string literals. It's not a full SQL parser, but it is sufficient for this codebase.
    """
    out: List[str] = []
    in_single = False
    in_double = False
    i = 0
    while i < len(sql):
        ch = sql[i]

        if ch == "'" and not in_double:
            out.append(ch)
            if in_single:
                # Escaped single quote: ''
                if i + 1 < len(sql) and sql[i + 1] == "'":
                    out.append("'")
                    i += 2
                    continue
                in_single = False
            else:
                in_single = True
            i += 1
            continue

        if ch == '"' and not in_single:
            out.append(ch)
            if in_double:
                # Escaped double quote: ""
                if i + 1 < len(sql) and sql[i + 1] == '"':
                    out.append('"')
                    i += 2
                    continue
                in_double = False
            else:
                in_double = True
            i += 1
            continue

        if ch == "?" and not in_single and not in_double:
            out.append("%s")
            i += 1
            continue

        out.append(ch)
        i += 1

    return "".join(out)


class PGCursor:
    def __init__(self, cur: Any):
        self._cur = cur

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> "PGCursor":
        self._cur.execute(_qmark_to_pct(sql), tuple(params or ()))
        return self

    def executemany(self, sql: str, seq_of_params: Sequence[Sequence[Any]]) -> "PGCursor":
        self._cur.executemany(_qmark_to_pct(sql), [tuple(x) for x in seq_of_params])
        return self

    def fetchone(self) -> Any:
        return self._cur.fetchone()

    def fetchall(self) -> Any:
        return self._cur.fetchall()

    @property
    def rowcount(self) -> int:
        try:
            return int(self._cur.rowcount or 0)
        except Exception:
            return 0

    def close(self) -> None:
        try:
            self._cur.close()
        except Exception:
            pass

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cur, name)


class PGConnection:
    """A tiny adapter that makes psycopg2 connections look like sqlite3 connections."""

    dialect = "postgres"

    def __init__(self, conn: Any):
        self._conn = conn

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> PGCursor:
        cur = self._conn.cursor()
        wrapper = PGCursor(cur)
        wrapper.execute(sql, params)
        return wrapper

    def executemany(self, sql: str, seq_of_params: Sequence[Sequence[Any]]) -> PGCursor:
        cur = self._conn.cursor()
        wrapper = PGCursor(cur)
        wrapper.executemany(sql, seq_of_params)
        return wrapper

    def cursor(self) -> PGCursor:
        return PGCursor(self._conn.cursor())

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


@contextmanager
def connect(db_dsn: str) -> Iterator[Any]:
    """Connect to SQLite or Postgres with sensible defaults.

    - SQLite: uses WAL + NORMAL sync.
    - Postgres: uses psycopg2 (RealDictCursor) so rows behave like dicts.
    """
    dsn = (db_dsn or "").strip()
    dialect = _detect_dialect(dsn)

    if dialect == "postgres":
        try:
            import psycopg2
            import psycopg2.extras
        except Exception as e:
            raise RuntimeError(
                "Postgres selected but psycopg2 is not installed. "
                "Install psycopg2-binary and try again."
            ) from e

        # RealDictCursor makes fetchone()/fetchall() rows act like dicts.
        raw = psycopg2.connect(dsn, cursor_factory=psycopg2.extras.RealDictCursor)
        conn = PGConnection(raw)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
        return

    # SQLite fallback
    # Support sqlite:///path style
    if dsn.lower().startswith("sqlite:///"):
        dsn = dsn[len("sqlite:///") :]

    Path(dsn).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(dsn, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Concurrency / performance pragmas (safe defaults for multi-process API+workers)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")  # 5s
    conn.execute("PRAGMA temp_store=MEMORY;")
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_dsn: str) -> None:
    """Create all tables and run lightweight migrations."""
    dialect = _detect_dialect(db_dsn)
    _debug(f"Initializing DB ({dialect}) at {db_dsn}")
    with connect(db_dsn) as conn:
        schema_sql = get_schema_sql(dialect)
        # Ensure only one process runs schema DDL at a time.
        # - Postgres: use an advisory lock.
        # - SQLite: DDL already takes an exclusive database lock; don't call pg_* functions.
        if dialect == "postgres":
            conn.execute("SELECT pg_advisory_lock(2147483647);")
            try:
                _exec_schema(conn, schema_sql, dialect=dialect)
            finally:
                conn.execute("SELECT pg_advisory_unlock(2147483647);")
        else:
            _exec_schema(conn, schema_sql, dialect=dialect)

        _migrate(conn, dialect=dialect)


def _exec_schema(conn: Any, ddl: str, *, dialect: str) -> None:
    if dialect == "postgres":
        # Execute multi-statement DDL (naive split is OK for our schema)
        statements = [s.strip() for s in ddl.split(";") if s.strip()]
        for stmt in statements:
            conn.execute(stmt)
        return

    # SQLite can run it in one go
    conn.executescript(ddl)


def _has_column(conn: Any, table: str, col: str, *, dialect: str) -> bool:
    if dialect == "postgres":
        r = conn.execute(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name=?
              AND column_name=?
            LIMIT 1
            """,
            (table, col),
        ).fetchone()
        return r is not None

    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    # sqlite3.Row has "name"; fallback for tuple rows
    return any((r["name"] if isinstance(r, sqlite3.Row) else r[1]) == col for r in rows)


def _table_columns(conn: Any, table: str, *, dialect: str) -> List[str]:
    if dialect == "postgres":
        rows = conn.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name=?
            ORDER BY ordinal_position
            """,
            (table,),
        ).fetchall()
        return [str(r["column_name"]) for r in rows]

    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [str(r["name"]) for r in rows]


def _migrate(conn: Any, *, dialect: str) -> None:
    """Lightweight forward-only migrations for existing DBs."""
    # Add ai_outputs.input_json if missing (existing rows get empty string)
    if not _has_column(conn, "ai_outputs", "input_json", dialect=dialect):
        conn.execute("ALTER TABLE ai_outputs ADD COLUMN input_json TEXT NOT NULL DEFAULT ''")

    # event_outcomes: benchmark + excess return columns (outcomes_v2)
    if _has_column(conn, "event_outcomes", "issuer_cik", dialect=dialect):
        cols_to_add = [
            ("bench_symbol", "TEXT"),
            ("bench_return_60d", "DOUBLE PRECISION"),
            ("bench_missing_reason_60d", "TEXT"),
            ("excess_return_60d", "DOUBLE PRECISION"),
            ("bench_return_180d", "DOUBLE PRECISION"),
            ("bench_missing_reason_180d", "TEXT"),
            ("excess_return_180d", "DOUBLE PRECISION"),
        ]
        for col, ctype in cols_to_add:
            if not _has_column(conn, "event_outcomes", col, dialect=dialect):
                conn.execute(f"ALTER TABLE event_outcomes ADD COLUMN {col} {ctype}")

    # users: billing / subscription columns (Stripe)
    if _has_column(conn, "users", "user_id", dialect=dialect):
        user_cols_to_add = [
            ("stripe_customer_id", "TEXT"),
            ("stripe_subscription_id", "TEXT"),
            ("stripe_price_id", "TEXT"),
            ("subscription_status", "TEXT"),
            ("current_period_end", "TEXT"),
            ("cancel_at_period_end", "INTEGER"),
            ("subscription_updated_at", "TEXT"),
        ]
        for col, ctype in user_cols_to_add:
            if not _has_column(conn, "users", col, dialect=dialect):
                # Keep defaults lightweight; the application treats missing/NULL as "no subscription".
                if col == "cancel_at_period_end":
                    conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ctype} NOT NULL DEFAULT 0")
                else:
                    conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ctype}")


def upsert_app_config(conn: Any, key: str, value: str, *, dialect: str | None = None) -> None:
    """Upsert a simple key/value config entry.

    Older DBs may have an extra NOT NULL `updated_at` column. We support both schemas.
    """
    d = dialect or getattr(conn, "dialect", "sqlite")
    cols = _table_columns(conn, "app_config", dialect=d)
    now = utcnow_iso()
    if "updated_at" in cols:
        conn.execute(
            """
            INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (key, value, now),
        )
        return

    conn.execute(
        """
        INSERT INTO app_config (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
        """,
        (key, value),
    )


def get_app_config(conn: Any, key: str) -> Optional[str]:
    row = conn.execute("SELECT value FROM app_config WHERE key=?", (key,)).fetchone()
    if row is None:
        return None
    return str(row["value"])

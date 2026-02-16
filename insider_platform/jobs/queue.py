from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Sequence

from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[jobs] {msg}")


def _dialect(conn: Any) -> str:
    return str(getattr(conn, "dialect", "sqlite") or "sqlite").lower()


@dataclass(frozen=True)
class Job:
    job_id: int
    job_type: str
    status: str
    priority: int
    dedupe_key: str
    payload: Dict[str, Any]
    attempts: int
    max_attempts: int


def enqueue_job(
    conn: Any,
    *,
    job_type: str,
    dedupe_key: str,
    payload: Dict[str, Any],
    priority: int = 100,
    max_attempts: int = 3,
    run_after: Optional[str] = None,
    requeue_if_exists: bool = False,
) -> None:
    """Enqueue a job with dedupe.

    Implementation note:
    We use `ON CONFLICT(dedupe_key) DO NOTHING` so this works on both SQLite and Postgres
    without relying on engine-specific IntegrityError classes.
    """
    now = utcnow_iso()
    payload_json = json.dumps(payload, ensure_ascii=False)

    inserted = conn.execute(
        """
        INSERT INTO jobs (job_type, status, priority, dedupe_key, payload_json, attempts, max_attempts, last_error, created_at, updated_at, run_after)
        VALUES (?, 'pending', ?, ?, ?, 0, ?, NULL, ?, ?, ?)
        ON CONFLICT(dedupe_key) DO NOTHING
        RETURNING job_id
        """,
        (job_type, priority, dedupe_key, payload_json, max_attempts, now, now, run_after),
    ).fetchone()

    if inserted is not None:
        _debug(f"Enqueued job {job_type} dedupe_key={dedupe_key}")
        return

    # Dedupe hit
    if not requeue_if_exists:
        _debug(f"Skipped enqueue (dedupe exists) {job_type} dedupe_key={dedupe_key}")
        return

    # Requeue logic: only reset if the existing job is terminal.
    row = conn.execute(
        "SELECT job_id, status FROM jobs WHERE dedupe_key=?",
        (dedupe_key,),
    ).fetchone()
    if row is None:
        return

    status = str(row["status"])
    if status in ("pending", "running"):
        _debug(f"Skipped requeue (already {status}) {job_type} dedupe_key={dedupe_key}")
        return

    conn.execute(
        """
        UPDATE jobs
        SET status='pending',
            priority=?,
            payload_json=?,
            attempts=0,
            max_attempts=?,
            last_error=NULL,
            updated_at=?,
            run_after=?
        WHERE dedupe_key=?
        """,
        (priority, payload_json, max_attempts, now, run_after, dedupe_key),
    )
    _debug(f"Requeued job {job_type} dedupe_key={dedupe_key}")


def claim_next_job(conn: Any, *, allowed_job_types: Optional[set[str]] = None) -> Optional[Job]:
    now = utcnow_iso()
    dialect = _dialect(conn)

    where_extra = ""
    params: list[Any] = [now]

    if allowed_job_types:
        types = sorted({t for t in allowed_job_types if t})
        if types:
            placeholders = ",".join(["?"] * len(types))
            where_extra = f" AND job_type IN ({placeholders})"
            params.extend(types)

    # Atomic "select + update" with RETURNING to avoid race conditions.
    # Postgres: add SKIP LOCKED so multiple workers don't pile onto the same row.
    lock_clause = " FOR UPDATE SKIP LOCKED" if dialect.startswith("post") else ""

    sql = f"""
    WITH next AS (
        SELECT job_id
        FROM jobs
        WHERE status='pending'
          AND (run_after IS NULL OR run_after <= ?)
          {where_extra}
        ORDER BY priority DESC, created_at ASC, job_id ASC
        LIMIT 1{lock_clause}
    )
    UPDATE jobs
    SET status='running',
        updated_at=?
    WHERE job_id = (SELECT job_id FROM next)
      AND status='pending'
    RETURNING job_id, job_type, priority, dedupe_key, payload_json, attempts, max_attempts;
    """

    # NOTE: updated_at=? is the last parameter
    params2 = params + [now]
    row = conn.execute(sql, tuple(params2)).fetchone()

    if row is None:
        return None

    payload_json = row["payload_json"] if row is not None else None
    payload = json.loads(payload_json) if payload_json else {}
    return Job(
        job_id=int(row["job_id"]),
        job_type=str(row["job_type"]),
        status="running",
        priority=int(row["priority"] or 0),
        dedupe_key=str(row["dedupe_key"]),
        payload=payload,
        attempts=int(row["attempts"] or 0),
        max_attempts=int(row["max_attempts"] or 3),
    )


def mark_job_success(conn: Any, job_id: int) -> None:
    conn.execute(
        "UPDATE jobs SET status='success', updated_at=? WHERE job_id=?",
        (utcnow_iso(), int(job_id)),
    )


def mark_job_deferred(conn: Any, job_id: int, reason: str, *, retry_after_seconds: int = 30) -> None:
    """Return a running job back to pending without consuming an attempt."""
    now = utcnow_iso()
    run_after_dt = datetime.now(timezone.utc) + timedelta(seconds=int(retry_after_seconds))
    run_after = run_after_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    conn.execute(
        """
        UPDATE jobs
        SET status='pending',
            last_error=?,
            updated_at=?,
            run_after=?
        WHERE job_id=?
        """,
        (str(reason)[:5000], now, run_after, int(job_id)),
    )


def mark_job_error(conn: Any, job_id: int, err: str, *, retry_after_seconds: int = 60) -> None:
    """Mark error; retry if attempts < max_attempts."""
    now = utcnow_iso()

    row = conn.execute("SELECT attempts, max_attempts FROM jobs WHERE job_id=?", (int(job_id),)).fetchone()
    if row is None:
        return

    attempts = int(row["attempts"]) + 1
    max_attempts = int(row["max_attempts"])

    if attempts >= max_attempts:
        conn.execute(
            """
            UPDATE jobs
            SET status='error', attempts=?, last_error=?, updated_at=?
            WHERE job_id=?
            """,
            (attempts, str(err)[:5000], now, int(job_id)),
        )
        return

    # Backoff by pushing run_after forward (simple fixed backoff)
    run_after_dt = datetime.now(timezone.utc) + timedelta(seconds=int(retry_after_seconds))
    run_after = run_after_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    conn.execute(
        """
        UPDATE jobs
        SET status='pending', attempts=?, last_error=?, updated_at=?, run_after=?
        WHERE job_id=?
        """,
        (attempts, str(err)[:5000], now, run_after, int(job_id)),
    )

from __future__ import annotations

import sqlite3
import time
import threading
from datetime import datetime
from typing import Any, Dict, Iterable, List, Tuple

import requests

from insider_platform.config import Config
from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[backfill] {msg}")


# Per-process polite throttling for SEC endpoints.
_SEC_LAST_REQUEST_MONO: float = 0.0
_SEC_LOCK = threading.Lock()


def _throttle(min_interval_seconds: float | None) -> None:
    if not min_interval_seconds or min_interval_seconds <= 0:
        return
    global _SEC_LAST_REQUEST_MONO
    with _SEC_LOCK:
        now = time.monotonic()
        dt = now - _SEC_LAST_REQUEST_MONO
        if dt < min_interval_seconds:
            time.sleep(min_interval_seconds - dt)
        _SEC_LAST_REQUEST_MONO = time.monotonic()


def _get_json(url: str, user_agent: str, min_interval_seconds: float | None = None) -> Dict[str, Any]:
    _debug(f"GET {url}")
    _throttle(min_interval_seconds)
    r = requests.get(url, headers={"User-Agent": user_agent}, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"SEC request failed {r.status_code}: {r.text}")
    return r.json()


def _iter_recent(recent: Dict[str, Any]) -> Iterable[Tuple[str, str | None, str | None]]:
    accs = recent.get("accessionNumber") or []
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    n = len(accs)
    for i in range(n):
        acc = str(accs[i]).strip()
        form = str(forms[i]).strip() if i < len(forms) and forms[i] is not None else None
        dt = str(dates[i]).strip() if i < len(dates) and dates[i] is not None else None
        if acc:
            yield acc, form, dt


def _is_form4(form: str | None) -> bool:
    if not form:
        return False
    f = form.strip().upper()
    return f == "4" or f == "4/A" or f.startswith("4 ")


def discover_form4_accessions_for_issuer(
    conn: sqlite3.Connection,
    cfg: Config,
    *,
    issuer_cik: str,
    start_year: int = 2006,
) -> int:
    """Discover historical Form 4 accessions for an issuer and enqueue them into backfill_queue.

    This function performs SEC API calls (submissions JSON + historical filing blocks).
    It does NOT enqueue fetch jobs directly; the BACKFILL_ENQUEUE_BATCH job does that in batches.
    """
    cik10 = str(issuer_cik).zfill(10)
    start_date = f"{int(start_year):04d}-01-01"

    existing_rows = conn.execute(
        "SELECT accession_number FROM filings WHERE issuer_cik=?",
        (cik10,),
    ).fetchall()
    existing = {str(r["accession_number"]) for r in existing_rows}

    now = utcnow_iso()
    inserted = 0

    def insert_many(candidates: List[Tuple[str, str | None, str | None]]) -> int:
        nonlocal inserted
        n = 0
        for acc, form, dt in candidates:
            if acc in existing:
                continue
            if dt and dt < start_date:
                continue
            if not _is_form4(form):
                continue

            # upsert but do not downgrade status if already fetched/parsed
            conn.execute(
                """
                INSERT INTO backfill_queue (issuer_cik, accession_number, filing_date, form_type, status, last_error, created_at, updated_at)
                VALUES (?,?,?,?, 'pending', NULL, ?, ?)
                ON CONFLICT(issuer_cik, accession_number) DO UPDATE SET
                    filing_date=COALESCE(backfill_queue.filing_date, excluded.filing_date),
                    form_type=COALESCE(backfill_queue.form_type, excluded.form_type),
                    updated_at=excluded.updated_at
                """,
                (cik10, acc, dt, form, now, now),
            )
            n += 1
        inserted += n
        return n

    # Main submissions JSON
    url = f"https://data.sec.gov/submissions/CIK{cik10}.json"
    data = _get_json(url, cfg.SEC_USER_AGENT, getattr(cfg, "SEC_MIN_INTERVAL_SECONDS", None))

    recent = (data.get("filings") or {}).get("recent") or {}
    insert_many(list(_iter_recent(recent)))

    # Historical file blocks (each is another JSON under submissions/{name})
    files = (data.get("filings") or {}).get("files") or []
    for f in files:
        name = str((f or {}).get("name") or "").strip()
        if not name:
            continue

        # Use filingTo to skip blocks that are entirely before start_date (if available)
        filing_to = str((f or {}).get("filingTo") or "").strip()
        if filing_to and filing_to < start_date:
            continue

        try:
            url2 = f"https://data.sec.gov/submissions/{name}"
            data2 = _get_json(url2, cfg.SEC_USER_AGENT, getattr(cfg, "SEC_MIN_INTERVAL_SECONDS", None))
            recent2 = (data2.get("filings") or {}).get("recent") or {}
            insert_many(list(_iter_recent(recent2)))
        except Exception as e:
            _debug(f"Skipping filings block {name}: {e}")
            continue

    _debug(f"Backfill discovery issuer={cik10} start_year={start_year} inserted={inserted}")
    return inserted

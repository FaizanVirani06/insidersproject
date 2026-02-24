from __future__ import annotations

import re
from typing import Any, Dict, List, Set, Tuple

import requests

from insider_platform.config import Config
from insider_platform.db import upsert_app_config
from insider_platform.jobs.queue import enqueue_job
from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[poller] {msg}")


def _extract_archives_pairs(text: str) -> List[Tuple[str, str]]:
    """Extract (issuer_cik10, accession_number_dashed) pairs from SEC current feed text.

    We look for archive links of the form:
        /Archives/edgar/data/{cik_path}/{accession_nodash}/

    cik_path is the integer CIK (no leading zeros).
    accession_nodash is 18 digits.
    """

    pairs: List[Tuple[str, str]] = []

    # Common pattern in both Atom and HTML pages
    for m in re.finditer(r"/Archives/edgar/data/(\d+)/(\d{18})/", text):
        cik_path = m.group(1)
        acc_nd = m.group(2)
        issuer_cik10 = str(int(cik_path)).zfill(10)
        accession = f"{acc_nd[:10]}-{acc_nd[10:12]}-{acc_nd[12:]}"
        pairs.append((issuer_cik10, accession))

    # Fallback: sometimes links omit trailing slash
    for m in re.finditer(r"/Archives/edgar/data/(\d+)/(\d{18})\b", text):
        cik_path = m.group(1)
        acc_nd = m.group(2)
        issuer_cik10 = str(int(cik_path)).zfill(10)
        accession = f"{acc_nd[:10]}-{acc_nd[10:12]}-{acc_nd[12:]}"
        pairs.append((issuer_cik10, accession))

    # De-dupe in order
    seen: Set[Tuple[str, str]] = set()
    out: List[Tuple[str, str]] = []
    for p in pairs:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def poll_sec_current_form4_and_enqueue(conn, cfg: Config) -> Dict[str, Any]:
    """Poll SEC "current" Form 4 feed and enqueue ingestion jobs for tracked issuers.

    "Tracked" issuers are those present in issuer_master with a current_ticker.
    This keeps the poller scoped to your universe (e.g., tickers.txt import).
    """

    # Load tracked issuers
    tracked_rows = conn.execute(
        """
        SELECT issuer_cik
        FROM issuer_master
        WHERE current_ticker IS NOT NULL AND current_ticker <> ''
        """
    ).fetchall()
    tracked = {str(r["issuer_cik"]) for r in tracked_rows}

    if not tracked:
        return {"tracked_issuers": 0, "feed_entries": 0, "enqueued": 0, "note": "no_tracked_issuers"}

    url = cfg.FORM4_POLLER_FEED_URL
    if not url:
        raise RuntimeError("FORM4_POLLER_FEED_URL is not set")

    headers = {"User-Agent": cfg.SEC_USER_AGENT}
    _debug(f"Polling SEC feed: {url}")
    r = requests.get(url, headers=headers, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"SEC feed error {r.status_code}: {r.text[:500]}")

    text = r.text or ""
    pairs = _extract_archives_pairs(text)

    # Filter to tracked + not already in filings
    # (Keep it simple: check filings table to avoid unnecessary queue spam)
    enqueued = 0
    for issuer_cik10, accession in pairs:
        if issuer_cik10 not in tracked:
            continue

        exists = conn.execute(
            "SELECT 1 FROM filings WHERE accession_number=? LIMIT 1", (accession,)
        ).fetchone()
        if exists:
            continue

        # IMPORTANT: Poller-discovered filings are "new" by definition. We only request AI
        # generation for these new filings to avoid expensive AI calls during backfills/reparses.
        enqueue_job(
            conn,
            job_type="FETCH_ACCESSION_DOCS",
            dedupe_key=f"FETCH|{accession}",
            payload={
                "accession_number": accession,
                "issuer_cik_hint": issuer_cik10,
                "ingest_source": "poller",
                "ai_requested": True,
            },
            # Higher priority so new filings are processed ahead of large historical backfills.
            priority=100,
            requeue_if_exists=False,
        )
        enqueued += 1

    now = utcnow_iso()
    upsert_app_config(conn, "form4_poller_last_run_utc", now)

    return {
        "tracked_issuers": len(tracked),
        "feed_entries": len(pairs),
        "enqueued": enqueued,
    }

import sys
from pathlib import Path
from typing import List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import requests

from insider_platform.config import load_config
from insider_platform.db import connect
from insider_platform.jobs.queue import enqueue_job


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/enqueue_ingest_issuer.py <issuer_cik_10digits> [limit]")
        sys.exit(2)

    issuer_cik = "".join(ch for ch in sys.argv[1] if ch.isdigit()).zfill(10)
    limit = int(sys.argv[2]) if len(sys.argv) >= 3 else 200

    cfg = load_config()

    url = f"https://data.sec.gov/submissions/CIK{issuer_cik}.json"
    print(f"Fetching {url}")
    r = requests.get(url, headers={"User-Agent": cfg.SEC_USER_AGENT}, timeout=60)
    if r.status_code != 200:
        raise SystemExit(f"SEC error {r.status_code}: {r.text}")

    data = r.json()
    recent = (data.get("filings") or {}).get("recent") or {}
    accs: List[str] = recent.get("accessionNumber") or []
    forms: List[str] = recent.get("form") or []

    pairs = []
    for a, f in zip(accs, forms):
        if not a or not f:
            continue
        if str(f).startswith("4"):
            pairs.append(str(a))

    accessions = pairs[:limit]
    print(f"Found {len(accessions)} Form 4 accessions (limit={limit})")

    with connect(cfg.DB_DSN) as conn:
        for acc in accessions:
            enqueue_job(
                conn,
                job_type="FETCH_ACCESSION_DOCS",
                dedupe_key=f"FETCH|{acc}",
                payload={
                    "accession_number": acc,
                    "issuer_cik": issuer_cik,
                },
                priority=5,
            )

    print("Enqueued.")


if __name__ == "__main__":
    main()

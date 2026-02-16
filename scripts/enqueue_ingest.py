import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from insider_platform.config import load_config
from insider_platform.db import connect
from insider_platform.jobs.queue import enqueue_job


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/enqueue_ingest.py <accession_number>")
        sys.exit(2)

    accession = sys.argv[1].strip()
    cfg = load_config()

    with connect(cfg.DB_DSN) as conn:
        enqueue_job(
            conn,
            job_type="FETCH_ACCESSION_DOCS",
            dedupe_key=f"FETCH|{accession}",
            payload={"accession_number": accession},
            priority=1,
        )

    print(f"Enqueued ingest: {accession}")


if __name__ == "__main__":
    main()

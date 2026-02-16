import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from insider_platform.config import load_config
from insider_platform.db import connect
from insider_platform.jobs.queue import enqueue_job


def _enqueue_for_issuer(conn, issuer_cik: str, start_year: int, batch_size: int) -> None:
    issuer_cik = str(issuer_cik).strip().zfill(10)

    enqueue_job(
        conn,
        job_type="BACKFILL_DISCOVER_ISSUER",
        dedupe_key=f"BACKFILL_DISCOVER|{issuer_cik}|{start_year}",
        payload={"issuer_cik": issuer_cik, "start_year": start_year, "batch_size": batch_size},
        priority=3,
        requeue_if_exists=True,
    )


def main() -> None:
    p = argparse.ArgumentParser(description="Enqueue a historical backfill for a ticker, issuer CIK, or all issuers.")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--ticker", type=str, help="Ticker symbol (must exist in issuer_master.current_ticker)")
    g.add_argument("--issuer-cik", type=str, help="Issuer CIK (10 digits preferred)")
    g.add_argument("--all", action="store_true", help="Backfill all issuers in issuer_master")

    p.add_argument("--start-year", type=int, default=None, help="Earliest filing year to backfill (default from config)")
    p.add_argument("--batch-size", type=int, default=None, help="How many accessions to enqueue per batch (default from config)")
    args = p.parse_args()

    cfg = load_config()
    start_year = int(args.start_year or cfg.BACKFILL_START_YEAR)
    batch_size = int(args.batch_size or cfg.BACKFILL_BATCH_SIZE)

    with connect(cfg.DB_DSN) as conn:
        # Always ensure benchmark prices are queued once
        enqueue_job(
            conn,
            job_type="FETCH_BENCHMARK_PRICES",
            dedupe_key=f"BENCH_PRICES|{cfg.BENCHMARK_SYMBOL}",
            payload={"symbol": cfg.BENCHMARK_SYMBOL},
            priority=1,
            requeue_if_exists=True,
        )

        if args.all:
            rows = conn.execute(
                """
                SELECT DISTINCT issuer_cik
                FROM issuer_master
                WHERE issuer_cik IS NOT NULL
                ORDER BY issuer_cik
                """
            ).fetchall()

            if not rows:
                raise SystemExit("No issuers found in issuer_master.")

            for r in rows:
                _enqueue_for_issuer(conn, r["issuer_cik"], start_year, batch_size)

            print(f"Enqueued backfill for {len(rows)} issuers start_year={start_year} batch_size={batch_size}")
            return

        if args.ticker:
            t = args.ticker.strip().upper()
            row = conn.execute(
                "SELECT issuer_cik FROM issuer_master WHERE current_ticker=?",
                (t,),
            ).fetchone()
            if row is None:
                raise SystemExit(f"Ticker not found in issuer_master: {t}")
            issuer_cik = str(row["issuer_cik"]).zfill(10)
        else:
            issuer_cik = str(args.issuer_cik).strip().zfill(10)

        _enqueue_for_issuer(conn, issuer_cik, start_year, batch_size)
        print(f"Enqueued backfill issuer_cik={issuer_cik} start_year={start_year} batch_size={batch_size}")


if __name__ == "__main__":
    main()

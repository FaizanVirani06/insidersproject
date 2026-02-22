import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from insider_platform.config import load_config
from insider_platform.db import connect, init_db
from insider_platform.jobs.queue import enqueue_job


def _enqueue(conn, ticker: str, *, priority: int = 50, requeue: bool = True) -> None:
    t = (ticker or "").strip().upper()
    if not t:
        return
    enqueue_job(
        conn,
        job_type="FETCH_MARKET_CAP_FOR_TICKER",
        dedupe_key=f"MCAP|{t}",
        payload={"ticker": t},
        priority=int(priority),
        requeue_if_exists=bool(requeue),
    )


def main() -> None:
    p = argparse.ArgumentParser(
        description="Enqueue market cap + fundamentals fetch jobs (EODHD) so sector/beta/market cap cache stays up to date."
    )
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--ticker", type=str, help="Single ticker symbol")
    g.add_argument("--all", action="store_true", help="Enqueue for all tickers in issuer_master")

    p.add_argument(
        "--force",
        action="store_true",
        help="Enqueue for all tickers regardless of whether fundamentals already exist",
    )
    p.add_argument(
        "--priority",
        type=int,
        default=50,
        help="Job priority (higher runs sooner). Default: 50",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on number of tickers when using --all (useful for testing)",
    )
    args = p.parse_args()

    cfg = load_config()
    init_db(cfg.DB_DSN)

    with connect(cfg.DB_DSN) as conn:
        if args.ticker:
            _enqueue(conn, args.ticker, priority=args.priority, requeue=True)
            print(f"Enqueued market cap job for ticker={args.ticker.strip().upper()}")
            return

        # --all
        if args.force:
            rows = conn.execute(
                """
                SELECT DISTINCT current_ticker AS ticker
                FROM issuer_master
                WHERE current_ticker IS NOT NULL AND current_ticker <> ''
                ORDER BY current_ticker
                """
            ).fetchall()
        else:
            # Only enqueue tickers missing sector/beta (or missing row entirely)
            rows = conn.execute(
                """
                SELECT DISTINCT im.current_ticker AS ticker
                FROM issuer_master im
                LEFT JOIN issuer_fundamentals_cache f
                  ON f.ticker = im.current_ticker
                WHERE im.current_ticker IS NOT NULL AND im.current_ticker <> ''
                  AND (
                        f.ticker IS NULL
                     OR f.sector IS NULL
                     OR f.beta IS NULL
                  )
                ORDER BY im.current_ticker
                """
            ).fetchall()

        tickers = [str(r["ticker"]).strip().upper() for r in rows if r.get("ticker")]
        if args.limit is not None:
            tickers = tickers[: int(args.limit)]

        for t in tickers:
            _enqueue(conn, t, priority=args.priority, requeue=True)

        print(f"Enqueued market cap jobs for {len(tickers)} tickers (force={bool(args.force)})")


if __name__ == "__main__":
    main()

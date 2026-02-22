"""Import a ticker universe (tickers.txt) into issuer_master.

This lets the app treat issuer_master as the *tracked universe* of issuers.
Once populated, you can enable the Form 4 poller (ENABLE_FORM4_POLLER=1) so
new filings are automatically discovered and ingested.

Usage:
  python scripts/import_tickers.py --file tickers.txt

Notes:
  - The input file is expected to contain one ticker per line.
  - The mapping from ticker -> CIK is fetched from the SEC's company tickers JSON.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from insider_platform.config import Config
from insider_platform.db import connect, init_db
from insider_platform.sec.tickers import fetch_sec_company_tickers, resolve_ticker_to_cik10
from insider_platform.util.time import utcnow_iso


def _read_tickers_file(path: Path) -> list[str]:
    tickers: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        # Support simple CSV/TSV/whitespace-separated formats by taking the first token.
        for delim in (",", "\t", ";", "|"):
            if delim in t:
                t = t.split(delim, 1)[0].strip()
                break
        t = t.strip().strip('"').strip("'")
        if not t:
            continue
        if t.lower() in {"ticker", "symbol"}:
            continue
        tickers.append(t.upper())
    return tickers


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="tickers.txt", help="Path to tickers file")
    args = parser.parse_args()

    cfg = Config()  # reads env
    init_db(cfg.DB_DSN)

    tickers_path = Path(args.file)
    tickers = _read_tickers_file(tickers_path)
    if not tickers:
        print(f"No tickers found in {tickers_path}")
        return

    print(f"Loading SEC ticker map...")
    ticker_map = fetch_sec_company_tickers(cfg.SEC_USER_AGENT)
    now = utcnow_iso()

    inserted = 0
    updated = 0
    missing: list[str] = []

    with connect(cfg.DB_DSN) as conn:
        for t in tickers:
            rec = resolve_ticker_to_cik10(ticker_map, t)
            if rec is None:
                missing.append(t)
                continue

            # Upsert into issuer_master.
            # We intentionally do NOT touch last_filing_date here.
            cur = conn.execute(
                """
                INSERT INTO issuer_master (
                    issuer_cik, current_ticker, ticker_updated_at, issuer_name, last_filing_date
                ) VALUES (?,?,?,?,NULL)
                ON CONFLICT(issuer_cik) DO UPDATE SET
                    current_ticker=excluded.current_ticker,
                    ticker_updated_at=excluded.ticker_updated_at,
                    issuer_name=COALESCE(excluded.issuer_name, issuer_master.issuer_name)
                """,
                (rec.cik10, rec.ticker, now, rec.title),
            )
            # DB driver rowcount can vary (insert vs update); best-effort counts:
            if cur.lastrowid:
                inserted += 1
            else:
                updated += 1

        # Store a marker so admins can confirm imports happened.
        # NOTE: some DBs have app_config(key,value) only; newer schema may add updated_at.
        cols = [r[1] for r in conn.execute("PRAGMA table_info(app_config)").fetchall()]
        if "updated_at" in cols:
            conn.execute(
                """
                INSERT INTO app_config(key,value,updated_at)
                VALUES (?,?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
                """,
                ("tickers_imported_at_utc", now, now),
            )
        else:
            conn.execute(
                """
                INSERT INTO app_config(key,value)
                VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
                """,
                ("tickers_imported_at_utc", now),
            )
    print(f"Done. inserted_or_updated={inserted+updated} missing={len(missing)}")
    if missing:
        print("Missing tickers (not found in SEC map), first 50:")
        for t in missing[:50]:
            print("  ", t)


if __name__ == "__main__":
    main()

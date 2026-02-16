from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

import requests


@dataclass(frozen=True)
class SecTickerRecord:
    cik10: str
    ticker: str
    title: str


def fetch_sec_company_tickers(user_agent: str) -> Dict[str, SecTickerRecord]:
    """Return mapping {TICKER -> SecTickerRecord} from SEC company_tickers.json.

    SEC publishes a JSON file mapping tickers to CIKs and company titles.
    """

    url = "https://www.sec.gov/files/company_tickers.json"
    r = requests.get(url, headers={"User-Agent": user_agent}, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"SEC company_tickers.json error {r.status_code}: {r.text[:500]}")

    data = r.json() if r.text else {}
    out: Dict[str, SecTickerRecord] = {}

    # Format is typically { "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ... }
    for _, obj in (data or {}).items():
        if not isinstance(obj, dict):
            continue

        ticker = str(obj.get("ticker") or "").strip().upper()
        title = str(obj.get("title") or "").strip()
        cik_str = obj.get("cik_str")

        if not ticker or cik_str is None:
            continue

        try:
            cik10 = str(int(cik_str)).zfill(10)
        except Exception:
            continue

        out[ticker] = SecTickerRecord(cik10=cik10, ticker=ticker, title=title)

    return out


def resolve_ticker_to_cik10(mapping: Dict[str, SecTickerRecord], ticker: str) -> Optional[SecTickerRecord]:
    """Resolve a ticker to a record using common variants.

    Handles class-share normalization in a forgiving way.
    """

    t = (ticker or "").strip().upper()
    if not t:
        return None

    if t in mapping:
        return mapping[t]

    # Try dot/dash variants
    if "." in t:
        t2 = t.replace(".", "-")
        if t2 in mapping:
            return mapping[t2]
    if "-" in t:
        t2 = t.replace("-", ".")
        if t2 in mapping:
            return mapping[t2]

    return None

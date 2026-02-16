from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests


@dataclass(frozen=True)
class EODRow:
    date: str
    adj_close: float


def _debug(msg: str) -> None:
    print(f"[eodhd] {msg}")


def resolve_symbol(base_url: str, api_key: str, ticker: str) -> str:
    """Resolve a DB ticker to an EODHD symbol.

    If ticker already looks like an EODHD symbol (e.g. AAPL.US, VOD.L), return as-is.
    Else, call the EODHD search endpoint and pick the first match with Exchange == 'US' (fallback: first result).

    This is a judgement call because SEC trading symbols typically do not include exchange.
    """
    t = (ticker or "").strip()
    if not t:
        raise RuntimeError("Ticker is blank; cannot resolve EODHD symbol")
    # Some SEC tickers contain '.' (e.g. BRK.B) but are NOT EODHD symbols.
    # Treat as already-resolved only when it looks like CODE.EXCHANGE (e.g. AAPL.US, VOD.L).
    if "." in t:
        import re
        if re.match(r"^[A-Za-z0-9\-]+\.[A-Za-z]{2,4}$", t):
            return t

    url = f"{base_url.rstrip('/')}/search/{t}"
    params = {"api_token": api_key, "fmt": "json"}
    _debug(f"Resolving symbol via search: {url}")
    r = requests.get(url, params=params, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"EODHD search error {r.status_code}: {r.text}")
    results = r.json() if r.text else []
    if not isinstance(results, list) or not results:
        raise RuntimeError(f"EODHD search returned no results for {t}")

    # Prefer exact code + US exchange
    for it in results:
        code = str(it.get("Code") or it.get("code") or "").strip()
        exch = str(it.get("Exchange") or it.get("exchange") or "").strip()
        if code.upper() == t.upper() and exch.upper() == "US":
            return f"{code.upper()}.{exch.upper()}"

    # Fallback: first entry
    first = results[0]
    code = str(first.get("Code") or first.get("code") or t).strip()
    exch = str(first.get("Exchange") or first.get("exchange") or "US").strip()
    return f"{code.upper()}.{exch.upper()}"


def fetch_eod_prices(
    base_url: str,
    api_key: str,
    symbol: str,
    start_date: str,
    end_date: str,
) -> List[EODRow]:
    """Fetch daily EOD prices from EODHD.

    We use adjusted_close when available.
    """
    url = f"{base_url.rstrip('/')}/eod/{symbol}"
    params = {
        "api_token": api_key,
        "fmt": "json",
        "period": "d",
        "from": start_date,
        "to": end_date,
    }
    _debug(f"Fetching EOD prices: {url} from={start_date} to={end_date}")
    r = requests.get(url, params=params, timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"EODHD eod error {r.status_code}: {r.text}")

    data = r.json()
    if not isinstance(data, list):
        raise RuntimeError(f"EODHD eod returned unexpected payload: {data}")

    out: List[EODRow] = []
    for row in data:
        try:
            d = str(row.get("date") or "").strip()
            if not d:
                continue
            adj = row.get("adjusted_close")
            if adj is None:
                adj = row.get("adj_close")
            if adj is None:
                adj = row.get("close")
            if adj is None:
                continue
            out.append(EODRow(date=d, adj_close=float(adj)))
        except Exception:
            continue

    if not out:
        raise RuntimeError(f"No price rows returned for symbol {symbol}")

    return out

def fetch_fundamentals(
    base_url: str,
    api_key: str,
    symbol: str,
) -> Dict[str, Any]:
    """Fetch fundamentals payload for a symbol.

    Docs: https://eodhd.com/api/fundamentals/{SYMBOL.EXCHANGE}?api_token=...&fmt=json
    """
    url = f"{base_url.rstrip('/')}/fundamentals/{symbol}"
    params = {"api_token": api_key, "fmt": "json"}
    _debug(f"Fetching fundamentals: {url}")
    r = requests.get(url, params=params, timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"EODHD fundamentals error {r.status_code}: {r.text}")
    data = r.json() if r.text else {}
    if not isinstance(data, dict):
        raise RuntimeError(f"EODHD fundamentals returned unexpected payload: {data}")
    return data


def fetch_news(
    base_url: str,
    api_key: str,
    *,
    symbol: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch financial news + sentiment.

    Endpoint: GET /news
    Requires either `symbol` (s=) or `tag` (t=).
    """
    if not symbol and not tag:
        raise RuntimeError("fetch_news requires either symbol or tag")

    url = f"{base_url.rstrip('/')}/news"
    params: Dict[str, Any] = {
        "api_token": api_key,
        "fmt": "json",
        "limit": int(limit),
        "offset": int(offset),
    }
    if symbol:
        params["s"] = symbol
    if tag:
        params["t"] = tag
    if date_from:
        params["from"] = date_from
    if date_to:
        params["to"] = date_to

    _debug(f"Fetching news: {url} symbol={symbol} tag={tag} limit={limit} offset={offset}")
    r = requests.get(url, params=params, timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"EODHD news error {r.status_code}: {r.text}")

    data = r.json() if r.text else []
    if not isinstance(data, list):
        raise RuntimeError(f"EODHD news returned unexpected payload: {data}")
    return data

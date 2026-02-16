from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from insider_platform.config import Config
from insider_platform.eodhd.client import fetch_news, resolve_symbol
from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[news] {msg}")


def _iso_date(days_ago: int) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=int(days_ago))
    return dt.date().isoformat()


def _is_fresh(ts: Optional[str], *, max_age_hours: int) -> bool:
    if not ts:
        return False
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return False
    return (datetime.now(timezone.utc) - dt) <= timedelta(hours=int(max_age_hours))


def fetch_and_store_news(conn: Any, cfg: Config, ticker: str) -> None:
    """Fetch recent news for a ticker from EODHD and cache it.

    Endpoint: GET https://eodhd.com/api/news?s={SYMBOL}&limit=...&offset=...&api_token=...&fmt=json
    """
    t = (ticker or "").strip().upper()
    if not t:
        raise RuntimeError("Ticker is blank")

    # If we've fetched recently, skip.
    row = conn.execute(
        "SELECT MAX(fetched_at) AS last_fetch FROM issuer_news WHERE ticker=?",
        (t,),
    ).fetchone()
    last_fetch = row["last_fetch"] if row else None
    if _is_fresh(last_fetch, max_age_hours=cfg.NEWS_MAX_AGE_HOURS):
        _debug(f"News cache hit ticker={t} fetched_at={last_fetch}")
        return

    symbol = resolve_symbol(cfg.EODHD_BASE_URL, cfg.EODHD_API_KEY, t)

    # Pull last ~30 days of headlines (tunable)
    date_from = _iso_date(30)
    date_to = datetime.now(timezone.utc).date().isoformat()

    items = fetch_news(
        cfg.EODHD_BASE_URL,
        cfg.EODHD_API_KEY,
        symbol=symbol,
        limit=50,
        offset=0,
        date_from=date_from,
        date_to=date_to,
    )

    fetched_at = utcnow_iso()
    inserted = 0

    for it in items:
        try:
            url = str(it.get("link") or it.get("url") or "").strip()
            if not url:
                continue
            title = str(it.get("title") or "").strip() or None
            source = str(it.get("source") or it.get("site") or "").strip() or None
            published_at = str(it.get("date") or it.get("datetime") or it.get("published_at") or "").strip() or None
            summary = str(it.get("content") or it.get("text") or it.get("summary") or "").strip() or None

            sentiment_val = None
            sent = it.get("sentiment")
            if isinstance(sent, dict):
                # Common: polarity / score
                for k in ("polarity", "score", "compound"):
                    if k in sent:
                        try:
                            sentiment_val = float(sent[k])
                        except Exception:
                            sentiment_val = None
                        break

            conn.execute(
                """
                INSERT INTO issuer_news (ticker, published_at, title, source, url, sentiment, summary, news_json, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ticker, url) DO UPDATE SET
                    published_at=excluded.published_at,
                    title=excluded.title,
                    source=excluded.source,
                    sentiment=excluded.sentiment,
                    summary=excluded.summary,
                    news_json=excluded.news_json,
                    fetched_at=excluded.fetched_at
                """,
                (t, published_at, title, source, url, sentiment_val, summary, json.dumps(it), fetched_at),
            )
            inserted += 1
        except Exception:
            continue

    _debug(f"Updated news ticker={t} symbol={symbol} items={len(items)} upserted={inserted}")

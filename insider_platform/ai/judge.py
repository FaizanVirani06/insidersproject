from __future__ import annotations

import json
import re
import sqlite3
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple, List

from insider_platform.ai.gemini import generate_content
from insider_platform.ai.prompt import build_ai_prompt
from insider_platform.ai.schema import AIValidationError, extract_json_from_text, validate_ai_output
from insider_platform.config import Config
from insider_platform.db import get_app_config
from insider_platform.models import EventKey
from insider_platform.util.hashing import sha256_hex
from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[ai] {msg}")


def _to_bool(x: Any) -> Optional[bool]:
    if x is None:
        return None
    if isinstance(x, bool):
        return x
    if isinstance(x, (int, float)):
        return bool(int(x))
    return None


def _iso_date_diff_days(date_str: str, now_utc: datetime) -> Optional[int]:
    try:
        d = datetime.fromisoformat(date_str)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return int((now_utc - d).total_seconds() // 86400)
    except Exception:
        try:
            d2 = datetime.fromisoformat(date_str + "T00:00:00+00:00")
            return int((now_utc - d2).total_seconds() // 86400)
        except Exception:
            return None


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _norm_title(title: Any) -> str:
    if title is None:
        return ""
    return str(title).strip().lower()


def _is_ceo(title: Any) -> bool:
    t = _norm_title(title)
    if not t:
        return False
    return ("chief executive" in t) or bool(re.search(r"\bceo\b", t))


def _is_cfo(title: Any) -> bool:
    t = _norm_title(title)
    if not t:
        return False
    return ("chief financial" in t) or bool(re.search(r"\bcfo\b", t))


def _is_exec(title: Any) -> bool:
    """Broad exec heuristic (CEO/CFO/COO/President/VP/etc.)."""
    t = _norm_title(title)
    if not t:
        return False
    keywords = [
        "chief ",
        "ceo",
        "cfo",
        "coo",
        "president",
        "vp",
        "vice president",
        "executive",
    ]
    return any(k in t for k in keywords)


def _canonicalize_ai_input_for_hash(ai_input: Dict[str, Any]) -> Dict[str, Any]:
    """Create a stable version of ai_input for hashing/deduping.

    We keep the *content* the model sees unchanged, but we avoid including volatile
    timestamps in the hash so re-runs on the same underlying event do not spam ai_outputs.
    """
    obj = deepcopy(ai_input)

    # Remove volatile "asof" clock-time.
    obj.pop("asof_utc", None)

    # market_cap_staleness_days changes daily; do not let it break dedupe.
    dq = obj.get("data_quality")
    if isinstance(dq, dict) and "market_cap_staleness_days" in dq:
        dq["market_cap_staleness_days"] = None

    return obj


def _try_parse_json(text: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Parse JSON from model output with a couple of tolerant strategies."""
    if not isinstance(text, str) or not text.strip():
        return None, "empty_response"

    # Fast path
    try:
        obj = json.loads(text.strip())
        if isinstance(obj, dict):
            return obj, None
    except Exception:
        pass

    # Fallback: use extractor (first '{' .. last '}')
    try:
        obj = extract_json_from_text(text)
        if isinstance(obj, dict):
            return obj, None
    except Exception as e:
        return None, f"parse_error: {e}"

    return None, "parse_error: unknown"


def _repair_with_model(cfg: Config, ai_input: Dict[str, Any], raw_text: str, error_msg: str) -> str:
    """Ask the model to repair its previous output into valid ai_output_v1 JSON."""
    repair_prompt = (
        "You are repairing an LLM output to match a strict JSON schema.\n"
        "Return ONLY a single JSON object (no markdown, no prose).\n\n"
        "Target schema: ai_output_v1 (see below).\n"
        "Hard rules:\n"
        "- schema_version must be \"ai_output_v1\"\n"
        "- event_key must exactly match the input event identity\n"
        "- If event.buy.has_buy is false => verdict.buy_signal.status must be \"not_applicable\" and rating/confidence/horizon_days/summary must be null\n"
        "- If event.sell.has_sell is false => verdict.sell_signal.status must be \"not_applicable\" and rating/confidence/horizon_days/summary must be null\n"
        "- If status is \"applicable\": rating must be 1.0-10.0 with ONE decimal; confidence 0-1; horizon_days 60 or 180; summary non-empty\n"
        "- field_citations.input_paths MUST reference real paths in ai_input (JSONPath like $.event.buy.shares)\n"
        "- Each risks[].text MUST appear verbatim as a field_citations[].claim\n"
        "- Rating/confidence must stay close to baseline (see ai_input.baseline)\n\n"
        "Validation errors to fix:\n"
        f"{error_msg}\n\n"
        "ai_input (for citations):\n"
        f"{json.dumps(ai_input, ensure_ascii=False)}\n\n"
        "Previous (invalid) output:\n"
        f"{raw_text}\n\n"
        "Return corrected JSON now."
    )

    return generate_content(
        api_key=cfg.GEMINI_API_KEY or "",
        base_url=cfg.GEMINI_BASE_URL,
        model=cfg.GEMINI_MODEL,
        prompt=repair_prompt,
        temperature=0.0,
        max_output_tokens=max(cfg.AI_MAX_TOKENS, 2048),
        retries=2,
        timeout_seconds=60,
    )


def _fetch_filing_footnotes(conn: sqlite3.Connection, issuer_cik: str, accession_number: str) -> List[str]:
    """Best-effort extraction of footnote text from persisted raw rows.

    Parser stores `footnotes` per transaction in raw_payload_json (when available).
    We dedupe and truncate so we don't blow up token budget.
    """
    rows = conn.execute(
        """
        SELECT raw_payload_json FROM form4_rows_raw
        WHERE issuer_cik=? AND accession_number=?
        ORDER BY row_id ASC
        """,
        (issuer_cik, accession_number),
    ).fetchall()

    out: List[str] = []
    seen: set[str] = set()
    for r in rows:
        raw = r["raw_payload_json"]
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        foots = obj.get("footnotes")
        if not isinstance(foots, list):
            continue
        for f in foots:
            if not isinstance(f, str):
                continue
            txt = f.strip()
            if not txt:
                continue
            # normalize whitespace
            txt = re.sub(r"\s+", " ", txt)
            if len(txt) > 400:
                txt = txt[:397] + "..."
            if txt in seen:
                continue
            seen.add(txt)
            out.append(txt)
            if len(out) >= 20:
                return out
    return out


def build_ai_input(conn: sqlite3.Connection, cfg: Config, event_key: EventKey) -> Dict[str, Any]:
    """Build ai_input_v2 JSON from persisted computed fields."""
    row = conn.execute(
        """
        SELECT * FROM insider_events
        WHERE issuer_cik=? AND owner_key=? AND accession_number=?
        """,
        (event_key.issuer_cik, event_key.owner_key, event_key.accession_number),
    ).fetchone()
    if row is None:
        raise RuntimeError(f"Event not found: {event_key}")

    ticker = str(row["ticker"] or "").strip().upper()

    # Market cap (source of truth)
    mcap_row = None
    if ticker:
        mcap_row = conn.execute(
            "SELECT * FROM market_cap_cache WHERE ticker=?",
            (ticker,),
        ).fetchone()

    now_utc = datetime.now(timezone.utc)
    mcap_stale_days = None
    if mcap_row is not None and mcap_row["market_cap_updated_at"]:
        mcap_stale_days = _iso_date_diff_days(mcap_row["market_cap_updated_at"], now_utc)

    issuer_context = {
        "ticker": ticker or None,
        "market_cap": mcap_row["market_cap"] if mcap_row is not None else None,
        "market_cap_bucket": mcap_row["market_cap_bucket"] if mcap_row is not None else None,
        "market_cap_source": mcap_row["market_cap_source"] if mcap_row is not None else None,
        "market_cap_updated_at": mcap_row["market_cap_updated_at"] if mcap_row is not None else None,
    }

    # EODHD fundamentals (cached locally)
    if ticker:
        frow = conn.execute(
            """
            SELECT eodhd_symbol, market_cap, pe_ratio, eps, shares_outstanding, updated_at
            FROM issuer_fundamentals_cache
            WHERE ticker=?
            """,
            (ticker,),
        ).fetchone()
        if frow is not None:
            issuer_context["fundamentals"] = {
                "eodhd_symbol": frow["eodhd_symbol"],
                "market_cap": frow["market_cap"],
                "pe_ratio": frow["pe_ratio"],
                "eps": frow["eps"],
                "shares_outstanding": frow["shares_outstanding"],
                "updated_at": frow["updated_at"],
            }

        # Recent news headlines (cached locally) - keep small to avoid prompt bloat
        nrows = conn.execute(
            """
            SELECT published_at, title, source, url, sentiment
            FROM issuer_news
            WHERE ticker=?
            ORDER BY published_at DESC
            LIMIT 8
            """,
            (ticker,),
        ).fetchall()
        if nrows:
            issuer_context["news"] = [
                {
                    "published_at": r["published_at"],
                    "title": r["title"],
                    "source": r["source"],
                    "url": r["url"],
                    "sentiment": r["sentiment"],
                }
                for r in nrows
            ]

    # Cluster context
    buy_cluster = _fetch_cluster_context(conn, cluster_id=row["cluster_id_buy"], flag=row["cluster_flag_buy"])
    sell_cluster = _fetch_cluster_context(conn, cluster_id=row["cluster_id_sell"], flag=row["cluster_flag_sell"])

    cluster_context = {
        "buy_cluster": buy_cluster,
        "sell_cluster": sell_cluster,
    }

    # Insider stats (stats_v2 = excess vs benchmark)
    stats_buy = _fetch_stats(conn, event_key.issuer_cik, event_key.owner_key, "buy")
    stats_sell = _fetch_stats(conn, event_key.issuer_cik, event_key.owner_key, "sell")

    benchmark_symbol = (get_app_config(conn, "benchmark_symbol_resolved") or cfg.BENCHMARK_SYMBOL or "").strip() or "SPY.US"

    insider_stats = {
        "buy": stats_buy,
        "sell": stats_sell,
        "notes": "avg_return_* are excess returns vs benchmark (trade_return - benchmark_return); see $.benchmark.symbol",
    }

    # Trend context (event-level)
    trend_missing = row["trend_missing_reason"] is not None and row["trend_missing_reason"] != ""
    trend_context = {
        "price_reference": {
            "trade_date": row["event_trade_date"],
            "nearest_trading_date": row["trend_anchor_trading_date"],
            "close": row["trend_close"],
        },
        "pre_returns": {
            "ret_20d": row["trend_ret_20d"],
            "ret_60d": row["trend_ret_60d"],
        },
        "range_position": {
            "dist_52w_high": row["trend_dist_52w_high"],
            "dist_52w_low": row["trend_dist_52w_low"],
        },
        "moving_averages": {
            "above_sma_50": _to_bool(row["trend_above_sma_50"]),
            "above_sma_200": _to_bool(row["trend_above_sma_200"]),
        },
    }

    def _side_payload(side: str) -> Dict[str, Any]:
        if side == "buy":
            has_side = bool(row["has_buy"])
            trade_date = row["buy_trade_date"]
            shares = row["buy_shares_total"]
            dollars = row["buy_dollars_total"]
            vwap = row["buy_vwap_price"]
            after = row["buy_shares_owned_following"]
        else:
            has_side = bool(row["has_sell"])
            trade_date = row["sell_trade_date"]
            shares = row["sell_shares_total"]
            dollars = row["sell_dollars_total"]
            vwap = row["sell_vwap_price"]
            after = row["sell_shares_owned_following"]

        before = None
        pct = None
        multiple = None
        trade_value_pct_mcap = None

        if isinstance(shares, (int, float)) and isinstance(after, (int, float)) and float(shares) > 0:
            if side == "buy":
                before = float(after) - float(shares)
            else:
                before = float(after) + float(shares)

            if before is not None and before > 0:
                pct = (float(shares) / float(before)) * 100.0
                multiple = float(after) / float(before)

        mcap_val = issuer_context.get("market_cap")
        if isinstance(dollars, (int, float)) and isinstance(mcap_val, (int, float)):
            if float(dollars) > 0 and float(mcap_val) > 0:
                trade_value_pct_mcap = (float(dollars) / float(mcap_val)) * 100.0

        return {
            "has_" + side: has_side,
            "trade_date": trade_date,
            "shares": shares,
            "dollars": dollars,
            "vwap_price": vwap,

            # For context without requiring the model to do arithmetic:
            "trade_value_pct_market_cap": trade_value_pct_mcap,

            # Unambiguous holdings context:
            "shares_owned_before_estimate": before,
            "shares_owned_after": after,
            "holdings_change_pct": pct,               # percent units (190 means 190%)
            "holdings_change_multiple": multiple,     # after/before (2.9 means 2.9x)
        }

    # Event
    event = {
        "issuer_cik": row["issuer_cik"],
        "ticker": row["ticker"],
        "accession_number": row["accession_number"],
        "filing_date": row["filing_date"],
        "event_trade_date": row["event_trade_date"],
        "owner_key": row["owner_key"],
        "owner_cik": row["owner_cik"],
        "owner_name": row["owner_name_display"],
        "owner_title": row["owner_title"],
        "is_officer": _to_bool(row["is_officer"]),
        "is_director": _to_bool(row["is_director"]),
        "is_ten_percent_owner": _to_bool(row["is_ten_percent_owner"]),
        "buy": _side_payload("buy"),
        "sell": _side_payload("sell"),
        "other_activity_summary": {
            "non_open_market_row_count": row["non_open_market_row_count"],
            "derivative_row_count": row["derivative_row_count"],
            "notes": None,
        },
    }

    # Insider / issuer context the model cannot infer reliably without arithmetic.
    insider_history = _fetch_insider_history(
        conn,
        issuer_cik=event_key.issuer_cik,
        owner_key=event_key.owner_key,
        current_filing_date=row["filing_date"],
        current_accession=row["accession_number"],
    )
    issuer_recent_activity = _fetch_issuer_recent_activity(
        conn,
        issuer_cik=event_key.issuer_cik,
        current_filing_date=row["filing_date"],
        current_accession=row["accession_number"],
    )

    data_quality = {
        "buy_vwap_is_partial": _to_bool(row["buy_vwap_is_partial"]),
        "sell_vwap_is_partial": _to_bool(row["sell_vwap_is_partial"]),
        "pct_holdings_change_missing": {
            "buy": row["buy_pct_holdings_change"] is None,
            "sell": row["sell_pct_holdings_change"] is None,
        },
        "trend_missing": trend_missing,
        "trend_missing_reason": row["trend_missing_reason"],
        "market_cap_staleness_days": mcap_stale_days,
    }

    filing_context = {
        "footnotes": _fetch_filing_footnotes(conn, event_key.issuer_cik, event_key.accession_number),
        "notes": "Footnotes are extracted from the filing when available; treat as context, not as definitive intent.",
    }

    ai_input: Dict[str, Any] = {
        "schema_version": cfg.AI_INPUT_SCHEMA_VERSION,
        "asof_utc": utcnow_iso(),
        "event": event,
        "issuer_context": issuer_context,
        "cluster_context": cluster_context,
        "insider_stats": insider_stats,
        "insider_history": insider_history,
        "issuer_recent_activity": issuer_recent_activity,
        "trend_context": trend_context,
        "data_quality": data_quality,
        "benchmark": {"symbol": benchmark_symbol},
        "filing_context": filing_context,
    }

    # Deterministic baseline to reduce model-to-model variance.
    ai_input["baseline"] = _compute_baseline_signals(ai_input)
    return ai_input


def run_ai_for_event(conn: sqlite3.Connection, cfg: Config, event_key: EventKey, *, force: bool = False) -> None:
    """Run Gemini judging for a single event and persist output."""
    if not cfg.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")

    ai_input = build_ai_input(conn, cfg, event_key)
    ai_input_hashable = _canonicalize_ai_input_for_hash(ai_input)
    inputs_hash = sha256_hex(json.dumps(ai_input_hashable, sort_keys=True, separators=(",", ":"), ensure_ascii=False))

    # Dedupe: if we already have an ai_outputs row for this inputs_hash + prompt_version, skip
    # unless force=True (admin re-run)
    if not force:
        existing = conn.execute(
            """
            SELECT ai_output_id FROM ai_outputs
            WHERE issuer_cik=? AND owner_key=? AND accession_number=?
              AND inputs_hash=? AND prompt_version=?
            ORDER BY ai_output_id DESC LIMIT 1
            """,
            (event_key.issuer_cik, event_key.owner_key, event_key.accession_number, inputs_hash, cfg.PROMPT_VERSION),
        ).fetchone()
        if existing is not None:
            _debug(f"Skipping AI (already judged for same inputs_hash): {event_key}")
            return

    prompt = build_ai_prompt(ai_input)
    _debug(f"Running Gemini for {event_key} (inputs_hash={inputs_hash[:12]})")

    raw_text = generate_content(
        api_key=cfg.GEMINI_API_KEY,
        base_url=cfg.GEMINI_BASE_URL,
        model=cfg.GEMINI_MODEL,
        prompt=prompt,
        temperature=cfg.AI_TEMPERATURE,
        max_output_tokens=cfg.AI_MAX_TOKENS,
        retries=3,
        timeout_seconds=60,
    )

    ai_output, parse_err = _try_parse_json(raw_text)
    if ai_output is None:
        # One repair attempt even for parse failures: Gemini sometimes emits
        # prose/near-JSON despite responseMimeType hints.
        _debug(f"AI output parse failed; attempting repair: {parse_err}")
        repaired_text = _repair_with_model(cfg, ai_input, raw_text, str(parse_err or "parse_failed"))
        ai_output2, parse_err2 = _try_parse_json(repaired_text)
        if ai_output2 is None:
            raise AIValidationError(parse_err2 or parse_err or "Failed to parse JSON")
        validate_ai_output(ai_output2, ai_input)
        ai_output = ai_output2
        raw_text = repaired_text

    try:
        validate_ai_output(ai_output, ai_input)
    except Exception as e:
        # One repair attempt
        _debug(f"AI output failed validation; attempting repair: {e}")
        repaired_text = _repair_with_model(cfg, ai_input, raw_text, str(e))
        ai_output2, parse_err2 = _try_parse_json(repaired_text)
        if ai_output2 is None:
            raise AIValidationError(parse_err2 or "Failed to parse repaired JSON")
        validate_ai_output(ai_output2, ai_input)
        ai_output = ai_output2
        raw_text = repaired_text

    buy_rating = ai_output["verdict"]["buy_signal"].get("rating")
    sell_rating = ai_output["verdict"]["sell_signal"].get("rating")
    # Store a single confidence as max of both, else null
    conf_buy = ai_output["verdict"]["buy_signal"].get("confidence")
    conf_sell = ai_output["verdict"]["sell_signal"].get("confidence")
    conf = None
    if isinstance(conf_buy, (int, float)):
        conf = float(conf_buy)
    if isinstance(conf_sell, (int, float)):
        conf = max(conf, float(conf_sell)) if conf is not None else float(conf_sell)

    generated_at = ai_output.get("generated_at_utc")

    conn.execute(
        """
        INSERT INTO ai_outputs (
            issuer_cik, owner_key, accession_number,
            model_id, prompt_version,
            input_schema_version, output_schema_version,
            inputs_hash, buy_rating, sell_rating, confidence,
            input_json,
            output_json, generated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            event_key.issuer_cik,
            event_key.owner_key,
            event_key.accession_number,
            cfg.GEMINI_MODEL,
            cfg.PROMPT_VERSION,
            cfg.AI_INPUT_SCHEMA_VERSION,
            cfg.AI_OUTPUT_SCHEMA_VERSION,
            inputs_hash,
            buy_rating,
            sell_rating,
            conf,
            json.dumps(ai_input, ensure_ascii=False, sort_keys=True),
            json.dumps(ai_output, ensure_ascii=False, sort_keys=True),
            generated_at,
        ),
    )

    # Denormalize onto insider_events for fast UI
    conn.execute(
        """
        UPDATE insider_events
        SET ai_buy_rating=?, ai_sell_rating=?, ai_confidence=?,
            ai_model_id=?, ai_prompt_version=?, ai_generated_at=?, ai_computed_at=?
        WHERE issuer_cik=? AND owner_key=? AND accession_number=?
        """,
        (
            buy_rating,
            sell_rating,
            conf,
            cfg.GEMINI_MODEL,
            cfg.PROMPT_VERSION,
            generated_at,
            utcnow_iso(),
            event_key.issuer_cik,
            event_key.owner_key,
            event_key.accession_number,
        ),
    )

    _debug(f"Stored AI output for {event_key}")


def _fetch_cluster_context(conn: sqlite3.Connection, cluster_id: Any, flag: Any) -> Dict[str, Any]:
    # cluster_flag may be null if not yet computed
    if flag is None:
        return {
            "cluster_flag": False,
            "cluster_id": None,
            "window_days": 14,
            "unique_insiders": None,
            "total_dollars": None,
            "execs_involved": None,
            "max_pct_holdings_change": None,
        }

    if int(flag) == 0 or not cluster_id:
        return {
            "cluster_flag": False,
            "cluster_id": None,
            "window_days": 14,
            "unique_insiders": None,
            "total_dollars": None,
            "execs_involved": None,
            "max_pct_holdings_change": None,
        }

    row = conn.execute("SELECT * FROM clusters WHERE cluster_id=?", (str(cluster_id),)).fetchone()
    if row is None:
        return {
            "cluster_flag": True,
            "cluster_id": str(cluster_id),
            "window_days": 14,
            "unique_insiders": None,
            "total_dollars": None,
            "execs_involved": None,
            "max_pct_holdings_change": None,
        }

    return {
        "cluster_flag": True,
        "cluster_id": row["cluster_id"],
        "window_days": 14,
        "unique_insiders": row["unique_insiders"],
        "total_dollars": row["total_dollars"],
        "execs_involved": bool(row["execs_involved"]),
        "max_pct_holdings_change": row["max_pct_holdings_change"],
    }


def _fetch_stats(conn: sqlite3.Connection, issuer_cik: str, owner_key: str, side: str) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM insider_issuer_stats WHERE issuer_cik=? AND owner_key=? AND side=?",
        (issuer_cik, owner_key, side),
    ).fetchone()

    if row is None:
        return {
            "eligible_n_60d": 0,
            "win_rate_60d": None,
            "avg_return_60d": None,
            "eligible_n_180d": 0,
            "win_rate_180d": None,
            "avg_return_180d": None,
        }

    return {
        "eligible_n_60d": row["eligible_n_60d"],
        "win_rate_60d": row["win_rate_60d"],
        "avg_return_60d": row["avg_return_60d"],
        "eligible_n_180d": row["eligible_n_180d"],
        "win_rate_180d": row["win_rate_180d"],
        "avg_return_180d": row["avg_return_180d"],
    }


def _fetch_insider_history(
    conn: sqlite3.Connection,
    issuer_cik: str,
    owner_key: str,
    current_filing_date: Optional[str],
    current_accession: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        cur_date = date.fromisoformat(str(current_filing_date)) if current_filing_date else None
    except Exception:
        cur_date = None

    if cur_date is None:
        return {
            "window_years": None,
            "history_scope": "all_prior_before_current_filing",
            "prior_buy_events_total": None,
            "prior_sell_events_total": None,
            "prior_buy_events_12m": None,
            "prior_sell_events_12m": None,
            "last_buy_filing_date": None,
            "last_sell_filing_date": None,
        }

    cutoff_12m = (cur_date - timedelta(days=365)).isoformat()

    exclude_sql = ""
    params: list[Any] = [issuer_cik, owner_key, cur_date.isoformat()]
    if current_accession:
        exclude_sql = " AND accession_number <> ? "
        params.append(str(current_accession))

    row = conn.execute(
        f"""
        SELECT
          SUM(CASE WHEN has_buy=1 THEN 1 ELSE 0 END) AS prior_buy_events_total,
          SUM(CASE WHEN has_sell=1 THEN 1 ELSE 0 END) AS prior_sell_events_total,
          SUM(CASE WHEN has_buy=1 AND filing_date>=? THEN 1 ELSE 0 END) AS prior_buy_events_12m,
          SUM(CASE WHEN has_sell=1 AND filing_date>=? THEN 1 ELSE 0 END) AS prior_sell_events_12m
        FROM insider_events
        WHERE issuer_cik=? AND owner_key=?
          AND filing_date<?
          {exclude_sql}
        """,
        (cutoff_12m, cutoff_12m, *params),
    ).fetchone()

    # Last buy/sell filing dates
    row_last_buy = conn.execute(
        f"""
        SELECT MAX(filing_date) AS d
        FROM insider_events
        WHERE issuer_cik=? AND owner_key=? AND has_buy=1
          AND filing_date<?
          {exclude_sql}
        """,
        (issuer_cik, owner_key, cur_date.isoformat(), *( [str(current_accession)] if current_accession else [] )),
    ).fetchone()
    row_last_sell = conn.execute(
        f"""
        SELECT MAX(filing_date) AS d
        FROM insider_events
        WHERE issuer_cik=? AND owner_key=? AND has_sell=1
          AND filing_date<?
          {exclude_sql}
        """,
        (issuer_cik, owner_key, cur_date.isoformat(), *( [str(current_accession)] if current_accession else [] )),
    ).fetchone()

    return {
        "window_years": None,
        "history_scope": "all_prior_before_current_filing",
        "prior_buy_events_total": (row["prior_buy_events_total"] if row is not None else None),
        "prior_sell_events_total": (row["prior_sell_events_total"] if row is not None else None),
        "prior_buy_events_12m": (row["prior_buy_events_12m"] if row is not None else None),
        "prior_sell_events_12m": (row["prior_sell_events_12m"] if row is not None else None),
        "last_buy_filing_date": (row_last_buy["d"] if row_last_buy is not None else None),
        "last_sell_filing_date": (row_last_sell["d"] if row_last_sell is not None else None),
    }


def _fetch_issuer_recent_activity(
    conn: sqlite3.Connection,
    issuer_cik: str,
    current_filing_date: Optional[str],
    current_accession: Optional[str] = None,
) -> Dict[str, Any]:
    try:
        cur_date = date.fromisoformat(str(current_filing_date)) if current_filing_date else None
    except Exception:
        cur_date = None

    if cur_date is None:
        return {
            "window_days": 30,
            "events_total": None,
            "buy_events": None,
            "sell_events": None,
            "unique_insiders": None,
        }

    cutoff_30 = (cur_date - timedelta(days=30)).isoformat()

    exclude_sql = ""
    params: list[Any] = [issuer_cik, cutoff_30, cur_date.isoformat()]
    if current_accession:
        exclude_sql = " AND accession_number <> ? "
        params.append(str(current_accession))

    row = conn.execute(
        f"""
        SELECT
          COUNT(*) AS events_total,
          SUM(CASE WHEN has_buy=1 THEN 1 ELSE 0 END) AS buy_events,
          SUM(CASE WHEN has_sell=1 THEN 1 ELSE 0 END) AS sell_events,
          COUNT(DISTINCT owner_key) AS unique_insiders
        FROM insider_events
        WHERE issuer_cik=?
          AND filing_date>=?
          AND filing_date<?
          {exclude_sql}
        """,
        params,
    ).fetchone()

    return {
        "window_days": 30,
        "events_total": row["events_total"] if row is not None else None,
        "buy_events": row["buy_events"] if row is not None else None,
        "sell_events": row["sell_events"] if row is not None else None,
        "unique_insiders": row["unique_insiders"] if row is not None else None,
    }


def _compute_baseline_signals(ai_input: Dict[str, Any]) -> Dict[str, Any]:
    """Cheap, deterministic baseline scoring.

    This is meant to *stabilize* the rating/confidence across models and prompt tweaks.
    The model should use this as an anchor rather than guessing from scratch.
    """

    event = ai_input.get("event") or {}
    issuer_context = ai_input.get("issuer_context") or {}
    cluster_context = ai_input.get("cluster_context") or {}
    trend_context = ai_input.get("trend_context") or {}
    data_quality = ai_input.get("data_quality") or {}
    insider_history = ai_input.get("insider_history") or {}
    insider_stats = ai_input.get("insider_stats") or {}

    bucket = issuer_context.get("market_cap_bucket")

    def _bucket_adj(b: Any) -> float:
        b = (str(b).strip().lower() if b is not None else "")
        if b == "micro":
            return 0.7
        if b == "small":
            return 0.4
        if b == "mid":
            return 0.2
        if b == "mega":
            return -0.3
        # large -> 0.0 (neutral)
        return 0.0

    def _role_adj(title: Any) -> float:
        if _is_ceo(title):
            return 0.6
        if _is_exec(title):
            return 0.3
        return 0.0

    def _pct_base(pct: Optional[float], *, is_buy: bool) -> float:
        # pct is already a percentage (e.g. 190.0 means +190%).
        if pct is None:
            return 5.6 if is_buy else 5.4
        if pct >= 200:
            return 9.5 if is_buy else 9.0
        if pct >= 100:
            return 9.0 if is_buy else 8.5
        if pct >= 50:
            return 8.5 if is_buy else 8.0
        if pct >= 25:
            return 8.0 if is_buy else 7.5
        if pct >= 10:
            return 7.5 if is_buy else 7.0
        if pct >= 5:
            return 7.0 if is_buy else 6.5
        if pct >= 2:
            return 6.5
        if pct >= 1:
            return 5.8
        return 5.2

    def _trade_size_adj(dollars: Any, pct_mcap: Any) -> float:
        # Prefer % of market cap if we have it.
        try:
            pct_mcap_f = float(pct_mcap) if pct_mcap is not None else None
        except Exception:
            pct_mcap_f = None
        if pct_mcap_f is not None:
            if pct_mcap_f >= 1.0:
                return 1.0
            if pct_mcap_f >= 0.5:
                return 0.7
            if pct_mcap_f >= 0.1:
                return 0.4
            if pct_mcap_f >= 0.05:
                return 0.2
            if pct_mcap_f < 0.005:
                return -0.4
            if pct_mcap_f < 0.02:
                return -0.2
            return 0.0

        try:
            d = float(dollars) if dollars is not None else None
        except Exception:
            d = None
        if d is None:
            return 0.0
        if d >= 5_000_000:
            return 0.7
        if d >= 1_000_000:
            return 0.5
        if d >= 250_000:
            return 0.3
        if d >= 100_000:
            return 0.2
        if d < 25_000:
            return -0.2
        return 0.0

    def _history_adj(prior_events_total: Any, trade_size_adj: float) -> float:
        if prior_events_total is None:
            # Unknown history should be neutral, not treated like a verified first event.
            return 0.0
        try:
            n = int(prior_events_total)
        except Exception:
            return 0.0
        # Rarer events are more informative
        if n == 0:
            # First-ever events are only informative when the trade itself is not tiny.
            return 0.35 if trade_size_adj >= 0.2 else 0.1
        if n <= 2:
            return 0.2
        if n <= 5:
            return 0.1
        return 0.0

    def _cluster_adj(cluster_obj: Dict[str, Any]) -> float:
        try:
            if bool(cluster_obj.get("cluster_flag")):
                # Clustered insider behavior is informative
                return 0.4
        except Exception:
            pass
        return 0.0

    def _trend_adj(is_buy: bool) -> float:
        # Lightly reward mean-reversion buys and momentum sells.
        try:
            ret_60 = trend_context.get("pre_returns", {}).get("ret_60d")
            if not isinstance(ret_60, (int, float)):
                return 0.0
            r = float(ret_60)
            if is_buy:
                if r <= -0.25:
                    return 0.35
                if r <= -0.10:
                    return 0.2
                if r >= 0.25:
                    return -0.2
                return 0.0
            # sell side
            if r >= 0.25:
                return 0.25
            if r >= 0.10:
                return 0.15
            if r <= -0.25:
                return -0.15
            return 0.0
        except Exception:
            return 0.0

    title = event.get("owner_title")

    buy = event.get("buy") or {}
    buy_has = bool(buy.get("has_buy"))
    buy_pct = buy.get("holdings_change_pct")
    buy_rating = None
    buy_conf = None
    buy_reasons: list[str] = []
    if buy_has:
        try:
            buy_pct_f = float(buy_pct) if buy_pct is not None else None
        except Exception:
            buy_pct_f = None
        buy_rating_f = _pct_base(buy_pct_f, is_buy=True)
        buy_reasons.append("pct_holdings_change")
        buy_trade_size_adj = _trade_size_adj(buy.get("dollars"), buy.get("trade_value_pct_market_cap"))
        buy_rating_f += buy_trade_size_adj
        buy_rating_f += _bucket_adj(bucket)
        buy_rating_f += _role_adj(title)
        buy_rating_f += _history_adj(insider_history.get("prior_buy_events_total"), buy_trade_size_adj)
        buy_rating_f += _cluster_adj(cluster_context.get("buy_cluster") or {})
        buy_rating_f += _trend_adj(is_buy=True)

        buy_rating_f = _clamp(buy_rating_f, 1.0, 10.0)
        buy_rating = round(buy_rating_f, 1)

        # Confidence is primarily data-quality and strength driven
        conf = 0.40
        if buy_pct_f is not None and buy_pct_f >= 50:
            conf += 0.10
        if _is_ceo(title) or _is_cfo(title):
            conf += 0.05
        if bool((cluster_context.get("buy_cluster") or {}).get("cluster_flag")):
            conf += 0.05
        if data_quality.get("buy_vwap_is_partial"):
            conf -= 0.07
        if data_quality.get("trend_missing"):
            conf -= 0.05
        buy_conf = _clamp(conf, 0.0, 1.0)

    sell = event.get("sell") or {}
    sell_has = bool(sell.get("has_sell"))
    sell_pct = sell.get("holdings_change_pct")
    sell_rating = None
    sell_conf = None
    sell_reasons: list[str] = []
    if sell_has:
        try:
            sell_pct_f = float(sell_pct) if sell_pct is not None else None
        except Exception:
            sell_pct_f = None

        # Large % sells are more informative than small trims.
        sell_rating_f = _pct_base(sell_pct_f, is_buy=False)
        sell_reasons.append("pct_holdings_change")
        sell_trade_size_adj = _trade_size_adj(sell.get("dollars"), sell.get("trade_value_pct_market_cap"))
        sell_rating_f += sell_trade_size_adj
        sell_rating_f += _bucket_adj(bucket)
        sell_rating_f += _role_adj(title)
        sell_rating_f += _history_adj(insider_history.get("prior_sell_events_total"), sell_trade_size_adj)
        sell_rating_f += _cluster_adj(cluster_context.get("sell_cluster") or {})
        sell_rating_f += _trend_adj(is_buy=False)

        sell_rating_f = _clamp(sell_rating_f, 1.0, 10.0)
        sell_rating = round(sell_rating_f, 1)

        conf = 0.38
        if sell_pct_f is not None and sell_pct_f >= 25:
            conf += 0.10
        if _is_ceo(title) or _is_cfo(title):
            conf += 0.05
        if bool((cluster_context.get("sell_cluster") or {}).get("cluster_flag")):
            conf += 0.05
        if data_quality.get("sell_vwap_is_partial"):
            conf -= 0.07
        if data_quality.get("trend_missing"):
            conf -= 0.05
        sell_conf = _clamp(conf, 0.0, 1.0)

    return {
        "buy": {
            "rating": buy_rating,
            "confidence": buy_conf,
            "reasons": buy_reasons,
        },
        "sell": {
            "rating": sell_rating,
            "confidence": sell_conf,
            "reasons": sell_reasons,
        },
    }

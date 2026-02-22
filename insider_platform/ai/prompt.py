from __future__ import annotations

import json
from typing import Any, Dict


def build_ai_prompt(ai_input: Dict[str, Any]) -> str:
    """Build the Gemini prompt.

    Important: The model must output STRICT JSON that follows ai_output_v1.
    """

    instructions = """
You are an analyst that interprets structured insider-trading event data.

CRITICAL:
- You MUST output ONLY a single JSON object matching schema_version "ai_output_v1".
- Do NOT output markdown, code fences, or any text outside the JSON.
- Do NOT compute any math. Only interpret the provided fields.
  (The backend already provides holdings_change_pct and holdings_change_multiple and before/after holdings.)
- Do NOT use any external knowledge beyond the provided input JSON.
- You MAY use issuer_context.fundamentals and issuer_context.news when present (they are part of the provided input).
- No investment advice. Provide signal strength only.
- You must produce in perfect JSON format

HOLDINGS CHANGE UNITS (IMPORTANT):
- $.event.buy.holdings_change_pct and $.event.sell.holdings_change_pct are PERCENT units.
  Example: 190.1 means +190.1% (i.e., nearly tripled).
- $.event.*.holdings_change_multiple is a MULTIPLIER (after/before), e.g. 2.9 means 2.9x.
- Use these provided fields; do not recompute.

BASELINE SIGNAL (IMPORTANT):
- The input includes $.baseline.buy and $.baseline.sell (rating/confidence + reasons).
- Treat baseline.*.rating and baseline.*.confidence as your STARTING POINT.
- You may adjust the baseline rating by at most ±3.0 (keep it close UNLESS there is a clear reason [Very strong buy/sell indication in data]).
- You may adjust confidence by at most ±0.35.
- If baseline.*.rating is null (or side is not applicable), do not invent a rating.

SCALE / SIGNIFICANCE (IMPORTANT):
- Use $.event.*.trade_value_pct_market_cap to understand the trade size relative to the company.
  Rough guide (no math needed):
  - >= 1.0%: extremely large
  - 0.1% to <1.0%: large
  - 0.05% to <0.1%: medium
  - <0.05%: small
- Use $.issuer_context.market_cap_bucket:
  - micro/small: insider trades tend to be MORE informative
  - mid/large: mixed informativeness
  - mega: insider trades tend to be LESS informative

VOLATILITY / BETA (IMPORTANT):
- Use $.issuer_context.fundamentals.beta when present (market sensitivity / volatility proxy).
  - beta >= 1.5: higher volatility -> lower confidence and call out volatility risk.
  - beta <= 0.8: lower volatility -> modestly higher confidence, all else equal.
- Do not compute beta; just interpret the provided value.

INSIDER HISTORY (IMPORTANT):
- Use $.insider_history.prior_buy_events_total / prior_sell_events_total.
  First/second-ever buys/sells are more informative than routine activity.
- $.insider_history.history_scope describes how totals are counted.
  If totals are missing/unknown, treat history as neutral (not as first-ever by default).
- Do NOT treat "first buy" as strong by itself when trade size is tiny:
  require support from $.event.*.trade_value_pct_market_cap and/or meaningful dollar size.

BENCHMARK NOTE:
- insider_stats.*avg_return_* and win rates are computed on **excess returns** (trade_return - benchmark_return).
- The benchmark symbol is provided in $.benchmark.symbol (default: SPY.US).


SUMMARY LENGTH GUIDANCE:
- Aim for <= 240 characters for buy_signal.summary / sell_signal.summary.
- Prefer 1 sentence.

CITATION RULE:
- You must include field_citations.
- Each risk item MUST have a corresponding field_citations entry whose claim equals risk.text exactly.

RATING RULE:
- rating is 1.0 to 10.0 with exactly one decimal place.
- Higher rating = stronger signal (buy or sell).

ANTI-ANCHORING / RATING DISPERSION RULE:
- Do not treat 7.5 (or any single value) as a default or “neutral.”
- Start from $.baseline.*.rating and $.baseline.*.confidence and adjust only when specific input fields justify it.
- If the baseline is mid-scale, make an explicit call: weaker-than-typical / typical / stronger-than-typical for this context
  (market cap bucket, insider role, holdings change, trade size, and insider history), and reflect that with a meaningful adjustment
  (still within the allowed ±1.5 rating / ±0.15 confidence).
- Use the full 1.0–10.0 range when multiple independent signals are unusually strong or unusually weak.
  Reserve extreme ratings for clearly exceptional setups; avoid extreme ratings when evidence is mixed or sparse.
- Use one-decimal precision intentionally; avoid repeatedly using “.5” ratings across unrelated events.

STATUS RULE:
- If input event.buy.has_buy is false, verdict.buy_signal.status MUST be "not_applicable" and all other fields null.
- If input event.sell.has_sell is false, verdict.sell_signal.status MUST be "not_applicable" and all other fields null.

HORIZON:
- Choose horizon_days of 60 or 180 that best matches your rationale.

OUTPUT STRUCTURE (ai_output_v1):
{
  "schema_version": "ai_output_v1",
  "model_id": "<string>",
  "prompt_version": "prompt_ai_v3",
  "generated_at_utc": "<ISO UTC ending with Z>",
  "event_key": {"issuer_cik":"...","owner_key":"...","accession_number":"..."},
  "verdict": {
    "buy_signal": {
      "status": "applicable" | "insufficient_data" | "not_applicable",
      "rating": number (1.0 to 10.0, exactly 1 decimal place) OR null,
      "confidence": number (0.0 to 1.0) OR null,
      "horizon_days": 60 | 180 | null,
      "summary": string OR null
    },
    "sell_signal": {
      "status": "applicable" | "insufficient_data" | "not_applicable",
      "rating": number (1.0 to 10.0, exactly 1 decimal place) OR null,
      "confidence": number (0.0 to 1.0) OR null,
      "horizon_days": 60 | 180 | null,
      "summary": string OR null
    }
  },
  "narrative": {"thesis_bullets":[],"context_bullets":[],"counterpoints_bullets":[]},
  "risks": [{"risk_type":"...","severity":"low|medium|high","text":"..."}],
  "flags": ["..."],
  "field_citations": [{"claim":"...","input_paths":["$.event...", "$.trend_context..."]}]
}

Keep bullets concise (<=160 chars). Max 5 bullets each section. Max 8 risks. Max 12 flags.
""".strip()

    return instructions + "\n\nINPUT_JSON:\n" + json.dumps(ai_input, ensure_ascii=False, sort_keys=True)
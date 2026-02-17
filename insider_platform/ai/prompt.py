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

INSIDER HISTORY (IMPORTANT):
- Use $.insider_history.prior_buy_events_total / prior_sell_events_total.
  First/second-ever buys/sells are more informative than routine activity.

ROUTINE / SCHEDULED ACTIVITY (IMPORTANT):
- Insider sales are common and often routine; do NOT assume bearish intent just because a sale occurred.
- For comparable magnitude/context, sell signals are generally less informative than buy signals;
  reserve high sell ratings for unusually strong bearish evidence.
- Use $.insider_history.prior_sell_events_total to detect routine sellers:
  - If prior_sell_events_total is high, treat many sales as less informative (lower rating and often lower confidence).
- Use $.filing_context.footnotes when available to detect scheduled/automatic/plan-driven activity.
  Treat phrases like "10b5-1", "Rule 10b5-1", "trading plan", "pre-arranged", "scheduled", "automatic",
  "sell-to-cover", or "tax withholding" as evidence the trade may be planned or mechanical.
  - Planned/mechanical sales should generally produce a weaker sell signal (often ~5.0–6.0),
    unless other inputs show unusually strong bearish evidence (e.g., very large liquidation + cluster selling).
  - Planned/mechanical context should not materially boost a buy signal.

CALIBRATED RATING DISTRIBUTION (IMPORTANT):
- A "non-special" / ordinary event should land around **5.0–6.0**, not ~7.
- Ratings **7.0–8.0** should be reserved for clearly strong, above-typical setups with multiple independent signals.
- Ratings **8.5–10.0** are exceptional and should be rare.
  Examples of near-ideal buy setups (ONLY when supported by the provided input):
  - Small/micro-cap ($.issuer_context.market_cap_bucket) with clustered buying ($.cluster_context.buy_cluster.cluster_flag)
    involving multiple directors/execs ($.event.is_director / $.event.is_officer and cluster context),
    large holdings increases ($.event.buy.holdings_change_pct / multiple), meaningful trade size vs market cap,
    after a notable decline ($.trend_context.pre_returns.ret_60d negative, near 52w low, below SMAs),
    and supportive catalyst context in $.issuer_context.news.
  - Biotech/clinical catalysts should only be considered if explicitly present in $.issuer_context.news.
- "A few promising bits" should NOT automatically push the rating into a strong-recommendation range.
  Prefer 5–6 for mixed/limited evidence; move to 7–8 only when the evidence stacks up clearly.

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
  (typically within ±1.5 rating / ±0.15 confidence, but you may use the full allowed ±3.0 / ±0.35 when the context strongly warrants it
   — especially to keep routine/scheduled sales near the 5–6 range).
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
  "prompt_version": "prompt_ai_v4",
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

from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple, Union


class AIValidationError(ValueError):
    """Raised when AI output JSON fails strict validation."""


ALLOWED_TOP_KEYS = {
    "schema_version",
    "model_id",
    "prompt_version",
    "generated_at_utc",
    "event_key",
    "verdict",
    "narrative",
    "risks",
    "flags",
    "field_citations",
}

ALLOWED_STATUS = {"applicable", "not_applicable", "insufficient_data"}
ALLOWED_SEVERITY = {"low", "medium", "high"}
ALLOWED_HORIZON = {60, 180}

# Baseline deltas (prompt rule)
MAX_RATING_DELTA = 3.0
MAX_CONF_DELTA = 0.35


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise AIValidationError(msg)


def _is_iso_utc(s: Any) -> bool:
    return isinstance(s, str) and s.endswith("Z") and "T" in s


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _one_decimal(x: float) -> bool:
    return round(float(x), 1) == float(x)


def extract_json_from_text(text: str) -> Dict[str, Any]:
    """Extract the first top-level JSON object from model text.

    Gemini may occasionally wrap JSON in markdown or add stray prose.
    We take the substring from first '{' to last '}'.
    """
    if not isinstance(text, str):
        raise AIValidationError("Model response is not text")

    # Fast path: already pure JSON
    try:
        obj0 = json.loads(text.strip())
        if isinstance(obj0, dict):
            return obj0
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    _require(start != -1 and end != -1 and end > start, "Could not find JSON object in model response")

    candidate = text[start : end + 1]
    try:
        obj = json.loads(candidate)
    except Exception as e:
        raise AIValidationError(f"Failed to parse JSON from model response: {e}") from e

    _require(isinstance(obj, dict), "Top-level JSON must be an object")
    return obj


def validate_ai_output(ai_output: Dict[str, Any], ai_input: Dict[str, Any]) -> None:
    """Strictly validate AI output against the ai_output_v1 contract.

    Backend should reject any output that fails. This is intentionally strict to avoid
    silent UI breakage and hallucinated citations.
    """
    _require(isinstance(ai_output, dict), "AI output must be a JSON object")

    # No unknown keys at top-level
    extra = set(ai_output.keys()) - ALLOWED_TOP_KEYS
    _require(not extra, f"AI output has unknown top-level keys: {sorted(extra)}")

    # Required keys
    for k in ALLOWED_TOP_KEYS:
        _require(k in ai_output, f"Missing top-level key: {k}")

    _require(ai_output.get("schema_version") == "ai_output_v1", "schema_version must be ai_output_v1")
    _require(isinstance(ai_output.get("model_id"), str) and ai_output["model_id"], "model_id must be non-empty string")
    _require(
        isinstance(ai_output.get("prompt_version"), str) and ai_output["prompt_version"],
        "prompt_version must be non-empty string",
    )
    _require(_is_iso_utc(ai_output.get("generated_at_utc")), "generated_at_utc must be ISO UTC string ending with Z")

    # event_key must match input
    ek = ai_output.get("event_key")
    _require(isinstance(ek, dict), "event_key must be object")
    for k in ("issuer_cik", "owner_key", "accession_number"):
        _require(k in ek and isinstance(ek[k], str) and ek[k], f"event_key.{k} must be non-empty string")

    inp_event = ai_input.get("event", {}) if isinstance(ai_input, dict) else {}
    _require(
        ek["issuer_cik"] == inp_event.get("issuer_cik")
        and ek["owner_key"] == inp_event.get("owner_key")
        and ek["accession_number"] == inp_event.get("accession_number"),
        "event_key does not match input event identity",
    )

    verdict = ai_output.get("verdict")
    _require(isinstance(verdict, dict), "verdict must be object")
    _require("buy_signal" in verdict and "sell_signal" in verdict, "verdict must include buy_signal and sell_signal")

    # Enforce side applicability vs input
    has_buy = bool(inp_event.get("buy", {}).get("has_buy"))
    has_sell = bool(inp_event.get("sell", {}).get("has_sell"))

    _validate_signal(verdict["buy_signal"], expected_applicable=has_buy, side_name="buy")
    _validate_signal(verdict["sell_signal"], expected_applicable=has_sell, side_name="sell")

    # Narrative
    narrative = ai_output.get("narrative")
    _require(isinstance(narrative, dict), "narrative must be object")
    for key in ("thesis_bullets", "context_bullets", "counterpoints_bullets"):
        _require(key in narrative and isinstance(narrative[key], list), f"narrative.{key} must be array")
        _require(len(narrative[key]) <= 5, f"narrative.{key} must have <= 5 items")
        for item in narrative[key]:
            _require(isinstance(item, str), f"narrative.{key} items must be strings")
            _require("\n" not in item, f"narrative.{key} bullets must be single-line")
            _require(len(item) <= 160, f"narrative.{key} bullets must be <= 160 chars")

    # Risks
    risks = ai_output.get("risks")
    _require(isinstance(risks, list), "risks must be array")
    _require(len(risks) <= 8, "risks must have <= 8 items")
    for r in risks:
        _require(isinstance(r, dict), "risk must be object")
        _require(isinstance(r.get("risk_type"), str) and r["risk_type"], "risk.risk_type must be non-empty string")
        _require(r.get("severity") in ALLOWED_SEVERITY, "risk.severity must be low/medium/high")
        _require(isinstance(r.get("text"), str) and r["text"], "risk.text must be non-empty string")
        _require("\n" not in r["text"], "risk.text must be single-line")

    # Flags
    flags = ai_output.get("flags")
    _require(isinstance(flags, list), "flags must be array")
    _require(len(flags) <= 12, "flags must have <= 12 items")
    for f in flags:
        _require(isinstance(f, str) and f, "flags items must be non-empty strings")

    # Citations
    citations = ai_output.get("field_citations")
    _require(isinstance(citations, list), "field_citations must be array")
    _require(len(citations) <= 40, "field_citations must have <= 40 items")
    for c in citations:
        _require(isinstance(c, dict), "field_citations item must be object")
        _require(isinstance(c.get("claim"), str) and c["claim"], "field_citations.claim must be non-empty string")
        _require(
            isinstance(c.get("input_paths"), list) and c["input_paths"],
            "field_citations.input_paths must be non-empty array",
        )
        for p in c["input_paths"]:
            _require(isinstance(p, str) and p.startswith("$."), "input_paths entries must be strings starting with '$.'")
            _require(_json_path_exists(ai_input, p), f"input_paths references missing path in ai_input: {p}")

    # Minimum citation requirement: if anything applicable or any risk exists, must cite something.
    any_applicable = verdict["buy_signal"].get("status") == "applicable" or verdict["sell_signal"].get("status") == "applicable"
    if any_applicable or risks or narrative["thesis_bullets"] or narrative["context_bullets"] or narrative["counterpoints_bullets"]:
        _require(len(citations) > 0, "field_citations must be non-empty when providing any analysis")

    # Require each risk to have a citation claim equal to its text (simple, deterministic rule)
    risk_texts = [r["text"] for r in risks]
    claim_set = {c["claim"] for c in citations if isinstance(c, dict) and isinstance(c.get("claim"), str)}
    for rt in risk_texts:
        _require(rt in claim_set, "Each risk.text must appear as a field_citations.claim")

    # Baseline delta enforcement (rating/conf must stay close to deterministic baseline).
    _validate_baseline_deltas(ai_output, ai_input)


def _validate_baseline_deltas(ai_output: Dict[str, Any], ai_input: Dict[str, Any]) -> None:
    baseline = ai_input.get("baseline") if isinstance(ai_input, dict) else None
    if not isinstance(baseline, dict):
        return

    verdict = ai_output.get("verdict") or {}
    if not isinstance(verdict, dict):
        return

    for side in ("buy", "sell"):
        base = baseline.get(side)
        sig = verdict.get(f"{side}_signal")
        if not isinstance(base, dict) or not isinstance(sig, dict):
            continue

        if sig.get("status") != "applicable":
            continue

        # Baseline may legitimately be null for a side (e.g., non-applicable); skip.
        b_rating = base.get("rating")
        b_conf = base.get("confidence")
        if b_rating is None or b_conf is None:
            continue

        try:
            r = float(sig.get("rating")) if sig.get("rating") is not None else None
            c = float(sig.get("confidence")) if sig.get("confidence") is not None else None
            br = float(b_rating)
            bc = float(b_conf)
        except Exception:
            continue

        if r is not None and abs(r - br) > MAX_RATING_DELTA + 1e-9:
            raise AIValidationError(
                f"{side}_signal.rating deviates from baseline by > {MAX_RATING_DELTA}: rating={r} baseline={br}"
            )
        if c is not None and abs(c - bc) > MAX_CONF_DELTA + 1e-9:
            raise AIValidationError(
                f"{side}_signal.confidence deviates from baseline by > {MAX_CONF_DELTA}: confidence={c} baseline={bc}"
            )


def _validate_signal(sig: Any, expected_applicable: bool, side_name: str) -> None:
    _require(isinstance(sig, dict), f"{side_name}_signal must be object")
    for k in ("status", "rating", "confidence", "horizon_days", "summary"):
        _require(k in sig, f"{side_name}_signal missing key {k}")

    status = sig.get("status")
    _require(status in ALLOWED_STATUS, f"{side_name}_signal.status must be one of {sorted(ALLOWED_STATUS)}")

    if not expected_applicable:
        _require(status == "not_applicable", f"{side_name}_signal.status must be not_applicable when no {side_name} activity")

    if status != "applicable":
        _require(sig.get("rating") is None, f"{side_name}_signal.rating must be null when status != applicable")
        _require(sig.get("confidence") is None, f"{side_name}_signal.confidence must be null when status != applicable")
        _require(sig.get("horizon_days") is None, f"{side_name}_signal.horizon_days must be null when status != applicable")
        _require(sig.get("summary") is None, f"{side_name}_signal.summary must be null when status != applicable")
        return

    # Applicable
    rating = sig.get("rating")
    conf = sig.get("confidence")
    horizon = sig.get("horizon_days")
    summary = sig.get("summary")

    _require(_is_number(rating), f"{side_name}_signal.rating must be number")
    rating_f = float(rating)
    _require(1.0 <= rating_f <= 10.0, f"{side_name}_signal.rating must be within [1.0,10.0]")
    _require(_one_decimal(rating_f), f"{side_name}_signal.rating must have 1 decimal place")

    _require(_is_number(conf), f"{side_name}_signal.confidence must be number")
    conf_f = float(conf)
    _require(0.0 <= conf_f <= 1.0, f"{side_name}_signal.confidence must be within [0,1]")

    _require(isinstance(horizon, int) and horizon in ALLOWED_HORIZON, f"{side_name}_signal.horizon_days must be 60 or 180")

    _require(isinstance(summary, str) and summary, f"{side_name}_signal.summary must be non-empty string")


JsonPathStep = Union[str, int]


def _parse_json_path(path: str) -> List[JsonPathStep]:
    """Parse a simplified JSONPath like $.a.b[0].c into steps ["a","b",0,"c"]."""
    p = path.strip()
    if p == "$":
        return []
    if not p.startswith("$"):
        raise AIValidationError(f"Invalid JSONPath (must start with $): {path}")
    p = p[1:]
    if p.startswith("."):
        p = p[1:]

    steps: List[JsonPathStep] = []
    i = 0
    while i < len(p):
        if p[i] == ".":
            i += 1
            continue
        if p[i] == "[":
            j = p.find("]", i)
            if j == -1:
                raise AIValidationError(f"Invalid JSONPath (missing ]): {path}")
            idx_str = p[i + 1 : j].strip()
            if not idx_str.isdigit():
                raise AIValidationError(f"Invalid JSONPath (non-numeric index): {path}")
            steps.append(int(idx_str))
            i = j + 1
            continue

        # key
        j = i
        while j < len(p) and p[j] not in ".[":
            j += 1
        key = p[i:j].strip()
        if not key:
            raise AIValidationError(f"Invalid JSONPath (empty key): {path}")
        steps.append(key)
        i = j
    return steps


def _json_path_exists(obj: Any, path: str) -> bool:
    try:
        steps = _parse_json_path(path)
    except Exception:
        return False

    cur = obj
    for step in steps:
        if isinstance(step, int):
            if not isinstance(cur, list):
                return False
            if step < 0 or step >= len(cur):
                return False
            cur = cur[step]
        else:
            if not isinstance(cur, dict):
                return False
            if step not in cur:
                return False
            cur = cur[step]
    return True

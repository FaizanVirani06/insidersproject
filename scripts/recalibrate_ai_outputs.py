import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from insider_platform.config import load_config
from insider_platform.db import connect
from insider_platform.ai.judge import _compute_baseline_signals, _postprocess_ai_output


def _safe_load_json(s: str):
    try:
        return json.loads(s)
    except Exception:
        return None


def main() -> None:
    p = argparse.ArgumentParser(
        description=(
            "Recalibrate stored AI ratings/confidence to the current scoring scale WITHOUT calling the LLM. "
            "This updates ai_outputs.output_json + buy_rating/sell_rating/confidence columns."
        )
    )
    p.add_argument("--batch", type=int, default=500, help="Rows to process per batch (default 500)")
    p.add_argument("--limit", type=int, default=None, help="Stop after processing N rows")
    p.add_argument(
        "--prompt-version",
        type=str,
        default=None,
        help="Only update rows where ai_outputs.prompt_version matches this value (optional)",
    )
    p.add_argument("--dry-run", action="store_true", help="Do not write updates; just report what would change")
    args = p.parse_args()

    cfg = load_config()

    updated = 0
    scanned = 0
    skipped = 0
    last_id = 0

    where = "WHERE ai_output_id > ?"
    params_base = [last_id]
    if args.prompt_version:
        where += " AND prompt_version = ?"
        params_base.append(args.prompt_version)

    with connect(cfg.DB_DSN) as conn:
        while True:
            params = list(params_base)
            params[0] = last_id
            params.extend([int(args.batch)])

            rows = conn.execute(
                f"""
                SELECT ai_output_id, issuer_cik, owner_key, accession_number,
                       buy_rating, sell_rating, confidence,
                       input_json, output_json
                FROM ai_outputs
                {where}
                ORDER BY ai_output_id
                LIMIT ?
                """,
                tuple(params),
            ).fetchall()

            if not rows:
                break

            for r in rows:
                scanned += 1
                last_id = int(r["ai_output_id"])

                inp = _safe_load_json(r.get("input_json") or "")
                out = _safe_load_json(r.get("output_json") or "")
                if not isinstance(inp, dict) or not isinstance(out, dict):
                    skipped += 1
                    continue

                # Compute the CURRENT baseline and use it for deterministic calibration.
                inp2 = dict(inp)
                try:
                    inp2["baseline"] = _compute_baseline_signals(inp2)
                except Exception:
                    skipped += 1
                    continue

                out2 = json.loads(json.dumps(out))  # deep-ish copy
                try:
                    _postprocess_ai_output(out2, inp2)
                except Exception:
                    skipped += 1
                    continue

                # Extract the stored columns the same way run_ai_for_event does.
                v = out2.get("verdict") or {}
                buy_sig = v.get("buy_signal") or {}
                sell_sig = v.get("sell_signal") or {}

                buy_rating = buy_sig.get("rating")
                sell_rating = sell_sig.get("rating")

                conf = buy_sig.get("confidence")
                if conf is None:
                    conf = sell_sig.get("confidence")

                # Normalize
                buy_rating_f = float(buy_rating) if isinstance(buy_rating, (int, float)) else None
                sell_rating_f = float(sell_rating) if isinstance(sell_rating, (int, float)) else None
                conf_f = float(conf) if isinstance(conf, (int, float)) else None

                new_output_json = json.dumps(out2, separators=(",", ":"), ensure_ascii=False)

                # Decide if anything actually changed
                changed = (new_output_json != (r.get("output_json") or ""))
                if not changed:
                    continue

                updated += 1

                if args.dry_run:
                    continue

                conn.execute(
                    """
                    UPDATE ai_outputs
                    SET buy_rating=?, sell_rating=?, confidence=?, output_json=?
                    WHERE ai_output_id=?
                    """,
                    (
                        buy_rating_f,
                        sell_rating_f,
                        conf_f,
                        new_output_json,
                        last_id,
                    ),
                )

                # Commit occasionally to keep transactions bounded.
                if updated % 1000 == 0:
                    conn.commit()

                if args.limit and updated >= int(args.limit):
                    break

            if args.limit and updated >= int(args.limit):
                break

        if not args.dry_run:
            conn.commit()

    print(
        json.dumps(
            {
                "scanned": scanned,
                "updated": updated,
                "skipped": skipped,
                "dry_run": bool(args.dry_run),
                "prompt_version_filter": args.prompt_version,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

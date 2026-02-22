from __future__ import annotations

from statistics import mean

from insider_platform.config import Config
from insider_platform.models import OwnerIssuerKey
from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[stats] {msg}")


def compute_stats_for_owner_issuer(conn: Any, cfg: Config, key: OwnerIssuerKey) -> None:
    """Recompute issuer-specific insider performance stats from event_outcomes.

    stats_v2: averages are computed on **excess returns** (trade_return - benchmark_return),
    so they represent outperformance vs the configured benchmark (default: SPY.US).
    """
    now = utcnow_iso()

    for side in ("buy", "sell"):
        # 60d (excess)
        r60_rows = conn.execute(
            """
            SELECT excess_return_60d AS r FROM event_outcomes
            WHERE issuer_cik=? AND owner_key=? AND side=? AND excess_return_60d IS NOT NULL
            """,
            (key.issuer_cik, key.owner_key, side),
        ).fetchall()
        r60 = [float(r["r"]) for r in r60_rows]
        n60 = len(r60)
        win60 = None
        avg60 = None
        if n60 > 0:
            win60 = sum(1 for x in r60 if x > 0) / n60
            avg60 = mean(r60)

        # 180d (excess)
        r180_rows = conn.execute(
            """
            SELECT excess_return_180d AS r FROM event_outcomes
            WHERE issuer_cik=? AND owner_key=? AND side=? AND excess_return_180d IS NOT NULL
            """,
            (key.issuer_cik, key.owner_key, side),
        ).fetchall()
        r180 = [float(r["r"]) for r in r180_rows]
        n180 = len(r180)
        win180 = None
        avg180 = None
        if n180 > 0:
            win180 = sum(1 for x in r180 if x > 0) / n180
            avg180 = mean(r180)

        conn.execute(
            """
            INSERT INTO insider_issuer_stats (
                issuer_cik, owner_key, side,
                eligible_n_60d, win_rate_60d, avg_return_60d,
                eligible_n_180d, win_rate_180d, avg_return_180d,
                stats_version, computed_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(issuer_cik, owner_key, side) DO UPDATE SET
                eligible_n_60d=excluded.eligible_n_60d,
                win_rate_60d=excluded.win_rate_60d,
                avg_return_60d=excluded.avg_return_60d,
                eligible_n_180d=excluded.eligible_n_180d,
                win_rate_180d=excluded.win_rate_180d,
                avg_return_180d=excluded.avg_return_180d,
                stats_version=excluded.stats_version,
                computed_at=excluded.computed_at
            """,
            (
                key.issuer_cik,
                key.owner_key,
                side,
                n60,
                win60,
                avg60,
                n180,
                win180,
                avg180,
                cfg.CURRENT_STATS_VERSION,
                now,
            ),
        )

        _debug(
            f"Stats computed issuer={key.issuer_cik} owner={key.owner_key} side={side} "
            f"n60={n60} n180={n180}"
        )

    # Mark events for this owner+issuer as having stats computed (for AI gating/UI transparency)
    conn.execute(
        """
        UPDATE insider_events
        SET stats_computed_at=?
        WHERE issuer_cik=? AND owner_key=?
        """,
        (now, key.issuer_cik, key.owner_key),
    )

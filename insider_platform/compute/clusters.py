from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Dict, List, Tuple

from insider_platform.config import Config
from insider_platform.util.hashing import sha256_hex
from insider_platform.util.time import utcnow_iso


def _debug(msg: str) -> None:
    print(f"[clusters] {msg}")


@dataclass
class Candidate:
    issuer_cik: str
    owner_key: str
    accession_number: str
    trade_date: str
    dollars: float
    is_exec: bool
    pct_change: float | None


def compute_clusters_for_ticker(conn: sqlite3.Connection, cfg: Config, ticker: str) -> None:
    t = (ticker or "").strip()
    if not t:
        raise RuntimeError("Ticker blank for cluster computation")

    _debug(f"Recomputing clusters for ticker={t}")

    for side in ("buy", "sell"):
        _compute_side_clusters(conn, cfg, ticker=t, side=side)

    # Mark that clustering was computed for all events of this ticker (for AI gating)
    conn.execute(
        "UPDATE insider_events SET cluster_computed_at=? WHERE ticker=?",
        (utcnow_iso(), t),
    )


def _compute_side_clusters(conn: sqlite3.Connection, cfg: Config, ticker: str, side: str) -> None:
    """Compute deterministic cluster flags for one side.

    Spec rule: **14 calendar day window**.

    Implementation detail (deterministic + non-overlapping):
    - Sort candidates by trade_date.
    - Sweep left-to-right. Each unassigned candidate anchors a window [anchor_date, anchor_date + 14].
    - If that window contains transactions from >=2 unique insiders, we form ONE cluster containing
      all unassigned candidates in the window and mark them assigned.

    This guarantees each cluster's span is <= 14 days.
    """

    candidates = _load_candidates(conn, ticker, side)
    _debug(f"ticker={ticker} side={side} candidates={len(candidates)}")

    # Reset flags for this ticker+side to 0 (deterministic)
    if side == "buy":
        conn.execute(
            "UPDATE insider_events SET cluster_flag_buy=0, cluster_id_buy=NULL WHERE ticker=?",
            (ticker,),
        )
    else:
        conn.execute(
            "UPDATE insider_events SET cluster_flag_sell=0, cluster_id_sell=NULL WHERE ticker=?",
            (ticker,),
        )

    # Delete old cluster records for this ticker+side
    conn.execute(
        "DELETE FROM cluster_members WHERE cluster_id IN (SELECT cluster_id FROM clusters WHERE ticker=? AND side=?)",
        (ticker, side),
    )
    conn.execute("DELETE FROM clusters WHERE ticker=? AND side=?", (ticker, side))

    if len(candidates) < 2:
        return

    # Sort by trade_date (ISO strings sort correctly)
    candidates_sorted = sorted(candidates, key=lambda c: c.trade_date)
    dates = [_date_from_iso(c.trade_date) for c in candidates_sorted]

    assigned = [False] * len(candidates_sorted)
    now = utcnow_iso()

    i = 0
    while i < len(candidates_sorted):
        if assigned[i]:
            i += 1
            continue

        anchor_date = dates[i]
        window_end_dt = anchor_date + timedelta(days=14)

        # Collect all (unassigned) candidates in the 14-day window
        idxs: List[int] = []
        j = i
        while j < len(candidates_sorted) and dates[j] <= window_end_dt:
            if not assigned[j]:
                idxs.append(j)
            j += 1

        # Multiple reporting owners can exist within a *single* accession number.
        # Treat those as one "filing" so we don't accidentally manufacture clusters
        # from duplicates of the same underlying trade.
        filings = {candidates_sorted[k].accession_number for k in idxs}
        if len(filings) < 2:
            # Not a cluster window; move anchor forward
            i += 1
            continue

        window_start = candidates_sorted[i].trade_date
        window_end = max(candidates_sorted[k].trade_date for k in idxs)

        # Avoid double-counting dollars within the same filing.
        dollars_by_filing: Dict[str, float] = {}
        for k in idxs:
            acc = candidates_sorted[k].accession_number
            dollars_by_filing[acc] = max(dollars_by_filing.get(acc, 0.0), float(candidates_sorted[k].dollars or 0.0))
        total_dollars = sum(dollars_by_filing.values())
        execs_involved = any(candidates_sorted[k].is_exec for k in idxs)
        pct_vals = [
            candidates_sorted[k].pct_change
            for k in idxs
            if isinstance(candidates_sorted[k].pct_change, (int, float))
        ]
        max_pct = max(pct_vals) if pct_vals else None

        members = [
            f"{candidates_sorted[k].issuer_cik}|{candidates_sorted[k].owner_key}|{candidates_sorted[k].accession_number}"
            for k in idxs
        ]
        members_sorted = ",".join(sorted(members))
        members_hash = sha256_hex(members_sorted)
        cluster_id = f"clu|{ticker}|{side}|{window_start}|{window_end}|{members_hash[:12]}"

        # Insert cluster record
        conn.execute(
            """
            INSERT INTO clusters (
                cluster_id, ticker, issuer_cik, side,
                window_start_date, window_end_date,
                unique_insiders, total_dollars, execs_involved, max_pct_holdings_change,
                cluster_version, computed_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                cluster_id,
                ticker,
                candidates_sorted[idxs[0]].issuer_cik,
                side,
                window_start,
                window_end,
                len(filings),
                total_dollars,
                1 if execs_involved else 0,
                max_pct,
                cfg.CURRENT_CLUSTER_VERSION,
                now,
            ),
        )

        # Insert cluster members + update event flags
        for k in idxs:
            c = candidates_sorted[k]

            conn.execute(
                """
                INSERT INTO cluster_members (
                    cluster_id, issuer_cik, owner_key, accession_number, side,
                    trade_date, dollars_contributed, pct_holdings_change
                ) VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    cluster_id,
                    c.issuer_cik,
                    c.owner_key,
                    c.accession_number,
                    side,
                    c.trade_date,
                    c.dollars,
                    c.pct_change,
                ),
            )

            if side == "buy":
                conn.execute(
                    """
                    UPDATE insider_events
                    SET cluster_flag_buy=1, cluster_id_buy=?
                    WHERE issuer_cik=? AND owner_key=? AND accession_number=?
                    """,
                    (cluster_id, c.issuer_cik, c.owner_key, c.accession_number),
                )
            else:
                conn.execute(
                    """
                    UPDATE insider_events
                    SET cluster_flag_sell=1, cluster_id_sell=?
                    WHERE issuer_cik=? AND owner_key=? AND accession_number=?
                    """,
                    (cluster_id, c.issuer_cik, c.owner_key, c.accession_number),
                )

            assigned[k] = True

        _debug(
            f"Built cluster {cluster_id} ticker={ticker} side={side} filings={len(filings)} dollars={total_dollars:.0f} window={window_start}->{window_end}"
        )

        i += 1

def _load_candidates(conn: sqlite3.Connection, ticker: str, side: str) -> List[Candidate]:
    if side == "buy":
        rows = conn.execute(
            """
            SELECT issuer_cik, owner_key, accession_number,
                   buy_trade_date AS trade_date,
                   COALESCE(buy_dollars_total, 0) AS dollars,
                   COALESCE(is_officer,0) AS is_officer,
                   COALESCE(is_director,0) AS is_director,
                   buy_pct_holdings_change AS pct_change
            FROM insider_events
            WHERE ticker=? AND has_buy=1 AND buy_trade_date IS NOT NULL
            """,
            (ticker,),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT issuer_cik, owner_key, accession_number,
                   sell_trade_date AS trade_date,
                   COALESCE(sell_dollars_total, 0) AS dollars,
                   COALESCE(is_officer,0) AS is_officer,
                   COALESCE(is_director,0) AS is_director,
                   sell_pct_holdings_change AS pct_change
            FROM insider_events
            WHERE ticker=? AND has_sell=1 AND sell_trade_date IS NOT NULL
            """,
            (ticker,),
        ).fetchall()

    out: List[Candidate] = []
    for r in rows:
        out.append(
            Candidate(
                issuer_cik=r["issuer_cik"],
                owner_key=r["owner_key"],
                accession_number=r["accession_number"],
                trade_date=r["trade_date"],
                dollars=float(r["dollars"] or 0.0),
                is_exec=(int(r["is_officer"]) == 1 or int(r["is_director"]) == 1),
                pct_change=(float(r["pct_change"]) if isinstance(r["pct_change"], (int, float)) else None),
            )
        )
    return out


def _date_from_iso(s: str) -> date:
    y, m, d = s.split("-")
    return date(int(y), int(m), int(d))

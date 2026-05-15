from __future__ import annotations

from io import BytesIO
from typing import Iterable

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


def render_signal_return_chart_png(
    *,
    ticker: str,
    dates: Iterable[str],
    prices: Iterable[float],
    signal_date: str,
    signal_price: float,
    latest_price: float,
    return_pct: float,
) -> bytes:
    x = list(dates)
    y = [float(v) for v in prices]
    if not x or not y:
        raise ValueError("missing_chart_data")

    fig, ax = plt.subplots(figsize=(10, 5), dpi=150)
    fig.patch.set_facecolor("#0b0b0f")
    ax.set_facecolor("#101016")

    ax.plot(x, y, color="#a78bfa", linewidth=2.4)
    ax.scatter([signal_date], [signal_price], color="#22c55e", s=36, zorder=4, label="Signal")
    ax.scatter([x[-1]], [latest_price], color="#38bdf8", s=36, zorder=4, label="Now")
    ax.fill_between(x, y, min(y), color="#a78bfa", alpha=0.08)

    ax.grid(True, alpha=0.25, color="#e5e7eb", linestyle="-", linewidth=0.6)
    ax.set_title(f"{ticker} | Signal return: {return_pct:.2f}%", color="white", fontsize=13, pad=10)
    ax.tick_params(axis="x", colors="#d4d4d8", labelsize=8, rotation=35)
    ax.tick_params(axis="y", colors="#d4d4d8", labelsize=9)
    for spine in ax.spines.values():
        spine.set_color("#3f3f46")
    ax.legend(facecolor="#111827", edgecolor="#374151", labelcolor="white", fontsize=8)

    buf = BytesIO()
    plt.tight_layout()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return buf.getvalue()


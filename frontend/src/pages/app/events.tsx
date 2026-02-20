"use client";

import * as React from "react";
import { Link } from "react-router-dom";

import type { InsiderEventRow } from "@/lib/types";
import { fmtDate, fmtDollars } from "@/lib/format";
import { apiFetch } from "@/lib/api";

type EventsResponse = {
  days?: number;
  limit?: number;
  offset?: number;
  sort_by?: string;
  side?: string;
  events: InsiderEventRow[];
};

function bestAction(e: InsiderEventRow): "BUY" | "SELL" | "—" {
  const b = typeof (e as any).ai_buy_rating === "number" ? (e as any).ai_buy_rating : null;
  const s = typeof (e as any).ai_sell_rating === "number" ? (e as any).ai_sell_rating : null;
  // If we don't have AI ratings yet, fall back to the underlying transaction side.
  // This prevents the table from showing "—" for obvious buy-only / sell-only events.
  if (b === null && s === null) {
    const hasBuy = Number((e as any).has_buy ?? 0) === 1 || Number((e as any).buy_dollars_total ?? 0) > 0;
    const hasSell = Number((e as any).has_sell ?? 0) === 1 || Number((e as any).sell_dollars_total ?? 0) > 0;
    if (hasBuy && !hasSell) return "BUY";
    if (hasSell && !hasBuy) return "SELL";
    if (hasBuy && hasSell) {
      const bd = Number((e as any).buy_dollars_total ?? 0);
      const sd = Number((e as any).sell_dollars_total ?? 0);
      if (bd === sd) return "—";
      return bd >= sd ? "BUY" : "SELL";
    }
    return "—";
  }
  if (b !== null && (s === null || b >= s)) return "BUY";
  return "SELL";
}

const LOOKBACK_OPTIONS: { label: string; value: number }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
  { label: "365 days", value: 365 },
  { label: "2 years", value: 730 },
];

export function EventsPage() {
  const [days, setDays] = React.useState<number>(30);
  const [side, setSide] = React.useState<"both" | "buy" | "sell">("both");
  const [sortBy, setSortBy] = React.useState<"filing_date_desc" | "ai_best_desc">("filing_date_desc");

  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<EventsResponse | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const aiOnly = sortBy === "ai_best_desc";

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/backend/events", window.location.origin);
      url.searchParams.set("days", String(days));
      url.searchParams.set("side", side);
      url.searchParams.set("sort_by", sortBy);
      url.searchParams.set("ai_only", aiOnly ? "true" : "false");
      url.searchParams.set("open_market_only", "true");
      url.searchParams.set("limit", "200");

      const res = await apiFetch(url.pathname + url.search, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EventsResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, side, sortBy, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm muted">
            {sortBy === "filing_date_desc" ? "Sorted by most recent filings." : "Sorted by best AI rating."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm muted" htmlFor="side">
            Side
          </label>
          <select
            id="side"
            className="input h-9 w-[140px]"
            value={side}
            onChange={(e) => setSide(e.target.value as any)}
          >
            <option value="both">All</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>

          <label className="text-sm muted" htmlFor="sort">
            Sort
          </label>
          <select
            id="sort"
            className="input h-9 w-[170px]"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="filing_date_desc">Most recent</option>
            <option value="ai_best_desc">Best AI</option>
          </select>

          <label className="text-sm muted" htmlFor="lookback">
            Lookback
          </label>
          <select
            id="lookback"
            className="input h-9 w-[140px]"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
          >
            {LOOKBACK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button type="button" className="btn-secondary h-9 px-3" onClick={() => setRefreshKey((x) => x + 1)}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm muted">Loading…</div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr className="border-b border-zinc-200/70 dark:border-zinc-800/60">
                <th className="p-2">Best</th>
                <th className="p-2">Action</th>
                <th className="p-2">Ticker</th>
                <th className="p-2">Insider</th>
                <th className="p-2">Filed</th>
                <th className="p-2">Trade date</th>
                <th className="p-2">Buy $</th>
                <th className="p-2">Sell $</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(data?.events ?? []).map((e, idx) => {
                const best = (e as any).best_ai_rating as number | null | undefined;
                const action = bestAction(e);
                const ticker = String((e as any).ticker || "");
                // The backend historically used -1 as a sentinel for "no AI rating".
                // Treat any negative score as "not available" for display.
                const bestDisplay = typeof best === "number" && best >= 0 ? best.toFixed(1) : "—";

                return (
                  <tr
                    key={`${(e as any).accession_number}-${idx}`}
                    className="border-b border-zinc-200/60 last:border-0 dark:border-zinc-800/60"
                  >
                    <td className="p-2 font-medium">{bestDisplay}</td>
                    <td className="p-2">{action}</td>
                    <td className="p-2">
                      {ticker ? (
                        <Link to={`/app/ticker/${encodeURIComponent(ticker)}`} className="link">
                          {ticker}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">{(e as any).owner_name_display ?? (e as any).owner_key ?? "—"}</td>
                    <td className="p-2">{fmtDate((e as any).filing_date)}</td>
                    <td className="p-2">{fmtDate((e as any).event_trade_date)}</td>
                    <td className="p-2">{fmtDollars((e as any).buy_dollars_total)}</td>
                    <td className="p-2">{fmtDollars((e as any).sell_dollars_total)}</td>
                    <td className="p-2 text-right">
                      <Link
                        to={`/app/event/${(e as any).issuer_cik}/${encodeURIComponent(String((e as any).owner_key))}/${(e as any).accession_number}`}
                        className="link"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {!loading && (data?.events?.length ?? 0) === 0 && (
                <tr>
                  <td className="p-4 muted" colSpan={9}>
                    No events found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

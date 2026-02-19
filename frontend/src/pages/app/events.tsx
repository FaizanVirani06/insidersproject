"use client";

import * as React from "react";
import { Link } from "react-router-dom";

import type { InsiderEventRow } from "@/lib/types";
import { fmtDate, fmtDollars, fmtNumber } from "@/lib/format";
import { apiFetch } from "@/lib/api";

type EventsResponse = {
  days?: number;
  limit?: number;
  offset?: number;
  sort_by?: string;
  events: InsiderEventRow[];
};

function bestAction(e: InsiderEventRow): "BUY" | "SELL" | "—" {
  const b = typeof (e as any).ai_buy_rating === "number" ? (e as any).ai_buy_rating : null;
  const s = typeof (e as any).ai_sell_rating === "number" ? (e as any).ai_sell_rating : null;
  if (b === null && s === null) return "—";
  if (b !== null && (s === null || b >= s)) return "BUY";
  return "SELL";
}

export function EventsPage() {
  const [days, setDays] = React.useState<number>(30);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<EventsResponse | null>(null);

  async function load(d: number) {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/backend/events?days=${encodeURIComponent(String(d))}&sort_by=ai_best_desc&ai_only=true&open_market_only=true&limit=200`;
      const res = await apiFetch(url, { cache: "no-store" });
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
    void load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm muted">Sorted by best AI rating. Default lookback is 30 days.</p>
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(days);
          }}
        >
          <label className="text-sm muted" htmlFor="days">
            Lookback (days)
          </label>
          <input
            id="days"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value || "30", 10))}
            className="input h-9 w-28"
          />
          <button
            type="submit"
            className="btn-secondary h-9 px-3"
          >
            Refresh
          </button>
        </form>
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
                return (
                  <tr
                    key={`${(e as any).accession_number}-${idx}`}
                    className="border-b border-zinc-200/60 last:border-0 dark:border-zinc-800/60"
                  >
                    <td className="p-2 font-medium">{typeof best === "number" ? best.toFixed(1) : "—"}</td>
                    <td className="p-2">{action}</td>
                    <td className="p-2">
                      <Link to={`/app/ticker/${(e as any).ticker}`} className="link">
                        {(e as any).ticker}
                      </Link>
                    </td>
                    <td className="p-2">{(e as any).reporting_owner_name ?? "—"}</td>
                    <td className="p-2">{fmtDate((e as any).filing_date)}</td>
                    <td className="p-2">{fmtDate((e as any).trade_date)}</td>
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
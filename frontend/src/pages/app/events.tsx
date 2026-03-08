"use client";

import * as React from "react";

import type { InsiderEventRow } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { EventCard } from "@/components/event-card";

type EventsResponse = {
  days?: number;
  limit?: number;
  offset?: number;
  sort_by?: string;
  side?: string;
  events: InsiderEventRow[];
};

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
  const [sortBy, setSortBy] = React.useState<"filing_date_desc" | "ai_best_desc" | "sector_asc">("filing_date_desc");
  const [searchQuery, setSearchQuery] = React.useState<string>("");

  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<EventsResponse | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const aiOnly = sortBy === "ai_best_desc";

  const sideButtonClass = (active: boolean) =>
    [
      "h-9 px-4 rounded-lg text-sm transition-all border",
      active
        ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
        : "bg-zinc-900/40 text-zinc-400 border-zinc-800 hover:border-zinc-700",
    ].join(" ");

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

  const events = React.useMemo(() => {
    const list = (data?.events ?? []) as InsiderEventRow[];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((e) => {
      const ticker = String((e as any).ticker ?? "").toLowerCase();
      const issuer = String((e as any).issuer_name ?? "").toLowerCase();
      const sector = String((e as any).sector ?? "").toLowerCase();
      const owner = String((e as any).owner_name_display ?? (e as any).owner_key ?? "").toLowerCase();
      return ticker.includes(q) || issuer.includes(q) || sector.includes(q) || owner.includes(q);
    });
  }, [data, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm muted">
            A real-time feed of recent insider activity. Search, filter, and open a card for the full breakdown.
          </p>
        </div>

        {/* Search */}
        <div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticker, company, sector, or insider…"
            className="input h-12"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={sideButtonClass(side === "both")} onClick={() => setSide("both")}
            >All</button>
          <button type="button" className={sideButtonClass(side === "buy")} onClick={() => setSide("buy")}
            >Buys</button>
          <button type="button" className={sideButtonClass(side === "sell")} onClick={() => setSide("sell")}
            >Sells</button>

          <div className="h-6 w-px bg-zinc-200/70 dark:bg-zinc-800/60 mx-1" />

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
            <option value="sector_asc">Sector (A–Z)</option>
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

        <div className="text-xs muted">
          {loading ? "Loading…" : `Showing ${events.length} event(s)`}
          {sortBy === "ai_best_desc" ? " • AI-only" : ""}
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
        <div className="space-y-4">
          {events.map((e) => (
            <EventCard key={`${e.issuer_cik}|${e.owner_key}|${e.accession_number}`} event={e} />
          ))}

          {events.length === 0 && (
            <div className="glass-card p-6 text-sm muted">No events found for the selected filters.</div>
          )}
        </div>
      )}
    </div>
  );
}

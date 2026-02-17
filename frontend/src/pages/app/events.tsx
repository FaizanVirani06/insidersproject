import * as React from "react";

import type { InsiderEventRow } from "@/lib/types";
import { apiFetch } from "@/lib/api";
import { dedupeEventsByFiling } from "@/lib/event-utils";
import { EventCard } from "@/components/event-card";

type EventsResponse = {
  days: number;
  side?: string;
  offset: number;
  limit: number;
  next_offset: number | null;
  sort_by: string;
  events: InsiderEventRow[];
};

export function EventsPage() {
  const [days, setDays] = React.useState<number>(30);
  const [side, setSide] = React.useState<string>("both");
  const [clusterOnly, setClusterOnly] = React.useState<boolean>(false);
  const [sortBy, setSortBy] = React.useState<string>("ai_best_desc");

  const [events, setEvents] = React.useState<InsiderEventRow[]>([]);
  const [nextOffset, setNextOffset] = React.useState<number | null>(0);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const limit = 50;

  async function fetchPage(mode: "replace" | "append") {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const offset = mode === "append" ? (nextOffset ?? 0) : 0;
      const url = `/api/backend/events?days=${days}&offset=${offset}&limit=${limit}&sort_by=${encodeURIComponent(
        sortBy
      )}&open_market_only=true&cluster_only=${clusterOnly ? "true" : "false"}&ai_only=true&side=${encodeURIComponent(side)}`;
      const res = await apiFetch(url);
      const data = (await res.json()) as EventsResponse;
      const merged = mode === "append" ? [...events, ...(data.events || [])] : (data.events || []);
      const deduped = dedupeEventsByFiling(merged);
      setEvents(deduped);
      setNextOffset(data.next_offset);
    } catch (e: any) {
      setError(e?.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    // Reset list when filters change.
    setEvents([]);
    setNextOffset(0);
    void fetchPage("replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, side, clusterOnly, sortBy]);

  const canLoadMore = nextOffset !== null && nextOffset !== undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Events</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Insider filings, summarized. Tip: insider <span className="font-medium">buys</span> tend to be more predictive than
          insider sells.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-black/20">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-black/60 dark:text-white/60">Lookback</label>
            <select
              className="mt-1 w-full rounded border bg-white px-3 py-2 text-sm dark:bg-black/30"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-black/60 dark:text-white/60">Side</label>
            <select
              className="mt-1 w-full rounded border bg-white px-3 py-2 text-sm dark:bg-black/30"
              value={side}
              onChange={(e) => setSide(e.target.value)}
            >
              <option value="both">Buys + sells</option>
              <option value="buy">Buys only</option>
              <option value="sell">Sells only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-black/60 dark:text-white/60">Sort</label>
            <select
              className="mt-1 w-full rounded border bg-white px-3 py-2 text-sm dark:bg-black/30"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="ai_best_desc">Best AI rating</option>
              <option value="filing_date_desc">Most recent filings</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={clusterOnly}
                onChange={(e) => setClusterOnly(e.target.checked)}
              />
              Cluster only
            </label>
          </div>
        </div>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {events.length === 0 && !loading && !error && (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-black/60 shadow-sm dark:bg-black/20 dark:text-white/60">
          No events found for the selected filters.
        </div>
      )}

      <div className="space-y-4">
        {events.map((e) => (
          <EventCard key={`${e.issuer_cik}-${e.accession_number}-${e.owner_key}`} event={e} />
        ))}
      </div>

      <div className="flex items-center justify-center">
        {loading ? (
          <div className="text-sm text-black/60 dark:text-white/60">Loading…</div>
        ) : (
          canLoadMore && (
            <button
              className="rounded border bg-white px-4 py-2 text-sm shadow-sm hover:bg-black/5 dark:bg-black/30 dark:hover:bg-white/10"
              onClick={() => fetchPage("append")}
            >
              Load more
            </button>
          )
        )}
      </div>
    </div>
  );
}

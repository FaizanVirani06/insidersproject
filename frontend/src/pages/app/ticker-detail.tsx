"use client";

import * as React from "react";
import { useParams } from "react-router-dom";

import type { InsiderEventRow } from "@/lib/types";
import { fmtInt } from "@/lib/format";
import { EventCard } from "@/components/event-card";
import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";
import { dedupeEventsByFiling } from "@/lib/event-utils";

type EventsResponse = {
  ticker: string;
  issuer: any | null;
  market_cap: any | null;
  events: InsiderEventRow[];
  next_offset: number | null;
  total?: number | null;
  reparse_needed?: boolean;
  reparse_enqueued?: boolean;
};

const QUICK_DOLLARS = [
  { label: "Any", value: "" },
  { label: ">= $100k", value: "100000" },
  { label: ">= $500k", value: "500000" },
  { label: ">= $1m", value: "1000000" },
];

export function TickerDetailPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params?.ticker || "").toString().toUpperCase();

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [events, setEvents] = React.useState<InsiderEventRow[]>([]);
  const [issuer, setIssuer] = React.useState<any | null>(null);
  const [marketCap, setMarketCap] = React.useState<any | null>(null);
  const [nextOffset, setNextOffset] = React.useState<number | null>(0);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [clusterOnly, setClusterOnly] = React.useState(false);
  const [aiOnly, setAiOnly] = React.useState(false);
  const [side, setSide] = React.useState<"both" | "buy" | "sell">("both");
  const [officerOnly, setOfficerOnly] = React.useState(false);
  const [directorOnly, setDirectorOnly] = React.useState(false);
  const [tenPercentOnly, setTenPercentOnly] = React.useState(false);
  const [minDollars, setMinDollars] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState<"filing_date_desc" | "ai_best_desc">("filing_date_desc");
  const [showAllEvents, setShowAllEvents] = React.useState(false); // admin only

  const queryString = React.useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("limit", "50");
    sp.set("offset", "0");
    sp.set("sort_by", sortBy);
    sp.set("side", side);
    sp.set("cluster_only", clusterOnly ? "true" : "false");
    sp.set("ai_only", aiOnly ? "true" : "false");
    sp.set("officer_only", officerOnly ? "true" : "false");
    sp.set("director_only", directorOnly ? "true" : "false");
    sp.set("ten_percent_only", tenPercentOnly ? "true" : "false");
    if (minDollars) {
      sp.set("min_dollars", minDollars);
      sp.set("dollars_side", "either");
    }
    if (isAdmin && showAllEvents) {
      sp.set("open_market_only", "false");
    }
    return sp.toString();
  }, [
    aiOnly,
    clusterOnly,
    directorOnly,
    isAdmin,
    minDollars,
    officerOnly,
    showAllEvents,
    side,
    sortBy,
    tenPercentOnly,
  ]);

  async function fetchPage(offset: number, mode: "replace" | "append") {
    const sp = new URLSearchParams(queryString);
    sp.set("offset", String(offset));

    const res = await apiFetch(`/api/backend/ticker/${encodeURIComponent(ticker)}/events?${sp.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = (await res.json()) as EventsResponse;

    setIssuer(data.issuer ?? null);
    setMarketCap(data.market_cap ?? null);
    setNextOffset(data.next_offset ?? null);

    if (mode === "replace") {
      setEvents(dedupeEventsByFiling(data.events ?? []));
    } else {
      setEvents((prev) => dedupeEventsByFiling([...(prev ?? []), ...(data.events ?? [])]));
    }
  }

  // Load first page whenever filters change
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchPage(0, "replace");
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load events");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, queryString]);

  const loadMore = async () => {
    if (nextOffset === null) return;
    setLoadingMore(true);
    setError(null);
    try {
      await fetchPage(nextOffset, "append");
    } catch (e: any) {
      setError(e?.message || "Failed to load more events");
    } finally {
      setLoadingMore(false);
    }
  };

  const title = issuer?.issuer_name ? `${ticker} — ${issuer.issuer_name}` : ticker;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <div className="text-sm text-black/60 dark:text-white/60">
          {issuer?.issuer_cik ? `CIK ${issuer.issuer_cik}` : ""}
          {marketCap?.market_cap_bucket ? ` • ${marketCap.market_cap_bucket}` : ""}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-black/20">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-black/60 dark:text-white/60">Sort</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="mt-1 rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              <option value="filing_date_desc">Filing date (desc)</option>
              <option value="ai_best_desc">Best AI rating</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-black/60 dark:text-white/60">Side</label>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as any)}
              className="mt-1 rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              <option value="both">Both</option>
              <option value="buy">Buy only</option>
              <option value="sell">Sell only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-black/60 dark:text-white/60">Min $</label>
            <select
              value={minDollars}
              onChange={(e) => setMinDollars(e.target.value)}
              className="mt-1 rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              {QUICK_DOLLARS.map((o) => (
                <option key={o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={clusterOnly} onChange={(e) => setClusterOnly(e.target.checked)} />
              Cluster only
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aiOnly} onChange={(e) => setAiOnly(e.target.checked)} />
              AI only
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={officerOnly} onChange={(e) => setOfficerOnly(e.target.checked)} />
              Officer
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={directorOnly} onChange={(e) => setDirectorOnly(e.target.checked)} />
              Director
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tenPercentOnly}
                onChange={(e) => setTenPercentOnly(e.target.checked)}
              />
              10% owner
            </label>
            {isAdmin && (
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showAllEvents}
                  onChange={(e) => setShowAllEvents(e.target.checked)}
                />
                Show all (admin)
              </label>
            )}
          </div>
        </div>

        <div className="mt-3 text-xs text-black/50 dark:text-white/50">
          Default sort is filing date desc. Use “Best AI rating” to surface the strongest AI-scored events.
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-black/60 dark:text-white/60">Loading…</div>
      ) : (
        <>
          <div className="text-xs text-black/50 dark:text-white/50">
            Showing {fmtInt(events.length)} event(s)
          </div>

          <div className="space-y-3">
            {events.map((e) => (
              <EventCard key={`${e.issuer_cik}|${e.owner_key}|${e.accession_number}`} event={e} />
            ))}
          </div>

          {nextOffset !== null && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-md border px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
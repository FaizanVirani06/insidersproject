import * as React from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "@/lib/api";
import type { InsiderEventRow } from "@/lib/types";
import { dedupeEventsByFiling } from "@/lib/event-utils";
import { EventCard } from "@/components/event-card";

type RecommendationsResponse = {
  days: number;
  limit: number;
  offset: number;
  next_offset: number | null;
  applied: {
    trade_side: "buy" | "sell" | "both";
    min_ai_rating: number;
    max_beta: number | null;
    preferred_sectors: string[];
  };
  profile?: any;
  events: InsiderEventRow[];
};

function fmtMaybe(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number" && Number.isFinite(v)) return v.toString();
  return String(v);
}

export function RecommendationsPage() {
  const [days, setDays] = React.useState<number>(30);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<RecommendationsResponse | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/recommendations", window.location.origin);
      url.searchParams.set("days", String(days));
      url.searchParams.set("limit", "100");

      const res = await apiFetch(url.pathname + url.search, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const json = (await res.json()) as RecommendationsResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const events = React.useMemo(() => {
    const list = data?.events ?? [];
    return dedupeEventsByFiling(list);
  }, [data?.events]);

  const applied = data?.applied;
  const sectors = applied?.preferred_sectors ?? [];

  return (
    <div>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="bg-gradient-to-r from-purple-500 via-cyan-500 to-blue-500 bg-clip-text text-transparent">
              For you
            </span>
          </h1>
          <p className="mt-1 text-sm muted">
            Most recent AI-rated insider trade signals, filtered by your preferences.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/profile" className="btn-secondary h-10 px-4">
            Edit preferences
          </Link>
          <button type="button" className="btn-primary h-10 px-4" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-wide muted">window</div>
          <div className="mt-1 text-lg font-semibold">Last {days} days</div>
          <div className="mt-3">
            <label className="text-xs muted">Lookback</label>
            <select
              className="input mt-1 h-10"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Lookback window"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-wide muted">filters</div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs muted">Side</div>
              <div className="font-semibold capitalize">{applied?.trade_side ?? "buy"}</div>
            </div>
            <div>
              <div className="text-xs muted">Min AI rating</div>
              <div className="font-semibold">{fmtMaybe(applied?.min_ai_rating)}</div>
            </div>
            <div>
              <div className="text-xs muted">Max beta</div>
              <div className="font-semibold">{fmtMaybe(applied?.max_beta)}</div>
            </div>
            <div>
              <div className="text-xs muted">Sectors</div>
              <div className="font-semibold">{sectors.length ? sectors.length : "All"}</div>
            </div>
          </div>
          {sectors.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {sectors.slice(0, 6).map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-zinc-200/70 bg-white/60 px-2 py-1 text-xs dark:border-zinc-800/60 dark:bg-black/20"
                >
                  {s}
                </span>
              ))}
              {sectors.length > 6 ? <span className="text-xs muted">+{sectors.length - 6} more</span> : null}
            </div>
          ) : null}
        </div>

        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-wide muted">results</div>
          <div className="mt-1 text-lg font-semibold">{events.length.toLocaleString()} recommendations</div>
          <div className="mt-2 text-sm muted">
            These are SEC Form 4 filings surfaced by the platform based on your saved criteria.
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Latest recommendations</h2>
          <Link to="/app/events" className="link text-sm">
            Browse all events
          </Link>
        </div>

        <div className="mt-4 space-y-4">
          {loading && !data ? <div className="py-10 text-sm muted">Loading…</div> : null}

          {!loading && events.length === 0 ? (
            <div className="glass-card p-8">
              <div className="text-sm font-semibold">No recommendations yet</div>
              <div className="mt-2 text-sm muted">
                Try lowering your minimum AI rating or expanding your sector filters.
              </div>
              <div className="mt-4">
                <Link to="/app/profile" className="btn-primary h-10 px-4">
                  Update preferences
                </Link>
              </div>
            </div>
          ) : null}

          {events.map((e) => (
            <EventCard key={`${e.issuer_cik}|${e.owner_key}|${e.accession_number}`} event={e} />
          ))}
        </div>
      </div>
    </div>
  );
}

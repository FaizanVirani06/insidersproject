"use client";

import * as React from "react";
import { Link } from "react-router-dom";

import type { TickerRow } from "@/lib/types";
import { fmtDate, fmtInt } from "@/lib/format";
import { apiFetch } from "@/lib/api";

export function TickersPage() {
  const [tickers, setTickers] = React.useState<TickerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/backend/tickers?limit=500`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = (await res.json()) as TickerRow[];
        if (!cancelled) setTickers(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load tickers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickers;
    return tickers.filter((t) => {
      const a = (t.current_ticker || "").toLowerCase();
      const b = (t.issuer_name || "").toLowerCase();
      return a.includes(q) || b.includes(q);
    });
  }, [tickers, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Tickers</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Browse issuers, then drill into insider events.
          </p>
        </div>

        <div className="w-full max-w-sm">
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Search
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            placeholder="AAPL, MSFT, ..."
          />
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((t) => (
            <Link
              key={t.current_ticker}
              to={`/app/ticker/${encodeURIComponent(t.current_ticker)}`}
              className="rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow dark:bg-black/20"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold tracking-tight">
                      {t.current_ticker}
                    </div>
                    {t.market_cap_bucket && (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-black/60 dark:text-white/60">
                        {t.market_cap_bucket}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-black/70 dark:text-white/70">
                    {t.issuer_name || "—"}
                  </div>
                  <div className="mt-1 text-xs text-black/50 dark:text-white/50">
                    CIK: {t.issuer_cik} • Last filing: {fmtDate(t.last_filing_date)}
                  </div>
                </div>

                <div className="shrink-0 text-right text-xs text-black/60 dark:text-white/60">
                  <div>Events: {fmtInt(t.open_market_event_count ?? 0)}</div>
                  <div>AI: {fmtInt(t.ai_event_count ?? 0)}</div>
                  <div>Clusters: {fmtInt(t.cluster_event_count ?? 0)}</div>
                </div>
              </div>
            </Link>
          ))}

          {filtered.length === 0 && (
            <div className="text-sm text-black/60 dark:text-white/60">No tickers found.</div>
          )}
        </div>
      )}
    </div>
  );
}
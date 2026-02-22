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
  const [sortBy, setSortBy] = React.useState<"last_filing_desc" | "ticker_asc" | "sector_asc">(
    "last_filing_desc"
  );

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
    let out = tickers;
    if (q) {
      out = tickers.filter((t) => {
        const a = (t.current_ticker || "").toLowerCase();
        const b = (t.issuer_name || "").toLowerCase();
        const c = (t.sector || "").toLowerCase();
        return a.includes(q) || b.includes(q) || c.includes(q);
      });
    }

    const cmpStr = (x: any, y: any) => String(x || "").localeCompare(String(y || ""));
    const cmpDateDesc = (x?: string | null, y?: string | null) => {
      const ax = x ? Date.parse(x) : 0;
      const ay = y ? Date.parse(y) : 0;
      return ay - ax;
    };

    const sorted = [...out];
    if (sortBy === "ticker_asc") {
      sorted.sort((a, b) => cmpStr(a.current_ticker, b.current_ticker));
    } else if (sortBy === "sector_asc") {
      sorted.sort((a, b) => {
        const s = cmpStr(a.sector, b.sector);
        if (s !== 0) return s;
        return cmpDateDesc(a.last_filing_date, b.last_filing_date);
      });
    } else {
      // default: last filing desc
      sorted.sort((a, b) => cmpDateDesc(a.last_filing_date, b.last_filing_date));
    }

    return sorted;
  }, [tickers, query, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Tickers</h1>
          <p className="mt-1 text-sm muted">Browse issuers, then drill into insider events.</p>
        </div>

        <div className="flex w-full max-w-xl items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium muted">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input mt-1"
              placeholder="AAPL, MSFT, technology, ..."
            />
          </div>

          <div className="w-48">
            <label className="block text-xs font-medium muted">Sort</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="input mt-1"
            >
              <option value="last_filing_desc">Last filing</option>
              <option value="ticker_asc">Ticker (A–Z)</option>
              <option value="sector_asc">Sector (A–Z)</option>
            </select>
          </div>
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((t) => (
            <Link
              key={t.current_ticker}
              to={`/app/ticker/${encodeURIComponent(t.current_ticker)}`}
              className="glass-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold tracking-tight">
                      {t.current_ticker}
                    </div>
                    {t.market_cap_bucket && (
                      <span className="badge">
                        {t.market_cap_bucket}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-zinc-800 dark:text-zinc-200">
                    {t.issuer_name || "—"}
                  </div>
                  <div className="mt-0.5 truncate text-xs muted-2">
                    Sector: {t.sector || "—"}
                  </div>
                  <div className="mt-1 text-xs muted-2">
                    CIK: {t.issuer_cik} • Last filing: {fmtDate(t.last_filing_date)}
                  </div>
                </div>

                <div className="shrink-0 text-right text-xs muted">
                  <div>Events: {fmtInt(t.open_market_event_count ?? 0)}</div>
                  <div>AI: {fmtInt(t.ai_event_count ?? 0)}</div>
                  <div>Clusters: {fmtInt(t.cluster_event_count ?? 0)}</div>
                </div>
              </div>
            </Link>
          ))}

          {filtered.length === 0 && (
            <div className="text-sm muted">No tickers found.</div>
          )}
        </div>
      )}
    </div>
  );
}
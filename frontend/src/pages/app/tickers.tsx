"use client";

import * as React from "react";
import { Link } from "react-router-dom";

import type { TickerRow } from "@/lib/types";
import { fmtDate, fmtInt } from "@/lib/format";
import { apiFetch } from "@/lib/api";

type TickersResponse = {
  q?: string | null;
  sort_by?: string;
  limit: number;
  offset: number;
  next_offset: number | null;
  prev_offset: number | null;
  total_count?: number | null;
  total_pages?: number | null;
  tickers: TickerRow[];
};

const PAGE_SIZE = 50;

function buildPageItems(current: number, total: number): Array<number | "…"> {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: Array<number | "…"> = [1];

  // Determine a small sliding window around the current page.
  let start = Math.max(2, current - 1);
  let end = Math.min(total - 1, current + 1);

  // If we're near the beginning, show 2-4.
  if (current <= 4) {
    start = 2;
    end = 4;
  }

  // If we're near the end, show (total-3)-(total-1).
  if (current >= total - 3) {
    start = Math.max(2, total - 3);
    end = total - 1;
  }

  if (start > 2) items.push("…");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("…");

  items.push(total);
  return items;
}

type PaginationBarProps = {
  loading: boolean;
  page: number;
  totalPages: number | null;
  totalCount: number | null;
  showingStart: number;
  showingEnd: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onPage: (p: number) => void;
  pageJump: string;
  setPageJump: (v: string) => void;
  onJump: () => void;
  canPrev: boolean;
  canNext: boolean;
};

function PaginationBar(props: PaginationBarProps) {
  const {
    loading,
    page,
    totalPages,
    totalCount,
    showingStart,
    showingEnd,
    onFirst,
    onPrev,
    onNext,
    onLast,
    onPage,
    pageJump,
    setPageJump,
    onJump,
    canPrev,
    canNext,
  } = props;

  const hasTotal = totalPages !== null;
  const hasPages = totalPages !== null && totalPages > 0;

  const pageItems = React.useMemo(() => {
    if (!hasPages || totalPages === null) return [];
    return buildPageItems(page, totalPages);
  }, [page, totalPages, hasPages]);

  const showingLabel = React.useMemo(() => {
    if (totalCount === null) {
      return `Showing ${showingStart}-${showingEnd}`;
    }
    if (totalCount === 0) {
      return "0 results";
    }
    return `Showing ${showingStart}-${showingEnd} of ${fmtInt(totalCount)}`;
  }, [totalCount, showingStart, showingEnd]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-xs muted">
        {hasTotal ? (
          totalPages === 0 ? (
            "No results"
          ) : (
            <>Page {page} of {totalPages}</>
          )
        ) : (
          <>Page {page}</>
        )}
        {" "}• {showingLabel}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary h-9 px-3"
          onClick={onFirst}
          disabled={loading || !canPrev}
          title="First page"
        >
          First
        </button>

        <button
          type="button"
          className="btn-secondary h-9 px-3"
          onClick={onPrev}
          disabled={loading || !canPrev}
          title="Previous page"
        >
          Previous
        </button>

        {hasPages && (
          <div className="flex items-center gap-1">
            {pageItems.map((it, idx) =>
              it === "…" ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-xs muted">
                  …
                </span>
              ) : (
                <button
                  key={`page-${it}`}
                  type="button"
                  className={it === page ? "btn-primary h-9 px-3" : "btn-ghost h-9 px-3"}
                  onClick={() => onPage(it)}
                  disabled={loading}
                  aria-current={it === page ? "page" : undefined}
                >
                  {it}
                </button>
              )
            )}
          </div>
        )}

        <button
          type="button"
          className="btn-secondary h-9 px-3"
          onClick={onNext}
          disabled={loading || !canNext}
          title="Next page"
        >
          Next
        </button>

        <button
          type="button"
          className="btn-secondary h-9 px-3"
          onClick={onLast}
          disabled={loading || !hasPages || !canNext}
          title="Last page"
        >
          Last
        </button>

        {hasPages && (
          <div className="ml-2 flex items-center gap-2">
            <span className="text-xs muted">Go to</span>
            <input
              value={pageJump}
              onChange={(e) => setPageJump(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onJump();
                }
              }}
              inputMode="numeric"
              className="input h-9 w-20 text-center"
              placeholder={String(page)}
            />
            <span className="text-xs muted">/ {totalPages}</span>
            <button type="button" className="btn-secondary h-9 px-3" onClick={onJump} disabled={loading}>
              Go
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TickersPage() {
  const [tickers, setTickers] = React.useState<TickerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Search + sort
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"last_filing_desc" | "ticker_asc" | "sector_asc">(
    "last_filing_desc"
  );

  // Pagination
  const [offset, setOffset] = React.useState(0);
  const [nextOffset, setNextOffset] = React.useState<number | null>(null);
  const [prevOffset, setPrevOffset] = React.useState<number | null>(null);

  // Total count is used only for direct page number navigation.
  const [totalCount, setTotalCount] = React.useState<number | null>(null);
  const totalCountKeyRef = React.useRef<string>("__init__");

  // Page-jump input.
  const [pageJump, setPageJump] = React.useState<string>("1");

  // Debounce the query so we don't spam the API on every keystroke.
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/backend/tickers", window.location.origin);
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("offset", String(offset));
        url.searchParams.set("sort_by", sortBy);

        const q = debouncedQuery.trim();
        if (q) url.searchParams.set("q", q);

        // Only request total_count when the filter changes (or on the very first load).
        // This keeps page-to-page navigation cheap even if the issuer universe grows.
        const countKey = q; // count depends only on the filter, not sort.
        const includeTotal = totalCountKeyRef.current !== countKey;
        if (includeTotal) url.searchParams.set("include_total", "true");

        const res = await apiFetch(url.pathname + url.search, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(await res.text());
        }

        const data = (await res.json()) as TickersResponse;
        if (cancelled) return;

        setTickers(data.tickers ?? []);
        setNextOffset(data.next_offset ?? null);
        setPrevOffset(data.prev_offset ?? null);

        if (typeof data.total_count === "number") {
          setTotalCount(data.total_count);
          totalCountKeyRef.current = countKey;
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load tickers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [offset, sortBy, debouncedQuery]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount === null ? null : Math.ceil(totalCount / PAGE_SIZE);
  const showingStart = tickers.length > 0 ? offset + 1 : 0;
  const showingEnd = tickers.length > 0 ? offset + tickers.length : 0;

  React.useEffect(() => {
    setPageJump(String(page));
  }, [page]);

  const goPrev = () => {
    if (prevOffset === null) return;
    setOffset(prevOffset);
  };

  const goNext = () => {
    if (nextOffset === null) return;
    setOffset(nextOffset);
  };

  const goFirst = () => {
    if (offset === 0) return;
    setOffset(0);
  };

  const goLast = () => {
    if (totalPages === null || totalPages <= 0) return;
    const lastOffset = (totalPages - 1) * PAGE_SIZE;
    if (lastOffset === offset) return;
    setOffset(lastOffset);
  };

  const jumpToPage = (p: number) => {
    if (!Number.isFinite(p)) return;
    let pageNum = Math.trunc(p);
    if (pageNum < 1) pageNum = 1;
    if (totalPages !== null && totalPages > 0 && pageNum > totalPages) pageNum = totalPages;
    setOffset((pageNum - 1) * PAGE_SIZE);
  };

  const submitJump = () => {
    const n = parseInt(pageJump, 10);
    if (!Number.isFinite(n)) return;
    jumpToPage(n);
  };

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
              onChange={(e) => {
                setQuery(e.target.value);
                // When the query changes, reset back to the first page.
                if (offset !== 0) setOffset(0);
              }}
              className="input mt-1"
              placeholder="AAPL, MSFT, technology, ..."
            />
          </div>

          <div className="w-48">
            <label className="block text-xs font-medium muted">Sort</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                // When the sort changes, reset back to the first page.
                if (offset !== 0) setOffset(0);
              }}
              className="input mt-1"
            >
              <option value="last_filing_desc">Last filing</option>
              <option value="ticker_asc">Ticker (A–Z)</option>
              <option value="sector_asc">Sector (A–Z)</option>
            </select>
          </div>
        </div>
      </div>

      {debouncedQuery.trim() ? (
        <div className="text-xs muted">
          Filter: <span className="font-medium">{debouncedQuery.trim()}</span>
        </div>
      ) : null}

      <PaginationBar
        loading={loading}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        showingStart={showingStart}
        showingEnd={showingEnd}
        onFirst={goFirst}
        onPrev={goPrev}
        onNext={goNext}
        onLast={goLast}
        onPage={jumpToPage}
        pageJump={pageJump}
        setPageJump={setPageJump}
        onJump={submitJump}
        canPrev={prevOffset !== null}
        canNext={nextOffset !== null}
      />

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm muted">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {tickers.map((t) => (
              <Link
                key={`${t.issuer_cik}|${t.current_ticker}`}
                to={`/app/ticker/${encodeURIComponent(t.current_ticker)}`}
                className="glass-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-lg font-semibold tracking-tight">{t.current_ticker}</div>
                      {t.market_cap_bucket && <span className="badge">{t.market_cap_bucket}</span>}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-zinc-800 dark:text-zinc-200">
                      {t.issuer_name || "—"}
                    </div>
                    <div className="mt-0.5 truncate text-xs muted-2">Sector: {t.sector || "—"}</div>
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
          </div>

          {tickers.length === 0 && <div className="text-sm muted">No tickers found.</div>}

          <div className="pt-2">
            <PaginationBar
              loading={loading}
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              showingStart={showingStart}
              showingEnd={showingEnd}
              onFirst={goFirst}
              onPrev={goPrev}
              onNext={goNext}
              onLast={goLast}
              onPage={jumpToPage}
              pageJump={pageJump}
              setPageJump={setPageJump}
              onJump={submitJump}
              canPrev={prevOffset !== null}
              canNext={nextOffset !== null}
            />
          </div>
        </>
      )}
    </div>
  );
}

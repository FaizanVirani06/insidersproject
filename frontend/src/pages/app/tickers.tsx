"use client";

import * as React from "react";
import { Link } from "react-router-dom";

import type { TickerRow } from "@/lib/types";
import { fmtAiRating, fmtDate, fmtInt, fmtNumber } from "@/lib/format";
import { apiFetch } from "@/lib/api";

type TickersResponse = {
  q?: string | null;
  sector?: string | null;
  sort_by?: string;
  limit: number;
  offset: number;
  next_offset: number | null;
  prev_offset: number | null;
  total_count?: number | null;
  total_pages?: number | null;
  tickers: TickerRow[];
};

type SectorResponse = { sectors: string[] };

const PAGE_SIZE = 24;

function buildPageItems(current: number, total: number): Array<number | "…"> {
  if (total <= 1) return [1];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: Array<number | "…"> = [1];
  let start = Math.max(2, current - 1);
  let end = Math.min(total - 1, current + 1);

  if (current <= 4) {
    start = 2;
    end = 4;
  }
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
  setPageJump: (value: string) => void;
  onJump: () => void;
  canPrev: boolean;
  canNext: boolean;
};

function PaginationBar({
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
}: PaginationBarProps) {
  const hasPages = totalPages !== null && totalPages > 0;
  const pageItems = React.useMemo(() => {
    if (!hasPages || totalPages === null) return [];
    return buildPageItems(page, totalPages);
  }, [page, totalPages, hasPages]);

  const showingLabel = React.useMemo(() => {
    if (totalCount === null) return `Showing ${showingStart}-${showingEnd}`;
    if (totalCount === 0) return "0 results";
    return `Showing ${showingStart}-${showingEnd} of ${fmtInt(totalCount)}`;
  }, [totalCount, showingStart, showingEnd]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 bg-white/50 px-4 py-3 text-sm backdrop-blur-xl dark:border-zinc-800/60 dark:bg-black/25">
      <div className="muted">
        {hasPages ? `Page ${page} of ${totalPages}` : `Page ${page}`} • {showingLabel}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary h-9 px-3" onClick={onFirst} disabled={loading || !canPrev}>
          First
        </button>
        <button type="button" className="btn-secondary h-9 px-3" onClick={onPrev} disabled={loading || !canPrev}>
          Previous
        </button>

        {hasPages ? (
          <div className="hidden items-center gap-1 md:flex">
            {pageItems.map((item, index) =>
              item === "…" ? (
                <span key={`ellipsis-${index}`} className="px-2 text-xs muted">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={item === page ? "btn-primary h-9 px-3" : "btn-ghost h-9 px-3"}
                  onClick={() => onPage(item)}
                  disabled={loading}
                >
                  {item}
                </button>
              )
            )}
          </div>
        ) : null}

        <button type="button" className="btn-secondary h-9 px-3" onClick={onNext} disabled={loading || !canNext}>
          Next
        </button>
        <button type="button" className="btn-secondary h-9 px-3" onClick={onLast} disabled={loading || !hasPages || !canNext}>
          Last
        </button>

        {hasPages ? (
          <div className="ml-1 hidden items-center gap-2 lg:flex">
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
            <button type="button" className="btn-secondary h-9 px-3" onClick={onJump} disabled={loading}>
              Go
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectorChip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-4 py-2 text-sm transition",
        active
          ? "border-purple-500/40 bg-purple-500/15 text-purple-700 dark:text-purple-300"
          : "border-zinc-200/80 bg-white/60 text-zinc-700 hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-black/25 dark:text-zinc-300 dark:hover:border-zinc-700",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function TickersPage() {
  const [tickers, setTickers] = React.useState<TickerRow[]>([]);
  const [sectors, setSectors] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [selectedSector, setSelectedSector] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<"last_filing_desc" | "ticker_asc" | "sector_asc">("last_filing_desc");

  const [offset, setOffset] = React.useState(0);
  const [nextOffset, setNextOffset] = React.useState<number | null>(null);
  const [prevOffset, setPrevOffset] = React.useState<number | null>(null);
  const [totalCount, setTotalCount] = React.useState<number | null>(null);
  const totalCountKeyRef = React.useRef<string>("__init__");
  const [pageJump, setPageJump] = React.useState<string>("1");

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/public/sectors", { cache: "force-cache" });
        if (!res.ok) return;
        const data = (await res.json()) as SectorResponse;
        if (!cancelled) setSectors(Array.isArray(data.sectors) ? data.sectors : []);
      } catch {
        // ignore sector chip failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        if (selectedSector !== "all") url.searchParams.set("sector", selectedSector);

        const countKey = `${q}|${selectedSector}`;
        const includeTotal = totalCountKeyRef.current !== countKey;
        if (includeTotal) url.searchParams.set("include_total", "true");

        const res = await apiFetch(url.pathname + url.search, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
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
  }, [offset, sortBy, debouncedQuery, selectedSector]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount === null ? null : Math.ceil(totalCount / PAGE_SIZE);
  const showingStart = tickers.length > 0 ? offset + 1 : 0;
  const showingEnd = tickers.length > 0 ? offset + tickers.length : 0;

  React.useEffect(() => {
    setPageJump(String(page));
  }, [page]);

  const goPrev = () => {
    if (prevOffset !== null) setOffset(prevOffset);
  };
  const goNext = () => {
    if (nextOffset !== null) setOffset(nextOffset);
  };
  const goFirst = () => {
    if (offset !== 0) setOffset(0);
  };
  const goLast = () => {
    if (totalPages === null || totalPages <= 0) return;
    const lastOffset = (totalPages - 1) * PAGE_SIZE;
    if (lastOffset !== offset) setOffset(lastOffset);
  };
  const jumpToPage = (pageNumber: number) => {
    if (!Number.isFinite(pageNumber)) return;
    let nextPage = Math.trunc(pageNumber);
    if (nextPage < 1) nextPage = 1;
    if (totalPages !== null && totalPages > 0 && nextPage > totalPages) nextPage = totalPages;
    setOffset((nextPage - 1) * PAGE_SIZE);
  };
  const submitJump = () => {
    const n = parseInt(pageJump, 10);
    if (Number.isFinite(n)) jumpToPage(n);
  };

  const resetToFirstPage = React.useCallback(() => {
    if (offset !== 0) setOffset(0);
  }, [offset]);

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] muted">Company universe</div>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">Tickers</h1>
            <p className="mt-2 text-sm muted">
              Explore issuers, then drill into the event feed behind each symbol. We surface counts and the strongest event-level AI signal without pretending the ticker itself has a single score.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[560px]">
            <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 dark:border-zinc-800/60 dark:bg-black/20">
              <div className="text-xs uppercase tracking-[0.16em] muted">Visible</div>
              <div className="mt-2 text-xl font-semibold">{loading ? "…" : tickers.length.toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 dark:border-zinc-800/60 dark:bg-black/20">
              <div className="text-xs uppercase tracking-[0.16em] muted">Sector</div>
              <div className="mt-2 text-xl font-semibold">{selectedSector === "all" ? "All" : selectedSector}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 dark:border-zinc-800/60 dark:bg-black/20">
              <div className="text-xs uppercase tracking-[0.16em] muted">Sort</div>
              <div className="mt-2 text-xl font-semibold">{sortBy === "ticker_asc" ? "A–Z" : sortBy === "sector_asc" ? "Sector" : "Latest"}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetToFirstPage();
            }}
            className="input h-12"
            placeholder="Search by ticker, company, CIK, or sector…"
          />
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as any);
              resetToFirstPage();
            }}
            className="input h-12"
          >
            <option value="last_filing_desc">Last filing</option>
            <option value="ticker_asc">Ticker (A–Z)</option>
            <option value="sector_asc">Sector (A–Z)</option>
          </select>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <SectorChip
            active={selectedSector === "all"}
            onClick={() => {
              setSelectedSector("all");
              resetToFirstPage();
            }}
          >
            All sectors
          </SectorChip>
          {sectors.map((sector) => (
            <SectorChip
              key={sector}
              active={selectedSector === sector}
              onClick={() => {
                setSelectedSector(sector);
                resetToFirstPage();
              }}
            >
              {sector}
            </SectorChip>
          ))}
        </div>
      </div>

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

      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div> : null}

      {loading ? (
        <div className="glass-card p-6 text-sm muted">Loading tickers…</div>
      ) : tickers.length === 0 ? (
        <div className="glass-panel p-10 text-center">
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">No companies found</div>
          <div className="mt-2 text-sm muted">Try a broader search term or switch back to all sectors.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {tickers.map((ticker) => (
              <Link
                key={`${ticker.issuer_cik}|${ticker.current_ticker}`}
                to={`/app/ticker/${encodeURIComponent(ticker.current_ticker)}`}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/65 p-5 shadow-sm backdrop-blur-xl transition hover:-translate-y-1 hover:border-zinc-300/80 hover:shadow-lg dark:border-zinc-800/60 dark:bg-zinc-900/55 dark:hover:border-zinc-700"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{ticker.current_ticker}</div>
                      {ticker.market_cap_bucket ? (
                        <span className="inline-flex rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-purple-700 dark:text-purple-300">
                          {ticker.market_cap_bucket}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">{ticker.issuer_name || "Unknown issuer"}</div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] muted">Top event AI</div>
                    <div className="mt-1 text-3xl font-semibold text-purple-600 dark:text-purple-400">{fmtAiRating(ticker.best_event_ai_rating)}</div>
                  </div>
                </div>

                <div className="relative mt-4 flex flex-wrap items-center gap-2">
                  {ticker.sector ? (
                    <span className="inline-flex rounded-full border border-zinc-200/80 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-800/60 dark:bg-black/25 dark:text-zinc-300">
                      {ticker.sector}
                    </span>
                  ) : null}
                  {ticker.beta !== null && ticker.beta !== undefined ? (
                    <span className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300">
                      Beta {fmtNumber(ticker.beta, { digits: 2 })}
                    </span>
                  ) : null}
                </div>

                <div className="relative mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 text-center dark:border-zinc-800/60 dark:bg-black/20">
                    <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{fmtInt(ticker.open_market_event_count ?? 0)}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.16em] muted">Events</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 text-center dark:border-zinc-800/60 dark:bg-black/20">
                    <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{fmtInt(ticker.ai_event_count ?? 0)}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.16em] muted">AI-rated events</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 text-center dark:border-zinc-800/60 dark:bg-black/20">
                    <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{fmtInt(ticker.cluster_event_count ?? 0)}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.16em] muted">Clusters</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 text-center dark:border-zinc-800/60 dark:bg-black/20">
                    <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{fmtDate(ticker.last_filing_date)}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.16em] muted">Last filing</div>
                  </div>
                </div>

                <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-zinc-200/70 pt-4 text-sm dark:border-zinc-800/60">
                  <div className="min-w-0 truncate muted">CIK {ticker.issuer_cik}</div>
                  <span className="font-medium text-purple-600 transition group-hover:text-purple-700 dark:text-purple-300 dark:group-hover:text-purple-200">
                    Open ticker →
                  </span>
                </div>
              </Link>
            ))}
          </div>

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
        </>
      )}
    </div>
  );
}

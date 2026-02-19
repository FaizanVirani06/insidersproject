"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";

import type { EventDetail, PricePoint } from "@/lib/types";
import { addDays, fmtDate, fmtDollars, fmtNumber, fmtPercent, minIsoDate } from "@/lib/format";
import { PriceChart } from "@/components/price-chart";
import { RegenerateAIButton } from "@/components/regenerate-ai-button";
import { apiFetch } from "@/lib/api";

export function EventDetailPage() {
  const params = useParams<{ issuer_cik: string; owner_key: string; accession_number: string }>();

  const issuerCik = decodeURIComponent(String(params?.issuer_cik ?? ""));
  const ownerKey = decodeURIComponent(String(params?.owner_key ?? ""));
  const accession = decodeURIComponent(String(params?.accession_number ?? ""));

  const [detail, setDetail] = React.useState<EventDetail | null>(null);
  const [prices, setPrices] = React.useState<PricePoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(
          `/api/backend/event/${encodeURIComponent(issuerCik)}/${encodeURIComponent(ownerKey)}/${encodeURIComponent(accession)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as EventDetail;
        if (cancelled) return;
        setDetail(data);

        // Price chart: request a 1y window around the event.
        const e = data.event;
        const anchor = (e.event_trade_date || e.filing_date || "").slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        if (e.ticker && anchor) {
          const start = addDays(anchor, -365);
          const end = minIsoDate(addDays(anchor, 365), today);

          const pres = await apiFetch(
            `/api/backend/ticker/${encodeURIComponent(e.ticker)}/prices?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=5000`,
            { cache: "no-store" }
          );
          if (pres.ok) {
            const p = await pres.json();
            if (!cancelled) setPrices((p?.prices ?? []) as PricePoint[]);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load event");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [issuerCik, ownerKey, accession]);

  if (loading) {
    return <div className="text-sm text-black/60 dark:text-white/60">Loading…</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!detail) {
    return <div className="text-sm text-black/60 dark:text-white/60">No data.</div>;
  }

  const e = detail.event;
  const verdict = detail.ai_latest?.output?.verdict;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Event</h1>
          <div className="mt-1 text-sm text-black/60 dark:text-white/60">
            {e.ticker ? `${e.ticker} • ` : ""}
            {e.owner_name_display || ownerKey}
            <span className="mx-2">•</span>
            Filing {fmtDate(e.filing_date)}
            {e.event_trade_date ? (
              <>
                <span className="mx-2">•</span>
                Trade {fmtDate(e.event_trade_date)}
              </>
            ) : null}
          </div>
        </div>

        <Link
          to={`/app/ticker/${encodeURIComponent(e.ticker || "")}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
        >
          Back to ticker
        </Link>
      </div>

      {/* Chart */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Price chart</div>
          <div className="text-xs text-black/50 dark:text-white/50">Adj close</div>
        </div>
        <div className="mt-3">
          <PriceChart data={prices} tradeDate={e.event_trade_date} filingDate={e.filing_date} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="glass-card p-4">
          <div className="text-xs text-black/50 dark:text-white/50">Totals</div>
          <div className="mt-2 text-sm">
            <div>
              <span className="text-black/60 dark:text-white/60">Buy</span> {fmtDollars(e.buy_dollars_total ?? null)}
            </div>
            <div>
              <span className="text-black/60 dark:text-white/60">Sell</span> {fmtDollars(e.sell_dollars_total ?? null)}
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-xs text-black/50 dark:text-white/50">AI rating</div>
          <div className="mt-2 text-sm">
            <div>
              <span className="text-black/60 dark:text-white/60">Buy</span> {fmtNumber(e.ai_buy_rating ?? null, { digits: 1 })}
            </div>
            <div>
              <span className="text-black/60 dark:text-white/60">Sell</span> {fmtNumber(e.ai_sell_rating ?? null, { digits: 1 })}
            </div>
            <div className="mt-1 text-xs text-black/50 dark:text-white/50">
              Conf {fmtNumber(e.ai_confidence ?? null, { digits: 2 })}
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-xs text-black/50 dark:text-white/50">Outcomes</div>
          <div className="mt-2 space-y-1 text-sm">
            {detail.outcomes.length === 0 ? (
              <div className="text-black/60 dark:text-white/60">Not computed.</div>
            ) : (
              detail.outcomes.map((o: any) => (
                <div key={`${o.side}-${o.horizon_days}`} className="flex justify-between gap-3">
                  <div className="text-black/60 dark:text-white/60">
                    {String(o.side).toUpperCase()} +{o.horizon_days}d
                  </div>
                  <div className="font-medium">{fmtPercent(o.return, { digits: 1 })}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* AI Panel */}
      <div className="glass-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">AI explanation</div>
            <div className="text-xs text-black/50 dark:text-white/50">
              {detail.ai_latest?.model_id
                ? `${detail.ai_latest.model_id} • ${detail.ai_latest.prompt_version}`
                : "No AI output"}
            </div>
          </div>

          <RegenerateAIButton issuer_cik={issuerCik} owner_key={ownerKey} accession_number={accession} />
        </div>

        {!verdict ? (
          <div className="mt-2 text-sm text-black/60 dark:text-white/60">No AI verdict available.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-semibold">Buy signal</div>
              <div className="mt-2 text-sm">
                Status: <span className="font-medium">{String(verdict.buy_signal?.status ?? "—")}</span>
              </div>
              <div className="mt-1 text-sm">
                Rating: <span className="font-medium">{fmtNumber(verdict.buy_signal?.rating ?? null, { digits: 1 })}</span>
                <span className="text-black/50 dark:text-white/50"> • conf {fmtNumber(verdict.buy_signal?.confidence ?? null, { digits: 2 })}</span>
              </div>
              <div className="mt-2 text-sm text-black/80 dark:text-white/80">
                {verdict.buy_signal?.summary || "—"}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-sm font-semibold">Sell signal</div>
              <div className="mt-2 text-sm">
                Status: <span className="font-medium">{String(verdict.sell_signal?.status ?? "—")}</span>
              </div>
              <div className="mt-1 text-sm">
                Rating: <span className="font-medium">{fmtNumber(verdict.sell_signal?.rating ?? null, { digits: 1 })}</span>
                <span className="text-black/50 dark:text-white/50"> • conf {fmtNumber(verdict.sell_signal?.confidence ?? null, { digits: 2 })}</span>
              </div>
              <div className="mt-2 text-sm text-black/80 dark:text-white/80">
                {verdict.sell_signal?.summary || "—"}
              </div>
            </div>

            {/* Narrative */}
            <div className="rounded-lg border p-3 md:col-span-2">
              <div className="text-sm font-semibold">Narrative</div>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold text-black/50 dark:text-white/50">Thesis</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-black/70 dark:text-white/70">
                    {(detail.ai_latest?.output?.narrative?.thesis_bullets ?? []).slice(0, 8).map((p: any, idx: number) => (
                      <li key={idx}>{String(p)}</li>
                    ))}
                    {(detail.ai_latest?.output?.narrative?.thesis_bullets ?? []).length === 0 && <li>—</li>}
                  </ul>
                </div>

                <div>
                  <div className="text-xs font-semibold text-black/50 dark:text-white/50">Context</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-black/70 dark:text-white/70">
                    {(detail.ai_latest?.output?.narrative?.context_bullets ?? []).slice(0, 8).map((p: any, idx: number) => (
                      <li key={idx}>{String(p)}</li>
                    ))}
                    {(detail.ai_latest?.output?.narrative?.context_bullets ?? []).length === 0 && <li>—</li>}
                  </ul>
                </div>

                <div>
                  <div className="text-xs font-semibold text-black/50 dark:text-white/50">Counterpoints</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-black/70 dark:text-white/70">
                    {(detail.ai_latest?.output?.narrative?.counterpoints_bullets ?? []).slice(0, 8).map((p: any, idx: number) => (
                      <li key={idx}>{String(p)}</li>
                    ))}
                    {(detail.ai_latest?.output?.narrative?.counterpoints_bullets ?? []).length === 0 && <li>—</li>}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI inputs (exactly what we send to the model) */}
      {detail.ai_latest?.input && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">AI inputs</div>
              <div className="text-xs text-black/50 dark:text-white/50">
                Included so users can verify how the AI reached its conclusion.
              </div>
            </div>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-black/70 dark:text-white/70">Show JSON</summary>
            <pre className="mt-2 max-h-[600px] overflow-auto rounded bg-black/5 p-3 text-xs leading-relaxed dark:bg-white/5">
              {JSON.stringify(detail.ai_latest.input, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Raw Form 4 rows */}
      {Array.isArray(detail.rows) && detail.rows.length > 0 && (
        <div className="glass-card p-4">
          <div className="text-sm font-semibold">Raw Form 4 rows ({detail.rows.length})</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-black/50 dark:text-white/50">
                  <th className="border-b p-2">Date</th>
                  <th className="border-b p-2">Code</th>
                  <th className="border-b p-2">Derivative</th>
                  <th className="border-b p-2">Shares</th>
                  <th className="border-b p-2">Price</th>
                  <th className="border-b p-2">Shares owned after</th>
                  <th className="border-b p-2">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map((r: any, idx: number) => {
                  const warnings = (() => {
                    try {
                      const w = typeof r.parser_warnings_json === "string" ? JSON.parse(r.parser_warnings_json) : r.parser_warnings_json;
                      return Array.isArray(w) ? w.join("; ") : "";
                    } catch {
                      return String(r.parser_warnings_json ?? "");
                    }
                  })();
                  return (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="p-2 whitespace-nowrap">{r.transaction_date ?? "—"}</td>
                      <td className="p-2 whitespace-nowrap">{r.transaction_code ?? "—"}</td>
                      <td className="p-2 whitespace-nowrap">{r.is_derivative ? "Yes" : "No"}</td>
                      <td className="p-2 whitespace-nowrap">{typeof r.shares_abs === "number" ? fmtNumber(r.shares_abs) : "—"}</td>
                      <td className="p-2 whitespace-nowrap">{typeof r.price === "number" ? fmtDollars(r.price) : "—"}</td>
                      <td className="p-2 whitespace-nowrap">{typeof r.shares_owned_following === "number" ? fmtNumber(r.shares_owned_following) : "—"}</td>
                      <td className="p-2">{warnings || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw keys */}
      <div className="glass-card p-4 text-xs muted">
        <div>
          <span className="font-medium">issuer_cik</span>: {issuerCik}
        </div>
        <div>
          <span className="font-medium">owner_key</span>: {ownerKey}
        </div>
        <div>
          <span className="font-medium">accession</span>: {accession}
        </div>
      </div>
    </div>
  );
}
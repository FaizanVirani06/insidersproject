"use client";

import * as React from "react";
import { Link } from "react-router-dom";

import type { EventDetail, InsiderEventRow } from "@/lib/types";
import { fmtDate, fmtDollars, fmtNumber, fmtPercent } from "@/lib/format";
import { apiFetch } from "@/lib/api";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-black/70 dark:text-white/70">
      {children}
    </span>
  );
}

function SideBadge({ side }: { side: "buy" | "sell" }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs " +
        (side === "buy"
          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300"
          : "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300")
      }
    >
      {side.toUpperCase()}
    </span>
  );
}

function Rating({ label, rating, confidence }: { label: string; rating?: number | null; confidence?: number | null }) {
  if (rating === null || rating === undefined) {
    return (
      <div className="text-xs text-black/50 dark:text-white/50">
        {label}: —
      </div>
    );
  }
  return (
    <div className="text-xs">
      <span className="font-medium">{label}:</span> {fmtNumber(rating, { digits: 1 })}
      {confidence !== null && confidence !== undefined && (
        <span className="text-black/50 dark:text-white/50"> • conf {fmtNumber(confidence, { digits: 2 })}</span>
      )}
    </div>
  );
}

function pickAiSummary(detail: EventDetail): { side: "buy" | "sell"; status: string; rating: number | null; confidence: number | null; summary: string | null } | null {
  const out = detail.ai_latest?.output;
  if (!out?.verdict) return null;

  const buy = out.verdict.buy_signal;
  const sell = out.verdict.sell_signal;

  // Prefer whichever side is applicable with a rating.
  const candidates: Array<{ side: "buy" | "sell"; sig: any }> = [
    { side: "buy", sig: buy },
    { side: "sell", sig: sell },
  ];

  const applicable = candidates.filter((c) => c.sig?.status === "applicable");
  const pickFrom = applicable.length ? applicable : candidates;

  // Prefer higher rating
  pickFrom.sort((a, b) => (b.sig?.rating ?? -1) - (a.sig?.rating ?? -1));
  const top = pickFrom[0];
  if (!top || !top.sig) return null;

  return {
    side: top.side,
    status: String(top.sig.status ?? "unknown"),
    rating: top.sig.rating ?? null,
    confidence: top.sig.confidence ?? null,
    summary: top.sig.summary ?? null,
  };
}

export function EventCard({ event }: { event: InsiderEventRow }) {
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<EventDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasBuy = Number(event.has_buy ?? 0) === 1;
  const hasSell = Number(event.has_sell ?? 0) === 1;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || detail || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/backend/event/${encodeURIComponent(event.issuer_cik)}/${encodeURIComponent(
          event.owner_key
        )}/${encodeURIComponent(event.accession_number)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as EventDetail;
      setDetail(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load event");
    } finally {
      setLoading(false);
    }
  };

  const aiSummary = detail ? pickAiSummary(detail) : null;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-black/20">
      <button type="button" onClick={toggle} className="w-full text-left">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-base font-semibold">
                {event.owner_name_display || event.owner_key}
              </div>

              {hasBuy && <SideBadge side="buy" />}
              {hasSell && <SideBadge side="sell" />}

              {Number(event.cluster_flag_buy ?? 0) === 1 && <Badge>Cluster Buy</Badge>}
              {Number(event.cluster_flag_sell ?? 0) === 1 && <Badge>Cluster Sell</Badge>}
            </div>

            <div className="mt-1 text-sm text-black/60 dark:text-white/60">
              {event.owner_title || "—"}
              <span className="mx-2">•</span>
              Filing: {fmtDate(event.filing_date)}
              {event.event_trade_date && (
                <>
                  <span className="mx-2">•</span>
                  Trade: {fmtDate(event.event_trade_date)}
                </>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-sm font-medium">
              {hasBuy && <span>{fmtDollars(event.buy_dollars_total ?? null)}</span>}
              {hasBuy && hasSell && <span className="text-black/40 dark:text-white/40"> / </span>}
              {hasSell && <span>{fmtDollars(event.sell_dollars_total ?? null)}</span>}
            </div>
            <div className="mt-1 space-y-0.5">
              <Rating label="AI buy" rating={event.ai_buy_rating} confidence={event.ai_confidence} />
              <Rating label="AI sell" rating={event.ai_sell_rating} confidence={event.ai_confidence} />
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-black/50 dark:text-white/50">
          Click to {open ? "collapse" : "expand"} details
        </div>
      </button>

      {open && (
        <div className="mt-4 border-t pt-4">
          {loading && <div className="text-sm text-black/60 dark:text-white/60">Loading…</div>}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {detail && (
            <div className="space-y-4">
              {/* AI summary */}
              <div className="rounded-lg border bg-black/5 p-3 dark:bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">AI summary</div>
                  {aiSummary && (
                    <div className="text-xs text-black/60 dark:text-white/60">
                      {aiSummary.side.toUpperCase()} • rating {fmtNumber(aiSummary.rating, { digits: 1 })} • conf {fmtNumber(aiSummary.confidence, { digits: 2 })}
                    </div>
                  )}
                </div>

                <div className="mt-2 text-sm text-black/80 dark:text-white/80">
                  {aiSummary?.summary || "No AI summary available for this event."}
                </div>

                {detail.ai_latest?.model_id && (
                  <div className="mt-2 text-xs text-black/50 dark:text-white/50">
                    {detail.ai_latest.model_id} • prompt {detail.ai_latest.prompt_version}
                  </div>
                )}
              </div>

              {/* Outcomes */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-semibold">Outcomes</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {detail.outcomes.length === 0 ? (
                      <div className="text-black/60 dark:text-white/60">No outcomes computed.</div>
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

                <div className="rounded-lg border p-3">
                  <div className="text-sm font-semibold">Insider stats</div>
                  <div className="mt-2 space-y-2 text-sm">
                    {detail.stats.length === 0 ? (
                      <div className="text-black/60 dark:text-white/60">No stats computed.</div>
                    ) : (
                      detail.stats.map((s: any) => (
                        <div key={`${s.side}`} className="space-y-1">
                          <div className="text-xs text-black/50 dark:text-white/50">
                            {String(s.side).toUpperCase()} • eligible 60d {s.eligible_n_60d} / 180d {s.eligible_n_180d}
                          </div>
                          <div className="flex justify-between gap-3">
                            <div className="text-black/60 dark:text-white/60">Win rate (60d)</div>
                            <div className="font-medium">{fmtNumber(s.win_rate_60d ?? null, { digits: 2 })}</div>
                          </div>
                          <div className="flex justify-between gap-3">
                            <div className="text-black/60 dark:text-white/60">Avg return (60d)</div>
                            <div className="font-medium">{fmtNumber(s.avg_return_60d ?? null, { digits: 2 })}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Transaction rows */}
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Transactions</div>
                  <div className="text-xs text-black/50 dark:text-white/50">{detail.rows.length} rows</div>
                </div>

                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-black/50 dark:text-white/50">
                      <tr>
                        <th className="py-1 pr-3">Date</th>
                        <th className="py-1 pr-3">Code</th>
                        <th className="py-1 pr-3">Shares</th>
                        <th className="py-1 pr-3">Price</th>
                        <th className="py-1 pr-3">Deriv</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rows.slice(0, 8).map((r: any) => (
                        <tr key={r.row_id} className="border-t">
                          <td className="py-1 pr-3">{fmtDate(r.transaction_date)}</td>
                          <td className="py-1 pr-3">{r.transaction_code || "—"}</td>
                          <td className="py-1 pr-3">{fmtNumber(r.shares_abs ?? null, { digits: 0 })}</td>
                          <td className="py-1 pr-3">{fmtNumber(r.price ?? null, { digits: 2 })}</td>
                          <td className="py-1 pr-3">{Number(r.is_derivative ?? 0) === 1 ? "Y" : "N"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {detail.rows.length > 8 && (
                    <div className="mt-2 text-xs text-black/50 dark:text-white/50">
                      Showing 8 rows. Open detail page to see everything.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Link
                  to={`/app/event/${encodeURIComponent(event.issuer_cik)}/${encodeURIComponent(
                    event.owner_key
                  )}/${encodeURIComponent(event.accession_number)}`}
                  className="rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  View full event
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
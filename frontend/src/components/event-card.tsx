import * as React from "react";
import { Link } from "react-router-dom";

import type { InsiderEventRow } from "@/lib/types";
import { fmtAiRating, fmtDate, fmtDollars, fmtInt, fmtPercent, fmtUsd } from "@/lib/format";
import { getBestEventAiRating, getEventSideSummaries, getPrimaryEventSide, type EventSideSummary } from "@/lib/event-utils";

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm", className].join(" ")}>
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200/70 bg-white/50 p-3 text-center dark:border-zinc-800/60 dark:bg-black/20">
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] muted">{label}</div>
    </div>
  );
}

function sideClass(summary: EventSideSummary): string {
  return summary.side === "buy"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function buildMetrics(summary: EventSideSummary): Array<{ label: string; value: string }> {
  const metrics: Array<{ label: string; value: string }> = [];

  if (summary.dollars !== null) metrics.push({ label: `${summary.label} value`, value: fmtDollars(summary.dollars) });
  if (summary.shares !== null) metrics.push({ label: `${summary.label} shares`, value: fmtInt(summary.shares) });
  if (summary.vwap !== null) metrics.push({ label: `${summary.label} avg`, value: fmtUsd(summary.vwap) });
  if (summary.pctHoldingsChange !== null) {
    metrics.push({ label: "Holding change", value: fmtPercent(summary.pctHoldingsChange/100, { digits: 1 }) });
  }
  if (summary.aiRating !== null) metrics.push({ label: `${summary.label} AI`, value: fmtAiRating(summary.aiRating) });

  return metrics.slice(0, 4);
}

function SidePanel({ summary }: { summary: EventSideSummary }) {
  const metrics = buildMetrics(summary);

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 backdrop-blur-sm dark:border-zinc-800/60 dark:bg-black/20">
      <div className="flex items-center justify-between gap-2">
        <Pill className={sideClass(summary)}>{summary.label}</Pill>
        {summary.clusterFlag ? <Pill className="border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">Cluster</Pill> : null}
      </div>

      {summary.tradeDate ? <div className="mt-3 text-xs muted">Trade date: {fmtDate(summary.tradeDate)}</div> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {metrics.length > 0 ? (
          metrics.map((metric) => <Metric key={metric.label} label={metric.label} value={metric.value} />)
        ) : (
          <div className="col-span-2 rounded-xl border border-dashed border-zinc-300/70 px-3 py-4 text-sm muted dark:border-zinc-700/70">
            Open the event for the full transaction breakdown.
          </div>
        )}
      </div>
    </div>
  );
}

function getOwnerDisplay(event: InsiderEventRow): { title: string; subtitle: string | null } {
  const ownerCount = Number((event as any).owner_count ?? 0);
  const ownerNames = Array.isArray((event as any).owner_names) ? ((event as any).owner_names as string[]) : [];

  if (ownerCount > 1) {
    const preview = ownerNames.slice(0, 2).join(", ");
    const remainder = ownerCount > 2 ? ` +${ownerCount - 2} more` : "";
    return {
      title: `${ownerCount} insiders`,
      subtitle: preview ? `${preview}${remainder}` : "Grouped filing",
    };
  }

  return {
    title: String(event.owner_name_display || event.owner_key || "Unknown insider"),
    subtitle: event.owner_title ? String(event.owner_title) : null,
  };
}

export function EventCard({ event }: { event: InsiderEventRow }) {
  const summaries = getEventSideSummaries(event);
  const bestAi = getBestEventAiRating(event);
  const primarySide = getPrimaryEventSide(event);
  const owner = getOwnerDisplay(event);
  const confidence =
    event.ai_confidence === null || event.ai_confidence === undefined || Number.isNaN(Number(event.ai_confidence))
      ? null
      : `${Math.round(Number(event.ai_confidence) * 100)}%`;

  return (
    <Link
      to={`/app/event/${encodeURIComponent(event.issuer_cik)}/${encodeURIComponent(event.owner_key)}/${encodeURIComponent(event.accession_number)}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/65 p-5 shadow-sm backdrop-blur-xl transition hover:-translate-y-1 hover:border-zinc-300/80 hover:shadow-lg dark:border-zinc-800/60 dark:bg-zinc-900/55 dark:hover:border-zinc-700"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{event.ticker || "—"}</div>
            {event.market_cap_bucket ? <Pill className="border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300">{String(event.market_cap_bucket)}</Pill> : null}
          </div>
          <div className="mt-1 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">{String((event as any).issuer_name || "Unknown issuer")}</div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] muted">Best event AI</div>
          <div className="mt-1 text-3xl font-semibold text-purple-600 dark:text-purple-400">{fmtAiRating(bestAi)}</div>
          {primarySide ? <div className="mt-1 text-xs muted">{primarySide.toUpperCase()}</div> : null}
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        {event.sector ? <Pill className="border-zinc-200/80 bg-white/70 text-zinc-700 dark:border-zinc-800/60 dark:bg-black/25 dark:text-zinc-300">{String(event.sector)}</Pill> : null}
        {summaries.map((summary) => (
          <Pill key={summary.side} className={sideClass(summary)}>
            {summary.label}
          </Pill>
        ))}
      </div>

      <div className="relative mt-4">
        <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{owner.title}</div>
        <div className="mt-1 text-sm muted">{owner.subtitle || "Insider filing"}</div>
        <div className="mt-2 text-xs muted">
          Filed {fmtDate(event.filing_date)}
          {event.event_trade_date ? <span>{` • Trade ${fmtDate(event.event_trade_date)}`}</span> : null}
          {confidence ? <span>{` • Confidence ${confidence}`}</span> : null}
        </div>
      </div>

      <div className={["relative mt-5 grid gap-3", summaries.length > 1 ? "md:grid-cols-2" : "grid-cols-1"].join(" ")}>
        {summaries.map((summary) => (
          <SidePanel key={summary.side} summary={summary} />
        ))}
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-zinc-200/70 pt-4 text-sm dark:border-zinc-800/60">
        <div className="min-w-0 truncate muted">{event.beta !== null && event.beta !== undefined ? `Beta ${Number(event.beta).toFixed(2)}` : "Open event for full breakdown"}</div>
        <span className="font-medium text-purple-600 transition group-hover:text-purple-700 dark:text-purple-300 dark:group-hover:text-purple-200">
          Open event →
        </span>
      </div>
    </Link>
  );
}

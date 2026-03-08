import type { InsiderEventRow } from "@/lib/types";

export type EventSide = "buy" | "sell";

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function eventHasSide(event: InsiderEventRow, side: EventSide): boolean {
  return Number(side === "buy" ? event.has_buy ?? 0 : event.has_sell ?? 0) === 1;
}

export function getEventDisplaySides(event: InsiderEventRow): EventSide[] {
  const sides: EventSide[] = [];
  if (eventHasSide(event, "buy")) sides.push("buy");
  if (eventHasSide(event, "sell")) sides.push("sell");
  return sides;
}

export function getSideAiRating(event: InsiderEventRow, side: EventSide): number | null {
  return asFiniteNumber(side === "buy" ? event.ai_buy_rating : event.ai_sell_rating);
}

export function getBestEventAiRating(event: InsiderEventRow): number | null {
  const explicit = asFiniteNumber((event as any).best_ai_rating);
  if (explicit !== null) return explicit;
  const buy = getSideAiRating(event, "buy");
  const sell = getSideAiRating(event, "sell");
  if (buy === null && sell === null) return null;
  return Math.max(buy ?? -1, sell ?? -1);
}

export function getPrimaryEventSide(event: InsiderEventRow): EventSide | null {
  const sides = getEventDisplaySides(event);
  if (sides.length === 1) return sides[0];
  if (sides.length === 0) return null;

  const buy = getSideAiRating(event, "buy");
  const sell = getSideAiRating(event, "sell");
  if (buy === null && sell === null) return "buy";
  if (buy !== null && (sell === null || buy >= sell)) return "buy";
  return "sell";
}

export type EventSideSummary = {
  side: EventSide;
  label: "Buy" | "Sell";
  dollars: number | null;
  shares: number | null;
  vwap: number | null;
  pctHoldingsChange: number | null;
  aiRating: number | null;
  clusterFlag: boolean;
  tradeDate: string | null;
};

export function getEventSideSummaries(event: InsiderEventRow): EventSideSummary[] {
  const out: EventSideSummary[] = [];

  if (eventHasSide(event, "buy")) {
    out.push({
      side: "buy",
      label: "Buy",
      dollars: asFiniteNumber(event.buy_dollars_total),
      shares: asFiniteNumber((event as any).buy_shares_total),
      vwap: asFiniteNumber((event as any).buy_vwap_price),
      pctHoldingsChange: asFiniteNumber((event as any).buy_pct_holdings_change),
      aiRating: getSideAiRating(event, "buy"),
      clusterFlag: Number(event.cluster_flag_buy ?? 0) === 1,
      tradeDate: String((event as any).buy_trade_date ?? event.event_trade_date ?? "") || null,
    });
  }

  if (eventHasSide(event, "sell")) {
    out.push({
      side: "sell",
      label: "Sell",
      dollars: asFiniteNumber(event.sell_dollars_total),
      shares: asFiniteNumber((event as any).sell_shares_total),
      vwap: asFiniteNumber((event as any).sell_vwap_price),
      pctHoldingsChange: asFiniteNumber((event as any).sell_pct_holdings_change),
      aiRating: getSideAiRating(event, "sell"),
      clusterFlag: Number(event.cluster_flag_sell ?? 0) === 1,
      tradeDate: String((event as any).sell_trade_date ?? event.event_trade_date ?? "") || null,
    });
  }

  return out;
}

/**
 * Dedupe events that come from the same filing (accession_number).
 *
 * Some SEC filings list multiple reporting owners. The backend stores one
 * event per owner_key, which can look like duplicates in the consumer UI.
 *
 * We group by (issuer_cik, accession_number) and keep the "best" representative
 * (highest AI rating), while preserving a list of all owner display names.
 */
export function dedupeEventsByFiling(events: InsiderEventRow[]): InsiderEventRow[] {
  const map = new Map<string, InsiderEventRow>();
  const ownersMap = new Map<string, { names: string[]; ownerKeys: string[] }>();
  const order: string[] = [];

  for (const event of events) {
    const key = `${event.issuer_cik}|${event.accession_number}`;
    const name = (event.owner_name_display || event.owner_key || "").toString();

    const owners = ownersMap.get(key) ?? { names: [], ownerKeys: [] };
    if (name && !owners.names.includes(name)) owners.names.push(name);
    if (event.owner_key && !owners.ownerKeys.includes(event.owner_key)) owners.ownerKeys.push(event.owner_key);
    ownersMap.set(key, owners);

    const existing = map.get(key);
    const currentScore = getBestEventAiRating(event) ?? -1;
    const existingScore = existing ? getBestEventAiRating(existing) ?? -1 : -1;
    if (!existing) {
      map.set(key, event);
      order.push(key);
      continue;
    }
    // Keep the representative with the higher AI rating (or the existing one if tie).
    if (currentScore > existingScore) {
      map.set(key, event);
    }
  }

  const out: InsiderEventRow[] = [];
  for (const key of order) {
    const event = map.get(key);
    if (!event) continue;
    const owners = ownersMap.get(key);
    out.push({
      ...event,
      owner_names: owners?.names ?? [],
      owner_keys_group: owners?.ownerKeys ?? [],
      owner_count: owners?.names?.length ?? 0,
    } as any);
  }

  return out;
}

import type { InsiderEventRow } from "@/lib/types";

function bestAiRating(e: InsiderEventRow): number {
  const b = typeof e.ai_buy_rating === "number" ? e.ai_buy_rating : -1;
  const s = typeof e.ai_sell_rating === "number" ? e.ai_sell_rating : -1;
  // Some endpoints also provide best_ai_rating.
  const best = typeof (e as any).best_ai_rating === "number" ? ((e as any).best_ai_rating as number) : Math.max(b, s);
  return best;
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

  for (const e of events) {
    const key = `${e.issuer_cik}|${e.accession_number}`;
    const name = (e.owner_name_display || e.owner_key || "").toString();

    const owners = ownersMap.get(key) ?? { names: [], ownerKeys: [] };
    if (name && !owners.names.includes(name)) owners.names.push(name);
    if (e.owner_key && !owners.ownerKeys.includes(e.owner_key)) owners.ownerKeys.push(e.owner_key);
    ownersMap.set(key, owners);

    const existing = map.get(key);
    if (!existing) {
      map.set(key, e);
      order.push(key);
      continue;
    }
    // Keep the representative with the higher AI rating (or the existing one if tie).
    if (bestAiRating(e) > bestAiRating(existing)) {
      map.set(key, e);
    }
  }

  const out: InsiderEventRow[] = [];
  for (const key of order) {
    const e = map.get(key);
    if (!e) continue;
    const owners = ownersMap.get(key);
    out.push({
      ...e,
      owner_names: owners?.names ?? [],
      owner_keys_group: owners?.ownerKeys ?? [],
      owner_count: owners?.names?.length ?? 0,
    } as any);
  }

  return out;
}

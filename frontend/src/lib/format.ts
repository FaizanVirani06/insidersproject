export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return d;
}

export function fmtNumber(n?: number | null, opts?: { digits?: number }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const digits = opts?.digits ?? 2;
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

// -----------------------------
// AI rating formatting
// -----------------------------

/**
 * Convert an internal AI rating to a 1–100 display score.
 *
 * The platform has historically stored AI ratings on a 1–10 scale.
 * The UI now displays ratings on a 1–100 scale.
 *
 * We handle a few possible internal ranges defensively:
 * - 0..1   => treat as normalized score; multiply by 100
 * - 1..10  => treat as 1–10; convert to 1–100 by (rating/10)*100
 * - 1..100 => treat as already on 1–100
 */
export function aiRatingTo100(n?: number | null): number | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;

  let x = Number(n);
  if (!Number.isFinite(x)) return null;

  // Normalize into a 0..100-ish range
  if (x <= 1) {
    x = x * 100;
  } else if (x <= 10) {
    x = (x / 10) * 100;
  } else {
    // Assume it's already 1..100 (or close)
    x = x;
  }

  // Round to an integer score.
  x = Math.round(x);

  // Clamp to the UX range.
  if (x < 1) x = 1;
  if (x > 100) x = 100;
  return x;
}

export function fmtAiRating(n?: number | null): string {
  const v = aiRatingTo100(n);
  return v === null ? "—" : String(v);
}

export function fmtPercent(n?: number | null, opts?: { digits?: number }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const digits = opts?.digits ?? 1;
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtDollars(n?: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  // Use compact notation for large numbers.
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

export function fmtInt(n?: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString();
}

export function addDays(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b;
}

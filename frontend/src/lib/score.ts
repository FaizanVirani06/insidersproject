export function toScore10(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;

  // If we ever receive 0..1 scores (older data or confidence-like scores), map to 1..10.
  if (n > 0 && n < 1) return 1 + n * 9;

  // Common/expected range.
  if (n >= 1 && n <= 10) return n;

  // If we ever receive 0..100 scores, map to 1..10.
  if (n >= 0 && n <= 100) return 1 + (n / 100) * 9;

  return n;
}

export function toConfidence10(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;

  if (n >= 0 && n <= 1) return n * 10;
  if (n >= 1 && n <= 10) return n;
  if (n >= 0 && n <= 100) return (n / 100) * 10;

  return null;
}

export function fmtScore10(v: number | null | undefined, digits = 1): string {
  const s = toScore10(v);
  if (s === null) return "—";
  return `${s.toFixed(digits)}/10`;
}

export function fmtConfidence10(v: number | null | undefined, digits = 1): string {
  const c = toConfidence10(v);
  if (c === null) return "—";
  return `${c.toFixed(digits)}/10`;
}

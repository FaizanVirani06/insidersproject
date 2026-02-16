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

import * as React from "react";

import { apiFetch } from "@/lib/api";

type PricingDisplay = {
  currency: string;
  monthly_usd: number;
  yearly_usd: number;
};

export function AdminSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [display, setDisplay] = React.useState<PricingDisplay | null>(null);
  const [plans, setPlans] = React.useState<{ monthly: string | null; yearly: string | null } | null>(null);

  const [monthlyUsd, setMonthlyUsd] = React.useState<string>("");
  const [yearlyUsd, setYearlyUsd] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<string>("USD");

  async function load() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [dRes, pRes] = await Promise.all([
        apiFetch("/public/pricing-display", { cache: "no-store" }),
        apiFetch("/billing/plans", { cache: "no-store" }),
      ]);

      if (dRes.ok) {
        const d = (await dRes.json()) as PricingDisplay;
        setDisplay(d);
        setMonthlyUsd(String(d.monthly_usd));
        setYearlyUsd(String(d.yearly_usd));
        setCurrency(d.currency || "USD");
      }
      if (pRes.ok) {
        const p = await pRes.json();
        setPlans({ monthly: p?.monthly ?? null, yearly: p?.yearly ?? null });
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const monthly = parseFloat(monthlyUsd);
      const yearly = parseFloat(yearlyUsd);
      if (!Number.isFinite(monthly) || monthly <= 0) throw new Error("Monthly price must be a positive number");
      if (!Number.isFinite(yearly) || yearly <= 0) throw new Error("Yearly price must be a positive number");

      const res = await apiFetch("/admin/site/pricing-display", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ monthly_usd: monthly, yearly_usd: yearly, currency }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const next = json?.pricing as PricingDisplay | undefined;
      if (next) {
        setDisplay(next);
        setMonthlyUsd(String(next.monthly_usd));
        setYearlyUsd(String(next.yearly_usd));
        setCurrency(next.currency || currency);
      }
      setSuccess("Saved. Pricing page will reflect the new display price.");
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin settings</h1>
        <p className="mt-1 text-sm muted">Update user-facing site settings without a deploy.</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </div>
      )}

      <div className="glass-card p-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Pricing display</div>
            <div className="mt-1 text-xs muted">Controls the numbers shown on /pricing (does not change Stripe pricing).</div>
          </div>
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading || saving}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="mt-4 text-sm muted">Loading…</div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium">Monthly (USD)</label>
              <input className="input mt-1" value={monthlyUsd} onChange={(e) => setMonthlyUsd(e.target.value)} />
              {!plans?.monthly && <div className="mt-1 text-xs muted">Stripe monthly plan ID not configured.</div>}
            </div>

            <div>
              <label className="block text-sm font-medium">Yearly (USD)</label>
              <input className="input mt-1" value={yearlyUsd} onChange={(e) => setYearlyUsd(e.target.value)} />
              {!plans?.yearly && <div className="mt-1 text-xs muted">Stripe yearly plan ID not configured.</div>}
            </div>

            <div>
              <label className="block text-sm font-medium">Currency</label>
              <input className="input mt-1" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
              <div className="mt-1 text-xs muted">Typically USD.</div>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={loading || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {display && (
          <div className="mt-4 text-xs muted">
            Current display: {display.currency} {display.monthly_usd}/mo and {display.currency} {display.yearly_usd}/yr
          </div>
        )}
      </div>
    </div>
  );
}

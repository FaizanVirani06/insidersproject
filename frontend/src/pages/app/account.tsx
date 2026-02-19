"use client";

import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";

type PlansResponse = {
  monthly?: string | null;
  yearly?: string | null;
  enabled?: boolean;
};

export function AccountPage() {
  const { user, refresh } = useAuth();
  const [sp] = useSearchParams();
  const [plans, setPlans] = React.useState<PlansResponse>({ enabled: false });
  const [loadingPlans, setLoadingPlans] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPlans(true);
      try {
        const res = await apiFetch("/api/backend/billing/plans", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setPlans({ enabled: false });
          return;
        }
        const p = (await res.json()) as PlansResponse;
        if (!cancelled) setPlans(p);
      } catch {
        if (!cancelled) setPlans({ enabled: false });
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const c = (sp.get("checkout") || "").toLowerCase();
    if (c === "success") {
      setMsg("Payment successful — refreshing your subscription status…");
      refresh();
    }
  }, [sp, refresh]);

  const isPaid = Boolean((user as any)?.is_paid) || user?.role === "admin";
  const status = (user as any)?.subscription_status || "";

  const startCheckout = async (plan: "monthly" | "yearly") => {
    setBusy(plan);
    setError(null);
    setMsg(null);
    try {
      const res = await apiFetch("/api/backend/billing/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "Checkout failed");
        throw new Error(t || "Checkout failed");
      }
      const data = (await res.json()) as any;
      const url = data?.url;
      if (!url) throw new Error("Missing checkout URL");
      window.location.href = String(url);
    } catch (e: any) {
      setError(e?.message || "Checkout failed");
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    setError(null);
    setMsg(null);
    try {
      const res = await apiFetch("/api/backend/billing/portal-session", { method: "POST" });
      if (!res.ok) {
        const t = await res.text().catch(() => "Failed to open billing portal");
        throw new Error(t || "Failed to open billing portal");
      }
      const data = (await res.json()) as any;
      const url = data?.url;
      if (!url) throw new Error("Missing portal URL");
      window.location.href = String(url);
    } catch (e: any) {
      setError(e?.message || "Failed to open billing portal");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-1 text-sm muted">Manage your subscription and billing.</p>
      </div>

      <div className="glass-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Signed in as</div>
            <div className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{user?.username}</div>
            <div className="mt-1 text-xs muted">Role: {user?.role}</div>
          </div>

          <div className="text-right">
            <div className="text-sm font-semibold">Subscription</div>
            <div className="mt-1 text-sm">
              {isPaid ? (
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                  Not active
                </span>
              )}
            </div>
            {status && <div className="mt-1 text-xs muted">Status: {String(status)}</div>}
            {(user as any)?.current_period_end && (
              <div className="mt-1 text-xs muted">Renews: {String((user as any).current_period_end)}</div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => refresh()} className="btn-secondary">
            Refresh status
          </button>

          {!loadingPlans && plans.enabled && !isPaid && (
            <>
              <button
                type="button"
                disabled={!plans.monthly || busy !== null}
                onClick={() => startCheckout("monthly")}
                className="btn-primary"
              >
                {busy === "monthly" ? "Redirecting…" : "Subscribe monthly"}
              </button>

              <button
                type="button"
                disabled={!plans.yearly || busy !== null}
                onClick={() => startCheckout("yearly")}
                className="btn-secondary"
              >
                {busy === "yearly" ? "Redirecting…" : plans.yearly ? "Subscribe yearly" : "Yearly not available"}
              </button>
            </>
          )}

          {isPaid && (user as any)?.stripe_customer_id && (
            <button type="button" disabled={busy !== null} onClick={() => openPortal()} className="btn-secondary">
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>

        {loadingPlans && <div className="mt-4 text-sm muted">Loading billing…</div>}

        {!loadingPlans && !plans.enabled && (
          <div className="mt-4 rounded-md border border-zinc-200/70 bg-white/40 px-3 py-2 text-sm text-zinc-800 backdrop-blur-md dark:border-zinc-800/60 dark:bg-black/30 dark:text-zinc-200">
            Billing is not configured. Set Stripe keys in the backend <span className="font-mono">.env</span>.
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            {msg}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="glass-card p-4 text-xs">
        <div className="font-medium">Troubleshooting</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 muted">
          <li>
            If you just paid and the dashboard is still locked, click <span className="font-medium">Refresh status</span>.
          </li>
          <li>If Stripe webhooks are not configured, your subscription status may not update automatically.</li>
        </ul>
      </div>
    </div>
  );
}

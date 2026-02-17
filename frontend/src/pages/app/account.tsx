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
  const [sp, setSp] = useSearchParams();
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

  const checkoutParam = (sp.get("checkout") || "").toLowerCase();
  const handledCheckoutRef = React.useRef(false);

  React.useEffect(() => {
    // Stripe redirects back with ?checkout=success. If we keep that param in the
    // URL and refresh user state, this effect can fire repeatedly and cause
    // a "glitchy" re-render loop.
    if (handledCheckoutRef.current) return;
    if (checkoutParam === "success") {
      handledCheckoutRef.current = true;
      setMsg("Payment successful — refreshing your subscription status…");
      void refresh();

      // Remove the param from the URL so it doesn't retrigger on re-render.
      const next = new URLSearchParams(sp);
      next.delete("checkout");
      setSp(next, { replace: true } as any);
    }
  }, [checkoutParam, refresh, setSp, sp]);

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
    <div className="mx-auto max-w-3xl py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Manage your subscription and billing.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm dark:bg-black/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Signed in as</div>
            <div className="mt-1 text-sm text-black/70 dark:text-white/70">{user?.username}</div>
            <div className="mt-1 text-xs text-black/50 dark:text-white/50">
              Role: {user?.role}
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm font-semibold">Subscription</div>
            <div className="mt-1 text-sm">
              {isPaid ? (
                <span className="rounded-full border bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                  Active
                </span>
              ) : (
                <span className="rounded-full border bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300 border-amber-500/30">
                  Not active
                </span>
              )}
            </div>
            {status && (
              <div className="mt-1 text-xs text-black/50 dark:text-white/50">
                Status: {String(status)}
              </div>
            )}
            {(user as any)?.current_period_end && (
              <div className="mt-1 text-xs text-black/50 dark:text-white/50">
                Renews: {String((user as any).current_period_end)}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-md border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            Refresh status
          </button>

          {!loadingPlans && plans.enabled && !isPaid && (
            <>
              <button
                type="button"
                disabled={!plans.monthly || busy !== null}
                onClick={() => startCheckout("monthly")}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:opacity-90 dark:bg-white dark:text-black"
              >
                {busy === "monthly" ? "Redirecting…" : "Subscribe monthly"}
              </button>
              <button
                type="button"
                disabled={!plans.yearly || busy !== null}
                onClick={() => startCheckout("yearly")}
                className="rounded-md border px-4 py-2 text-sm disabled:opacity-60 hover:bg-black/5 dark:hover:bg-white/5"
              >
                {busy === "yearly" ? "Redirecting…" : plans.yearly ? "Subscribe yearly" : "Yearly not available"}
              </button>
            </>
          )}

          {isPaid && (user as any)?.stripe_customer_id && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => openPortal()}
              className="rounded-md border px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
            >
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>

        {loadingPlans && (
          <div className="mt-4 text-sm text-black/60 dark:text-white/60">Loading billing…</div>
        )}

        {!loadingPlans && !plans.enabled && (
          <div className="mt-4 rounded-md border bg-black/5 px-3 py-2 text-sm text-black/70 dark:bg-white/5 dark:text-white/70">
            Billing is not configured. Set Stripe keys in the backend .env.
          </div>
        )}

        {msg && (
          <div className="mt-4 rounded-md border bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200 border-emerald-500/30">
            {msg}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-black/5 p-4 text-xs text-black/70 dark:bg-white/5 dark:text-white/70">
        <div className="font-medium">Troubleshooting</div>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>
            If you just paid and the dashboard is still locked, click <span className="font-medium">Refresh status</span>.
          </li>
          <li>
            If Stripe webhooks are not configured, your subscription status may not update automatically.
          </li>
        </ul>
      </div>
    </div>
  );
}
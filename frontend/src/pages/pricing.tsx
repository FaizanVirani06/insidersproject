import * as React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";
import { apiFetch } from "@/lib/api";

type PlansResponse = {
  monthly?: string | null;
  yearly?: string | null;
  enabled?: boolean;
};

async function fetchPlans(): Promise<PlansResponse> {
  const res = await apiFetch("/billing/plans");
  if (!res.ok) return { enabled: false };
  return (await res.json()) as PlansResponse;
}

export function PricingPage() {
  const { user } = useAuth();
  const [plans, setPlans] = React.useState<PlansResponse>({ enabled: false });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await fetchPlans();
        if (!cancelled) setPlans(p);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load pricing");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startCheckout = async (plan: "monthly" | "yearly") => {
    setBusy(plan);
    setError(null);
    try {
      const res = await apiFetch("/billing/checkout-session", {
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

  const isAuthed = !!user;
  const isPaid = Boolean((user as any)?.is_paid) || user?.role === "admin";

  return (
    <div className="mx-auto max-w-4xl py-12">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Pricing</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          Subscribe to unlock the insiders dashboard (tickers, events feed, AI summaries).
        </p>
      </div>

      {loading && (
        <div className="mt-6 text-center text-sm text-black/60 dark:text-white/60">Loading…</div>
      )}

      {!loading && !plans.enabled && (
        <div className="mt-6 rounded-xl border bg-white p-4 text-sm text-black/70 shadow-sm dark:bg-black/20 dark:text-white/70">
          Billing is not configured yet. Set Stripe keys in your backend environment.
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:bg-black/20">
          <div className="text-sm font-semibold">Monthly</div>
          <div className="mt-1 text-xs text-black/60 dark:text-white/60">Best for trying it out</div>
          <ul className="mt-4 space-y-2 text-sm text-black/70 dark:text-white/70">
            <li>• Full dashboard access</li>
            <li>• Global AI-ranked events feed</li>
            <li>• Ticker drilldowns + filters</li>
            <li>• Feedback + support</li>
          </ul>
          <div className="mt-6">
            {!isAuthed ? (
              <Link
                to="/login?next=/pricing"
                className="inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
              >
                Sign in to subscribe
              </Link>
            ) : isPaid ? (
              <Link
                to="/app/tickers"
                className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                You&apos;re already subscribed
              </Link>
            ) : (
              <button
                disabled={!plans.monthly || busy !== null}
                onClick={() => startCheckout("monthly")}
                className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:opacity-90 dark:bg-white dark:text-black"
              >
                {busy === "monthly" ? "Redirecting…" : "Subscribe"}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:bg-black/20">
          <div className="text-sm font-semibold">Yearly</div>
          <div className="mt-1 text-xs text-black/60 dark:text-white/60">Best value (if enabled)</div>
          <ul className="mt-4 space-y-2 text-sm text-black/70 dark:text-white/70">
            <li>• Everything in Monthly</li>
            <li>• One billing cycle</li>
            <li>• Ideal for long-term tracking</li>
          </ul>
          <div className="mt-6">
            {!isAuthed ? (
              <Link
                to="/login?next=/pricing"
                className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                Sign in to subscribe
              </Link>
            ) : isPaid ? (
              <Link
                to="/app/tickers"
                className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                You&apos;re already subscribed
              </Link>
            ) : (
              <button
                disabled={!plans.yearly || busy !== null}
                onClick={() => startCheckout("yearly")}
                className="w-full rounded-md border px-4 py-2 text-sm disabled:opacity-60 hover:bg-black/5 dark:hover:bg-white/5"
              >
                {busy === "yearly" ? "Redirecting…" : plans.yearly ? "Subscribe" : "Not available"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10 rounded-xl border bg-black/5 p-4 text-xs text-black/70 dark:bg-white/5 dark:text-white/70">
        <div className="font-medium">Note</div>
        <div className="mt-1">
          Billing runs through Stripe. After subscribing, refresh your account page if the dashboard
          doesn’t unlock immediately.
        </div>
      </div>
    </div>
  );
}

import * as React from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "@/lib/api";

export function PricingPage() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      // If the user is already logged in, this will create a checkout session.
      // If not, they'll be prompted to sign up first.
      const res = await apiFetch("/api/backend/billing/checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "yearly" }),
      });

      if (res.status === 401) {
        // Not signed in
        window.location.href = "/signup";
        return;
      }

      if (!res.ok) {
        const t = await res.text().catch(() => "Failed to start checkout");
        throw new Error(t || "Failed to start checkout");
      }

      const data = (await res.json()) as any;
      if (data?.url) {
        window.location.href = String(data.url);
        return;
      }
      throw new Error("Missing checkout URL");
    } catch (e: any) {
      setError(e?.message || "Failed to start checkout");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    "Real-time Form 4 discovery",
    "Clustered buy/sell events",
    "AI summaries + ratings",
    "Backfill pipeline",
    "Admin job monitoring",
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div className="text-center">
        <div className="badge">Simple pricing</div>
        <h1 className="mt-5 text-4xl font-bold tracking-tight">
          Unlock the dashboard and AI insights
        </h1>
        <p className="mt-4 text-lg muted">
          Annual plan — built for power users who want continuous filings + monitoring.
        </p>
      </div>

      <div className="glass-panel relative overflow-hidden p-8 sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-cyan-500/10" />

        <div className="relative grid gap-8 md:grid-cols-2 md:items-start">
          <div>
            <div className="text-sm font-semibold">Pro</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold">$200</span>
              <span className="text-sm muted">/ year</span>
            </div>
            <div className="mt-3 text-sm muted">Cancel anytime in Stripe Billing Portal.</div>

            <button
              type="button"
              onClick={start}
              disabled={loading}
              className="btn-primary mt-6 w-full"
            >
              {loading ? "Redirecting…" : "Subscribe"}
            </button>

            <div className="mt-3 text-xs muted">
              Already have an account?{" "}
              <Link className="link" to="/login">
                Log in
              </Link>
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <div className="text-sm font-semibold">What’s included</div>
            <ul className="mt-4 space-y-2 text-sm muted">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 text-xs muted">
              Billing is handled by Stripe. Webhook events keep your subscription state in sync.
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-sm muted">
        Questions? Check the{" "}
        <Link to="/terms" className="link">
          Terms
        </Link>
        {" "}or{" "}
        <Link to="/privacy" className="link">
          Privacy Policy
        </Link>
        .
      </div>
    </div>
  );
}

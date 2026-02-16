import * as React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";

export function HomePage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-5xl py-20 space-y-10">
      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">
          Insider trading analysis,
          <span className="block text-black/60 dark:text-white/60">with AI-rated signals.</span>
        </h1>
        <p className="text-lg text-black/70 dark:text-white/70">
          Track Form 4 filings, identify meaningful buys/sells, and review AI-generated summaries.
        </p>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Link
              to="/app"
              className="rounded-md bg-black px-5 py-3 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
            >
              Open app
            </Link>
          ) : (
            <Link
              to="/signup"
              className="rounded-md bg-black px-5 py-3 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
            >
              Get started
            </Link>
          )}
          <Link
            to="/pricing"
            className="rounded-md border px-5 py-3 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            View pricing
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-black/20">
          <div className="text-sm font-medium">Signal scoring</div>
          <div className="mt-2 text-sm text-black/70 dark:text-white/70">
            AI ratings + confidence scores help you triage filings faster.
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-black/20">
          <div className="text-sm font-medium">Clusters</div>
          <div className="mt-2 text-sm text-black/70 dark:text-white/70">
            Spot clustered insider activity across officers/directors.
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-black/20">
          <div className="text-sm font-medium">Outcomes</div>
          <div className="mt-2 text-sm text-black/70 dark:text-white/70">
            Review historical outcomes around filings and trade dates.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm dark:bg-black/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Ready to try it?</div>
            <div className="mt-1 text-sm text-black/70 dark:text-white/70">
              Create an account and start exploring tickers.
            </div>
          </div>
          <Link
            to={user ? "/app" : "/signup"}
            className="shrink-0 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
          >
            {user ? "Go to app" : "Sign up"}
          </Link>
        </div>
      </div>
    </div>
  );
}

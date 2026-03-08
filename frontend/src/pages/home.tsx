import * as React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";

function IconTrendingUp({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 8h7v7" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconBarChart({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 3v18h18" />
      <path d="M7 16v-6" />
      <path d="M12 16v-10" />
      <path d="M17 16v-3" />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}

export function HomePage() {
  const { user } = useAuth();

  const isPaid = Boolean(user && (user.role === "admin" || user.is_paid));

  const primaryCta = !user
    ? { to: "/signup", label: "Get started" }
    : isPaid
      ? { to: "/app/tickers", label: "Open app" }
      : { to: "/pricing", label: "Subscribe" };

  const secondaryCta = !user
    ? { to: "/pricing", label: "View pricing" }
    : isPaid
      ? { to: "/pricing", label: "View pricing" }
      : { to: "/app", label: "Open app" };

  const features = React.useMemo(
    () => [
      {
        title: "Smart Alerts",
        description:
          "Get notified when executives are buying or selling. Our AI highlights the trades that matter most.",
        Icon: IconTrendingUp,
        gradient: "from-purple-500 to-pink-500",
        border: "border-purple-300/70 dark:border-purple-500/30",
        iconBg: "bg-purple-100/70 dark:bg-purple-500/10",
        iconColor: "text-purple-600 dark:text-purple-300",
      },
      {
        title: "Spot Patterns",
        description:
          "See when multiple insiders are trading at the same time. Patterns can reveal big opportunities.",
        Icon: IconUsers,
        gradient: "from-cyan-500 to-blue-500",
        border: "border-cyan-300/70 dark:border-cyan-500/30",
        iconBg: "bg-cyan-100/70 dark:bg-cyan-500/10",
        iconColor: "text-cyan-600 dark:text-cyan-300",
      },
      {
        title: "Track Results",
        description:
          "See how prices moved after insider trades. Learn what signals work best over time.",
        Icon: IconBarChart,
        gradient: "from-blue-500 to-indigo-500",
        border: "border-blue-300/70 dark:border-blue-500/30",
        iconBg: "bg-blue-100/70 dark:bg-blue-500/10",
        iconColor: "text-blue-600 dark:text-blue-300",
      },
    ],
    []
  );

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative py-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center rounded-full border border-purple-300/70 bg-purple-100/70 px-4 py-2 text-sm text-purple-700 backdrop-blur-sm dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300">
            See What Insiders Are Doing
          </div>

          <h1 className="mt-6 text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Follow the money.
            <br />
            <span className="bg-gradient-to-r from-purple-500 via-cyan-500 to-blue-500 bg-clip-text text-transparent">
              Track insider trades.
            </span>
          </h1>

          <p className="mt-6 text-lg muted">
            When company executives buy or sell their own stock, it’s public information. We make it easy to find and
            understand these trades, so you can make smarter decisions.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to={primaryCta.to}
              className="btn-primary h-11 px-6 shadow-lg shadow-purple-500/30 transition-transform hover:scale-[1.02] hover:shadow-purple-500/45"
            >
              {primaryCta.label}
            </Link>
            <Link
              to={secondaryCta.to}
              className="btn-secondary h-11 px-6 transition-colors"
            >
              {secondaryCta.label}
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-4">
              <div className="text-sm font-semibold">Real-time discovery</div>
              <div className="mt-1 text-sm muted">Monitor new SEC filings and surface high-signal trades quickly.</div>
            </div>
            <div className="glass-card p-4">
              <div className="text-sm font-semibold">Cluster detection</div>
              <div className="mt-1 text-sm muted">Spot multiple insiders buying or selling in a tight window.</div>
            </div>
            <div className="glass-card p-4">
              <div className="text-sm font-semibold">Explainable AI</div>
              <div className="mt-1 text-sm muted">Concise summaries + ratings so you can triage faster.</div>
            </div>
          </div>
        </div>

        {/* Decorative glow blobs */}
        <div className="pointer-events-none absolute right-10 top-8 hidden h-36 w-36 rounded-full bg-purple-400/20 blur-3xl md:block" />
        <div className="pointer-events-none absolute bottom-12 right-28 hidden h-44 w-44 rounded-full bg-cyan-400/15 blur-3xl md:block" />
      </section>

      {/* Features */}
      <section className="py-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((f, idx) => (
            <div
              key={idx}
              className={`group relative overflow-hidden rounded-xl border ${f.border} bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:bg-white hover:shadow-md dark:bg-black/30 dark:hover:bg-black/40`}
            >
              {/* Gradient glow on hover */}
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 transition-opacity group-hover:opacity-10`}
              />

              <div className="relative">
                <div
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${f.iconBg} mb-4 border ${f.border}`}
                >
                  <f.Icon className={`h-6 w-6 ${f.iconColor}`} />
                </div>

                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm muted leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="py-12">
        <div className="relative overflow-hidden rounded-2xl border border-purple-300/70 bg-gradient-to-r from-purple-100/80 to-cyan-100/80 p-8 shadow-md backdrop-blur-sm dark:border-purple-500/30 dark:from-purple-500/10 dark:to-cyan-500/10">
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-purple-200/40 to-cyan-200/40 [animation-duration:3s] dark:from-purple-500/20 dark:to-cyan-500/20" />

          <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">Start following insider trades today</h2>
              <p className="mt-1 text-sm muted">Join investors who track what company insiders are buying and selling.</p>
            </div>

            <Link
              to={primaryCta.to}
              className="btn-primary h-11 whitespace-nowrap px-6 shadow-lg shadow-purple-500/30 transition-transform hover:translate-x-1 hover:shadow-purple-500/45"
            >
              {primaryCta.label}
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

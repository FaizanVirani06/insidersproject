import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="glass-panel relative overflow-hidden p-8 sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-cyan-500/10" />
        <div className="relative">
          <div className="badge">Insider signal engine</div>

          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Find high-signal Form 4 activity —{" "}
            <span className="bg-gradient-to-r from-purple-500 to-cyan-500 bg-clip-text text-transparent">
              faster
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg muted">
            Track insider trades, cluster buys/sells, and generate concise AI summaries that help you triage what matters.
            Built for speed, transparency, and repeatable decision-making.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/signup" className="btn-primary">
              Get started
            </Link>
            <Link to="/pricing" className="btn-secondary">
              View pricing
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-4">
              <div className="text-sm font-semibold">Real-time discovery</div>
              <div className="mt-1 text-sm muted">
                Monitor new SEC filings and surface insider trades quickly.
              </div>
            </div>
            <div className="glass-card p-4">
              <div className="text-sm font-semibold">Cluster detection</div>
              <div className="mt-1 text-sm muted">
                Aggregate insiders across a window to surface stronger, multi-actor signals.
              </div>
            </div>
            <div className="glass-card p-4">
              <div className="text-sm font-semibold">AI summaries</div>
              <div className="mt-1 text-sm muted">
                Structured outputs + ratings for rapid decision-making and consistent UX.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="grid gap-6 md:grid-cols-3">
        <div className="glass-card p-6">
          <div className="text-sm font-semibold">Outcomes & history</div>
          <p className="mt-2 text-sm muted">
            See historical outcomes after insider filings, with charts and horizons that help you validate signals.
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="text-sm font-semibold">Explainable scoring</div>
          <p className="mt-2 text-sm muted">
            Ratings are tied to concrete factors: insider role, buy/sell size, clustering, and market context.
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="text-sm font-semibold">Trade plan</div>
          <p className="mt-2 text-sm muted">
            For eligible buy setups, get technical levels: stop loss, trim targets, and take-profit.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="glass-panel relative overflow-hidden p-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-purple-500/10 to-cyan-500/10" />
        <div className="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <div className="text-xl font-semibold">Ready to explore the feed?</div>
            <div className="mt-1 text-sm muted">Create an account, subscribe, and unlock the full dashboard.</div>
          </div>
          <Link to="/signup" className="btn-primary">
            Create account
          </Link>
        </div>
      </section>
    </div>
  );
}

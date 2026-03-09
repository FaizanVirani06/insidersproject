import { Link } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";

function FeatureCard({
  eyebrow,
  title,
  description,
  tone,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tone: "purple" | "cyan" | "blue";
}) {
  const toneClass =
    tone === "purple"
      ? "from-purple-500/20 to-pink-500/15 border-purple-500/25"
      : tone === "cyan"
        ? "from-cyan-500/20 to-blue-500/15 border-cyan-500/25"
        : "from-blue-500/20 to-indigo-500/15 border-blue-500/25";

  return (
    <div
      className={[
        "group relative overflow-hidden rounded-2xl border bg-zinc-950/55 p-6 shadow-sm backdrop-blur-xl",
        toneClass,
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 transition group-hover:opacity-100" />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{eyebrow}</div>
        <h3 className="mt-3 text-xl font-semibold text-zinc-100">{title}</h3>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="glass-card p-6 dark:bg-zinc-950/45">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 text-sm font-semibold text-purple-300">
        {number}
      </div>
      <div className="mt-4 text-lg font-semibold text-zinc-100">{title}</div>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const appTarget = "/app";

  return (
    <div className="space-y-14 pb-4">
      <section className="relative overflow-hidden rounded-[2rem] border border-zinc-800/70 bg-black/55 px-6 py-12 shadow-2xl shadow-purple-500/10 backdrop-blur-xl sm:px-10 sm:py-16">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.22),transparent_34%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.14),transparent_30%)]" />
        <div className="pointer-events-none absolute -right-16 top-12 h-48 w-48 rounded-full bg-cyan-500/20 blur-[90px]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-56 w-56 rounded-full bg-purple-500/20 blur-[110px]" />

        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:items-center">
          <div>
            <div className="inline-flex items-center rounded-full border border-purple-500/25 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-200">
              See what company insiders are doing
            </div>

            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
              Follow insider trades without needing to speak Wall Street.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
              When executives buy or sell their own stock, that activity becomes public. InsidrsAI turns those filings
              into a clean, easy-to-read feed so newer investors can spot what matters faster.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={appTarget} className="btn-primary h-11 px-6 text-sm">
                Open app
              </Link>
              <Link to="/pricing" className="btn-secondary h-11 px-6 text-sm">
                View pricing
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-zinc-400">
              <span className="rounded-full border border-zinc-800/80 bg-black/35 px-3 py-2">Simple trade feed</span>
              <span className="rounded-full border border-zinc-800/80 bg-black/35 px-3 py-2">
                Signals ranked by importance
              </span>
              <span className="rounded-full border border-zinc-800/80 bg-black/35 px-3 py-2">
                Built from public SEC filings
              </span>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="glass-panel p-5 dark:bg-zinc-950/55">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Inside the app</div>
              <div className="mt-3 text-2xl font-semibold text-zinc-100">A faster way to understand insider activity</div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Buys</div>
                  <div className="mt-2 text-xl font-semibold text-zinc-50">Filtered for conviction</div>
                  <p className="mt-2 text-sm text-zinc-300">
                    See purchase size, insider role, and how meaningful the trade looks.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-300">Sells</div>
                  <div className="mt-2 text-xl font-semibold text-zinc-50">Cleaner context</div>
                  <p className="mt-2 text-sm text-zinc-300">
                    Understand whether a sale looks routine, clustered, or worth a closer look.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800/70 bg-black/40 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">For you</div>
                <div className="mt-2 text-lg font-semibold text-zinc-100">Saved preferences</div>
                <div className="mt-2 text-sm text-zinc-400">Choose sectors, trade side, and minimum AI score.</div>
              </div>
              <div className="rounded-2xl border border-zinc-800/70 bg-black/40 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Trackers</div>
                <div className="mt-2 text-lg font-semibold text-zinc-100">Ticker pages</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Open any company to see recent activity behind the symbol.
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800/70 bg-black/40 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">History</div>
                <div className="mt-2 text-lg font-semibold text-zinc-100">Past results</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Review how the stock moved after earlier insider trades.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <FeatureCard
          eyebrow="Smart alerts"
          tone="purple"
          title="Find the trades worth your time"
          description="We highlight the insider trades that stand out, so you are not scrolling through endless filings just to find one useful signal."
        />
        <FeatureCard
          eyebrow="Pattern spotting"
          tone="cyan"
          title="Notice when multiple insiders move together"
          description="A single filing can be interesting. Several insiders buying around the same time can tell a much stronger story."
        />
        <FeatureCard
          eyebrow="Outcome tracking"
          tone="blue"
          title="See what happened after the filing"
          description="Check how the stock performed after prior insider activity so you can build intuition over time."
        />
      </section>

      <section className="space-y-6">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">How it works</div>
          <h2 className="mt-2 text-3xl font-semibold text-zinc-100">Designed to feel clear from day one</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            InsidrsAI is built for people who want useful insight quickly. You do not need to read raw SEC filings or
            know every industry term before getting value.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <StepCard
            number="1"
            title="Open the feed"
            description="Start with the latest insider events or jump straight into your personalized “For you” page."
          />
          <StepCard
            number="2"
            title="Follow the context"
            description="Each card shows the key numbers, the insider involved, and whether the event is a buy, a sell, or part of a cluster."
          />
          <StepCard
            number="3"
            title="Go deeper only when you want"
            description="Open the detail page for the full story, historical context, and the AI summary behind the event."
          />
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2rem] border border-purple-500/20 bg-gradient-to-r from-purple-500/12 via-zinc-950/80 to-cyan-500/12 p-8 shadow-lg shadow-purple-500/10 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left_center,rgba(168,85,247,0.2),transparent_38%),radial-gradient(circle_at_right_center,rgba(34,211,238,0.16),transparent_36%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="text-2xl font-semibold text-zinc-100">Start exploring insider activity today</div>
            <p className="mt-2 text-sm leading-7 text-zinc-300">
              Browse the app, save your preferences, and let the platform bring stronger signals to the top.
              {user ? " Your workspace is ready." : " Open the app to sign in or create your account."}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to={appTarget} className="btn-primary h-11 px-6">
              Go to app
            </Link>
            <Link to="/pricing" className="btn-secondary h-11 px-6">
              Compare plans
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

import * as React from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";

function NavItem({
  to,
  label,
  subtitle,
  end,
}: {
  to: string;
  label: string;
  subtitle?: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "group block rounded-xl border px-3 py-3 transition",
          isActive
            ? "border-purple-500/30 bg-gradient-to-r from-purple-500/15 to-cyan-500/15 text-zinc-900 shadow-sm dark:text-white"
            : "border-transparent text-zinc-700 hover:border-zinc-200/80 hover:bg-white/60 dark:text-zinc-300 dark:hover:border-zinc-800/60 dark:hover:bg-black/25",
        ].join(" ")
      }
    >
      <div className="text-sm font-medium">{label}</div>
      {subtitle ? <div className="mt-0.5 text-xs muted">{subtitle}</div> : null}
    </NavLink>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] muted">{children}</div>;
}

export function AppShell() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isShowcase = user?.role === "showcase";
  const canViewAdmin = Boolean(user?.can_view_admin) || isAdmin || isShowcase;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="glass-panel h-fit p-4 lg:sticky lg:top-24">
        <div className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-black/25">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] muted">InsidrsAI</div>
          <div className="mt-2 text-xl font-semibold">Workspace</div>
          <div className="mt-1 text-sm muted">Signals, profiles, and account settings in one place.</div>
        </div>

        <nav className="mt-4 space-y-4">
          <div className="space-y-2">
            <SectionLabel>Main</SectionLabel>
            <div className="space-y-1">
              <NavItem to="/app/for-you" label="For you" subtitle="Saved signal feed" />
              <NavItem to="/app/tickers" label="Tickers" subtitle="Browse company activity" />
              <NavItem to="/app/events" label="Events" subtitle="Recent insider filings" />
              <NavItem to="/app/signals/best-performing" label="Best performing" subtitle="60-day leaderboard" />
              <NavItem to="/app/feedback" label="Feedback" subtitle="Tell us what to improve" />
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel>Settings</SectionLabel>
            <div className="space-y-1">
              <NavItem to="/app/profile" label="Profile" subtitle="Contact details and preferences" />
              <NavItem to="/app/account" label="Account" subtitle="Subscription and billing" />
            </div>
          </div>

          {canViewAdmin ? (
            <div className="space-y-2">
              <SectionLabel>Admin</SectionLabel>
              <div className="space-y-1">
                <NavItem to="/app/admin/users" label="Users" subtitle={isShowcase ? "View account access" : "View and remove access"} />
                <NavItem to="/app/admin/monitoring" label="Monitoring" subtitle="Platform health" />
                <NavItem to="/app/admin/jobs" label="Jobs" subtitle="Queue and backfills" />
                <NavItem to="/app/admin/feedback" label="Feedback inbox" subtitle="Customer feedback" />
                <NavItem to="/app/admin/support" label="Support" subtitle={isShowcase ? "Read-only inbox view" : "Conversations and replies"} />
                <NavItem to="/app/admin/settings" label="Site settings" subtitle={isShowcase ? "Read-only config view" : "Pricing and config"} />
                {isAdmin ? <NavItem to="/app/admin/social" label="Social posting" subtitle="Post research signals to X" /> : null}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="mt-5 rounded-2xl border border-zinc-200/70 bg-white/50 p-4 text-sm backdrop-blur-xl dark:border-zinc-800/60 dark:bg-black/25">
          <div className="font-medium text-zinc-900 dark:text-zinc-100">{user?.username}</div>
          <div className="mt-1 muted">Role: {user?.role}</div>
          {user?.role === "admin" ? (
            <span className="mt-3 inline-flex rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-700 dark:text-purple-300">
              Admin access
            </span>
          ) : user?.role === "showcase" ? (
            <span className="mt-3 inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-300">
              Showcase access
            </span>
          ) : (user as any)?.is_paid ? (
            <span className="mt-3 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Subscription active
            </span>
          ) : (
            <span className="mt-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              Subscription required
            </span>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

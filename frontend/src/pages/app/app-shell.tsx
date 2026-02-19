import * as React from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";

function NavItem({
  to,
  label,
  right,
}: {
  to: string;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex items-center justify-between rounded-md px-3 py-2 text-sm transition",
          isActive
            ? "border border-purple-500/20 bg-gradient-to-r from-purple-500/15 to-cyan-500/15 text-zinc-900 dark:text-white"
            : "text-zinc-700 hover:bg-white/50 dark:text-zinc-300 dark:hover:bg-white/5",
        ].join(" ")
      }
    >
      <span>{label}</span>
      {right}
    </NavLink>
  );
}

export function AppShell() {
  const { user } = useAuth();

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="glass-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Dashboard</div>
          <span className="badge">v1</span>
        </div>

        <nav className="space-y-1">
          <NavItem to="/app/tickers" label="Tickers" />
          <NavItem to="/app/events" label="Events" />
          <NavItem to="/app/account" label="Account" />

          {user?.role === "admin" && (
            <>
              <div className="my-3 h-px bg-zinc-200/70 dark:bg-zinc-800/60" />
              <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide muted">Admin</div>
              <NavItem to="/app/admin/monitoring" label="Monitoring" />
              <NavItem to="/app/admin/jobs" label="Jobs" />
            </>
          )}
        </nav>
      </aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

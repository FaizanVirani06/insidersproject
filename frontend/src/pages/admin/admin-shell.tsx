import * as React from "react";
import { NavLink, Outlet, Link } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";

function SideLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition " +
        (isActive
          ? "bg-white/70 text-zinc-900 dark:bg-zinc-900/60 dark:text-white"
          : "text-zinc-600 hover:bg-white/50 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900/40 dark:hover:text-white")
      }
    >
      {children}
    </NavLink>
  );
}

export function AdminShell() {
  const { user } = useAuth();

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="glass-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide muted">Admin</div>
            <div className="mt-1 text-lg font-semibold">Console</div>
          </div>
          <Link to="/app" className="link text-sm">
            Back to app
          </Link>
        </div>

        <div className="mt-4 space-y-1">
          <SideLink to="/admin/users">Users</SideLink>
          <SideLink to="/admin/monitoring">Monitoring</SideLink>
          <SideLink to="/admin/jobs">Jobs</SideLink>
          <SideLink to="/admin/feedback">Feedback</SideLink>
          <SideLink to="/admin/support">Support</SideLink>
          <SideLink to="/admin/settings">Settings</SideLink>
        </div>

        <div className="mt-6 rounded-lg border border-zinc-200/70 bg-white/40 p-3 text-xs dark:border-zinc-800/60 dark:bg-black/20">
          <div className="font-semibold">Signed in as</div>
          <div className="mt-1 truncate">{user?.username}</div>
          <div className="mt-1 muted">Role: {user?.role}</div>
        </div>
      </aside>

      <main className="min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

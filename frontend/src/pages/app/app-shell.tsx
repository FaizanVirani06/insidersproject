import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";

function tabClass(active: boolean) {
  return active
    ? "rounded-md bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
    : "rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5";
}

export function AppShell() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <NavLink to="/app/tickers" className={({ isActive }) => tabClass(isActive)}>
          Tickers
        </NavLink>
        <NavLink to="/app/events" className={({ isActive }) => tabClass(isActive)}>
          Events
        </NavLink>
        <NavLink to="/app/feedback" className={({ isActive }) => tabClass(isActive)}>
          Feedback
        </NavLink>
        <NavLink to="/app/account" className={({ isActive }) => tabClass(isActive)}>
          Account
        </NavLink>
        {user?.role === "admin" && (
          <NavLink to="/app/admin/jobs" className={({ isActive }) => tabClass(isActive)}>
            Admin
          </NavLink>
        )}
      </div>

      <Outlet />
    </div>
  );
}

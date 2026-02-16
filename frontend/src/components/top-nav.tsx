import * as React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";

function linkClass(active: boolean) {
  return active
    ? "text-sm font-medium text-black dark:text-white"
    : "text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white";
}

export function TopNav() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  const isApp = location.pathname.startsWith("/app");

  return (
    <header className="border-b bg-white/70 backdrop-blur dark:bg-black/30">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-semibold tracking-tight">
            Insider Platform
          </Link>

          <nav className="hidden items-center gap-3 md:flex">
            <NavLink to="/pricing" className={({ isActive }) => linkClass(isActive)}>
              Pricing
            </NavLink>
            <NavLink to="/privacy" className={({ isActive }) => linkClass(isActive)}>
              Privacy
            </NavLink>
            <NavLink to="/terms" className={({ isActive }) => linkClass(isActive)}>
              Terms
            </NavLink>

            {user && (
              <>
                <span className="text-black/20 dark:text-white/20">|</span>
                <NavLink to="/app" className={() => linkClass(isApp)}>
                  App
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {loading ? (
            <div className="text-sm text-black/60 dark:text-white/60">…</div>
          ) : user ? (
            <div className="flex items-center gap-2">
              <Link
                to="/app/account"
                className="hidden rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 md:inline-flex"
              >
                {user.username}
              </Link>
              <button
                onClick={() => void logout()}
                className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                Login
              </Link>
              <Link
                to="/signup"
                className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-white dark:text-black"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

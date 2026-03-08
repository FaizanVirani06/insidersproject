import * as React from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";

function NavLink({
  to,
  children,
  exact = true,
}: {
  to: string;
  children: React.ReactNode;
  exact?: boolean;
}) {
  const loc = useLocation();
  const active = exact ? loc.pathname === to : loc.pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={
        active
          ? "text-zinc-900 dark:text-white"
          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      }
    >
      {children}
    </Link>
  );
}

export function TopNav() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const isWide = loc.pathname.startsWith("/app") || loc.pathname.startsWith("/admin");

  const isPaid = Boolean(user && (user.role === "admin" || user.is_paid));

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-white/50 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/40">
      <div
        className={
          isWide
            ? "mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4"
            : "container mx-auto flex h-16 items-center justify-between px-4"
        }
      >
        <Link to="/" className="flex items-center gap-3">
          <div className="text-lg font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-purple-500 to-cyan-500 bg-clip-text text-transparent">
              InsidrsAI
            </span>
          </div>
          <span className="badge hidden sm:inline-flex">Beta</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/app" exact={false}>
            App
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {user ? (
            <>
              {user.role === "admin" ? (
                <Link to="/admin" className="btn-secondary hidden sm:inline-flex">
                  Admin
                </Link>
              ) : null}

              {isPaid ? (
                <Link to="/app/tickers" className="btn-secondary hidden sm:inline-flex">
                  Open app
                </Link>
              ) : (
                <Link to="/pricing" className="btn-primary hidden sm:inline-flex">
                  Subscribe
                </Link>
              )}

              <button type="button" onClick={() => logout()} className="btn-ghost">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Log in
              </Link>
              <Link to="/signup" className="btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

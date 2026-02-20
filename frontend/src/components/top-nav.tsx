import * as React from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/theme-toggle";

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const loc = useLocation();
  const active = loc.pathname === to;
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
  const isApp = loc.pathname.startsWith("/app");

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-white/50 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/40">
      <div
        className={
          isApp
            ? "mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4"
            : "container mx-auto flex h-16 items-center justify-between px-4"
        }
      >
        <Link to="/" className="flex items-center gap-3">
          <div className="text-lg font-bold tracking-tight">
            <span className="bg-gradient-to-r from-purple-500 to-cyan-500 bg-clip-text text-transparent">
              InsidrsAI
            </span>
          </div>
          <span className="badge hidden sm:inline-flex">Beta</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/legal">Legal</NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {user ? (
            <>
              <Link to="/app" className="btn-secondary hidden sm:inline-flex">
                Open app
              </Link>
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

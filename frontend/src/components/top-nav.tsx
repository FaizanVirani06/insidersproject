import * as React from "react";
import { Link, useLocation } from "react-router-dom";

import { useAuth } from "@/components/auth-provider";
import { SiteBrandMark } from "@/components/site-brand-mark";

function HeaderLink({ to, children }: { to: string; children: React.ReactNode }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to === "/app" && loc.pathname.startsWith("/app"));

  return (
    <Link
      to={to}
      className={
        active
          ? "text-white"
          : "text-zinc-400 transition-colors hover:text-white"
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
    <header className="sticky top-0 z-50 border-b border-zinc-800/50 bg-black/40 backdrop-blur-xl">
      <div
        className={
          isApp
            ? "mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4"
            : "container mx-auto flex h-16 items-center justify-between px-4"
        }
      >
        <Link to="/" className="flex items-center gap-3">
          <SiteBrandMark textClassName="text-lg font-bold tracking-tight" imageClassName="h-8" />
          <span className="badge hidden sm:inline-flex">Beta</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <HeaderLink to="/pricing">Pricing</HeaderLink>
          <HeaderLink to="/app">App</HeaderLink>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <button type="button" onClick={() => void logout()} className="btn-ghost">
              Logout
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

import * as React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { AnimatedBackground } from "@/components/animated-background";
import { DocumentMetaManager } from "@/components/document-meta-manager";
import { useAuth } from "@/components/auth-provider";
import { SiteBrandMark } from "@/components/site-brand-mark";
import { TopNav } from "@/components/top-nav";
import { SupportChatWidget } from "@/components/support-chat";

export function RootLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const isApp = location.pathname.startsWith("/app");
  const isShowcase = user?.role === "showcase";

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AnimatedBackground />
      <DocumentMetaManager />
      <TopNav />

      <main className={isApp ? "mx-auto w-full max-w-screen-2xl px-4 py-8" : "container mx-auto px-4 py-10"}>
        <Outlet />
      </main>

      {isShowcase ? (
        <div className="pointer-events-none fixed bottom-4 left-4 z-[60] max-w-sm rounded-2xl border border-cyan-500/30 bg-black/80 px-4 py-3 text-sm text-cyan-100 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl">
          <div className="font-semibold uppercase tracking-[0.18em] text-[11px] text-cyan-300">Spectator mode</div>
          <div className="mt-1 text-xs leading-relaxed text-cyan-50/90">
            You are signed in with the showcase account. Browsing is read-only and changes are disabled.
          </div>
        </div>
      ) : null}

      <SupportChatWidget />

      <footer className="border-t border-zinc-800/70 bg-black/30 backdrop-blur-xl">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <SiteBrandMark textClassName="text-base" imageClassName="h-7" />
            <span className="muted">© {new Date().getFullYear()}</span>
          </div>

          <div className="flex items-center gap-4">
            <Link to="/legal" className="link">
              Privacy &amp; Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

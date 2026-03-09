import * as React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { AnimatedBackground } from "@/components/animated-background";
import { SiteBrandMark } from "@/components/site-brand-mark";
import { TopNav } from "@/components/top-nav";
import { SupportChatWidget } from "@/components/support-chat";

export function RootLayout() {
  const location = useLocation();
  const isApp = location.pathname.startsWith("/app");

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AnimatedBackground />
      <TopNav />

      <main className={isApp ? "mx-auto w-full max-w-screen-2xl px-4 py-8" : "container mx-auto px-4 py-10"}>
        <Outlet />
      </main>

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

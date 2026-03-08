import * as React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { AnimatedBackground } from "@/components/animated-background";
import { TopNav } from "@/components/top-nav";
import { SupportChatWidget } from "@/components/support-chat";

export function RootLayout() {
  const location = useLocation();
  const isApp = location.pathname.startsWith("/app");

  return (
    <div className="relative min-h-screen text-foreground">
      <AnimatedBackground />
      <TopNav />

      <main className={isApp ? "mx-auto w-full max-w-screen-2xl px-4 py-8" : "container mx-auto px-4 py-10"}>
        <Outlet />
      </main>

      {/* Floating in-app support chat */}
      <SupportChatWidget />

      <footer className="border-t border-zinc-200/70 bg-white/40 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/30">
        <div className="container mx-auto flex flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="muted">© {new Date().getFullYear()} InsidrsAI</div>
          <div className="flex items-center gap-4">
            <Link to="/legal" className="link">
              Legal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

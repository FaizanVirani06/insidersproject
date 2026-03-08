import * as React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { AnimatedBackground } from "@/components/animated-background";
import { TopNav } from "@/components/top-nav";
import { SupportChatWidget } from "@/components/support-chat";

export function RootLayout() {
  const location = useLocation();
  const isWide = location.pathname.startsWith("/app") || location.pathname.startsWith("/admin");

  return (
    <div className="relative min-h-screen text-foreground">
      <AnimatedBackground />
      <TopNav />

      <main className={isWide ? "mx-auto w-full max-w-screen-2xl px-4 py-8" : "container mx-auto px-4 py-10"}>
        <Outlet />
      </main>

      {/* Floating in-app support chat */}
      <SupportChatWidget />

      <footer className="border-t border-zinc-200/70 bg-white/40 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center gap-4 text-sm text-zinc-500 dark:text-zinc-500">
            <p>© {new Date().getFullYear()} InsidrsAI</p>
            <span aria-hidden>•</span>
            <Link to="/legal" className="hover:text-purple-600 dark:hover:text-purple-300 transition-colors">
              Privacy &amp; Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

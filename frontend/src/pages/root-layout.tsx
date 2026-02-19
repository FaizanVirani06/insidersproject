import * as React from "react";
import { Link, Outlet } from "react-router-dom";

import { AnimatedBackground } from "@/components/animated-background";
import { TopNav } from "@/components/top-nav";

export function RootLayout() {
  return (
    <div className="relative min-h-screen text-foreground">
      <AnimatedBackground />
      <TopNav />

      <main className="container mx-auto px-4 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-zinc-200/70 bg-white/40 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/30">
        <div className="container mx-auto flex flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="muted">© {new Date().getFullYear()} Form Four Analysis</div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="link">
              Privacy
            </Link>
            <Link to="/terms" className="link">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

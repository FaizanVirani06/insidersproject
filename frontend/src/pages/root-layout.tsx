import * as React from "react";
import { Outlet } from "react-router-dom";

import { TopNav } from "@/components/top-nav";

export function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <Outlet />
        </div>
      </main>
      <footer className="border-t py-6 text-center text-xs text-black/50 dark:text-white/50">
        © {new Date().getFullYear()} Insider Platform
      </footer>
    </div>
  );
}

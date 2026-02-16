import * as React from "react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { resolvedTheme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
      title="Toggle theme"
    >
      {resolvedTheme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}

import * as React from "react";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light" : "Switch to dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="btn-icon"
    >
      <span className="text-base" aria-hidden>
        {isDark ? "☀️" : "🌙"}
      </span>
    </button>
  );
}

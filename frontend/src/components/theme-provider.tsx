import * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    try {
      const saved = window.localStorage.getItem("theme") as Theme | null;
      if (saved === "light" || saved === "dark" || saved === "system") return saved;
    } catch {
      // ignore
    }
    return "system";
  });

  const resolvedTheme = React.useMemo<"light" | "dark">(() => {
    return theme === "system" ? getSystemTheme() : theme;
  }, [theme]);

  React.useEffect(() => {
    // Persist preference
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      // ignore
    }

    applyTheme(resolvedTheme);

    if (theme !== "system") return;

    // If using system theme, listen for OS changes
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;

    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [theme, resolvedTheme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const toggle = React.useCallback(() => {
    const rt = theme === "system" ? getSystemTheme() : theme;
    setThemeState(rt === "dark" ? "light" : "dark");
  }, [theme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggle }),
    [theme, resolvedTheme, setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

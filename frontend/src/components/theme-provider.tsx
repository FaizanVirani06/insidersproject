import * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function applyDarkTheme() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("dark");
  root.style.colorScheme = "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    applyDarkTheme();
    try {
      window.localStorage.setItem("theme", "dark");
    } catch {
      // ignore
    }
  }, []);

  const setTheme = React.useCallback((_t: Theme) => {
    applyDarkTheme();
  }, []);

  const toggle = React.useCallback(() => {
    applyDarkTheme();
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme: "dark", resolvedTheme: "dark", setTheme, toggle }),
    [setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

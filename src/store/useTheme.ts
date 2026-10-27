import { useEffect } from "react";
import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const KEY = "brc-theme";

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem(KEY) as Theme) ?? "system",
  setTheme: (theme) => {
    localStorage.setItem(KEY, theme);
    set({ theme });
  },
}));

export function useApplyTheme() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => root.classList.toggle("dark", dark);
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    apply(theme === "dark");
  }, [theme]);
}

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode;
}

export function applyTheme(resolved: ResolvedTheme, x?: number, y?: number): void {
  const root = document.documentElement;

  if (x !== undefined && y !== undefined) {
    root.style.setProperty("--theme-switch-x", `${x}px`);
    root.style.setProperty("--theme-switch-y", `${y}px`);
  }

  const supportsViewTransition =
    typeof document !== "undefined" && "startViewTransition" in document;

  const apply = () => {
    root.setAttribute("data-theme", resolved);
  };

  if (supportsViewTransition && x !== undefined) {
    root.classList.add("theme-transition");
    (document as any).startViewTransition(() => {
      apply();
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          root.classList.remove("theme-transition");
          resolve();
        });
      });
    });
  } else {
    apply();
  }
}

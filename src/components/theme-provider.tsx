"use client";

import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

/* The single source of truth is the `dark` class on <html>: the inline
   pre-paint script in layout.tsx sets it before first paint, and every
   consumer subscribes to it. Changing the class notifies subscribers. */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("md-theme", next);
    } catch {}
    for (const listener of listeners) listener();
  }, []);

  return { theme, toggle };
}

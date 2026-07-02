import type { ColorScheme, RuntimeTheme } from "@comet-speedtest/config";
import { useEffect, useState } from "react";

import { applyTheme } from "../theme/applyTheme";

/**
 * Apply a runtime theme to the document root (`<html>`) and keep it in sync with
 * the OS theme.
 *
 * Applying to `document.documentElement` (rather than a scoped element) means
 * portaled UI — e.g. the Base UI Select popup, which renders on `document.body`
 * outside any app container — also inherits the tokens and `.dark` class. Tokens
 * and the class are written by {@link applyTheme}; when colorScheme is "system"
 * it re-applies on `prefers-color-scheme` changes so the UI follows the OS live.
 */
export function useApplyTheme(theme: RuntimeTheme | undefined): void {
  useEffect(() => {
    if (typeof document === "undefined" || !theme) {
      return;
    }
    applyTheme(theme, document.documentElement);
    if ((theme.colorScheme ?? "system") !== "system" || typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const reapply = (): void => applyTheme(theme, document.documentElement);
    media.addEventListener("change", reapply);
    return () => media.removeEventListener("change", reapply);
  }, [theme]);
}

const DEFAULT_STORAGE_KEY = "comet:color-scheme";

/**
 * A persisted color-scheme override. Defaults to `fallback` (typically the
 * config's colorScheme) until the user picks one, then remembers the choice in
 * localStorage. "system" means follow the OS.
 */
export function useColorScheme(
  fallback: ColorScheme,
  storageKey: string = DEFAULT_STORAGE_KEY,
): readonly [ColorScheme, (scheme: ColorScheme) => void] {
  const [override, setOverride] = useState<ColorScheme | null>(() =>
    readScheme(storageKey),
  );
  const scheme = override ?? fallback;
  const setScheme = (next: ColorScheme): void => {
    setOverride(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // storage unavailable — keep the in-memory choice only
    }
  };
  return [scheme, setScheme] as const;
}

function readScheme(key: string): ColorScheme | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    return null;
  }
}

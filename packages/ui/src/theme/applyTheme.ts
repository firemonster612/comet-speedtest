import type { RuntimeTheme, RuntimeThemePalette } from "@comet-speedtest/config";

import { defaultThemeTokens } from "./tokens";

/**
 * Apply a runtime theme by writing the shadcn semantic tokens (--primary,
 * --background, --foreground, ...) onto `root` and toggling the `.dark` class.
 * This is how per-customer branding from the runtime config drives the shadcn
 * component token surface defined in styles.css.
 */
export function applyTheme(theme: RuntimeTheme | undefined, root: HTMLElement): void {
  const requestedScheme = theme?.colorScheme ?? defaultThemeTokens.colorScheme;
  const effectiveScheme =
    requestedScheme === "system"
      ? prefersDark(root.ownerDocument.defaultView)
        ? "dark"
        : "light"
      : requestedScheme;
  const tokens = resolveThemeTokens(theme, effectiveScheme, requestedScheme);

  const onSurface = effectiveScheme === "dark" ? "#0b1014" : "#ffffff";
  root.style.setProperty("--primary", tokens.palette.primaryColor);
  root.style.setProperty("--primary-foreground", onSurface);
  root.style.setProperty("--ring", tokens.palette.primaryColor);
  root.style.setProperty("--accent", tokens.palette.accentColor);
  root.style.setProperty("--accent-foreground", onSurface);
  root.style.setProperty("--background", tokens.palette.backgroundColor);
  root.style.setProperty("--card", tokens.palette.surfaceColor);
  root.style.setProperty("--card-foreground", tokens.palette.textColor);
  root.style.setProperty("--popover", tokens.palette.surfaceColor);
  root.style.setProperty("--popover-foreground", tokens.palette.textColor);
  root.style.setProperty("--secondary", tokens.palette.backgroundColor);
  root.style.setProperty("--secondary-foreground", tokens.palette.textColor);
  root.style.setProperty("--muted", tokens.palette.backgroundColor);
  root.style.setProperty("--muted-foreground", tokens.palette.mutedTextColor);
  root.style.setProperty("--foreground", tokens.palette.textColor);
  root.style.setProperty("--border", tokens.palette.borderColor);
  root.style.setProperty("--input", tokens.palette.borderColor);
  root.style.setProperty("--font", tokens.fontFamily);
  root.style.setProperty("--radius", tokens.radius);

  root.style.colorScheme =
    tokens.colorScheme === "system" ? "light dark" : tokens.colorScheme;
  root.dataset.colorScheme = tokens.colorScheme;
  root.dataset.effectiveColorScheme = effectiveScheme;
  root.classList.toggle("dark", effectiveScheme === "dark");
}

/**
 * Resolve the explicit light/dark palettes from runtime config. Legacy flat
 * color fields are still accepted as a light-mode shorthand; only their brand
 * colors carry into dark mode, preserving the previous compatibility behavior.
 */
function resolveThemeTokens(
  theme: RuntimeTheme | undefined,
  effectiveScheme: "light" | "dark",
  requestedScheme: RuntimeTheme["colorScheme"],
): {
  colorScheme: "light" | "dark" | "system";
  palette: Required<RuntimeThemePalette>;
  fontFamily: string;
  radius: string;
} {
  const legacyPalette = pickThemePalette(theme);
  const legacyDarkBrand: Partial<RuntimeThemePalette> = {};
  if (legacyPalette.primaryColor) {
    legacyDarkBrand.primaryColor = legacyPalette.primaryColor;
  }
  if (legacyPalette.accentColor) {
    legacyDarkBrand.accentColor = legacyPalette.accentColor;
  }
  const light = {
    ...defaultThemeTokens.light,
    ...legacyPalette,
    ...theme?.light,
  };
  const dark = {
    ...defaultThemeTokens.dark,
    ...legacyDarkBrand,
    ...theme?.dark,
  };

  return {
    colorScheme: requestedScheme ?? defaultThemeTokens.colorScheme,
    palette: effectiveScheme === "dark" ? dark : light,
    fontFamily: theme?.fontFamily ?? defaultThemeTokens.fontFamily,
    radius: theme?.radius ?? defaultThemeTokens.radius,
  };
}

function pickThemePalette(
  theme: RuntimeTheme | undefined,
): Partial<RuntimeThemePalette> {
  if (!theme) {
    return {};
  }
  return {
    ...(theme.primaryColor ? { primaryColor: theme.primaryColor } : {}),
    ...(theme.accentColor ? { accentColor: theme.accentColor } : {}),
    ...(theme.backgroundColor ? { backgroundColor: theme.backgroundColor } : {}),
    ...(theme.surfaceColor ? { surfaceColor: theme.surfaceColor } : {}),
    ...(theme.textColor ? { textColor: theme.textColor } : {}),
    ...(theme.mutedTextColor ? { mutedTextColor: theme.mutedTextColor } : {}),
    ...(theme.borderColor ? { borderColor: theme.borderColor } : {}),
  };
}

function prefersDark(view: Window | null): boolean {
  return (
    typeof view?.matchMedia === "function" &&
    view.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

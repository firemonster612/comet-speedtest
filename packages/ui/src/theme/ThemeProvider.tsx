import type { RuntimeTheme } from "@comet-speedtest/config";
import type { ReactNode } from "react";

import { useApplyTheme } from "../hooks/useTheme";

/**
 * Applies a runtime theme to the document root (`<html>`) for everything
 * rendered beneath it. This is the recommended way to theme a Comet app.
 *
 * Theming writes the shadcn semantic tokens *and* the `.dark` class onto
 * `<html>` (there is no media-query dark mode — `.dark` only exists once a theme
 * is applied), so it is inherently document-level: it must be owned at the root
 * so the *whole* page stays themed — the background, a header, a loading or
 * error screen shown while the widget is unmounted, and portaled popups that
 * render on `document.body`. Drive the theme from wherever the app keeps it (a
 * persisted {@link useColorScheme} toggle, a live config draft, …) and pass the
 * resolved theme here; updates re-apply.
 *
 * Prefer this over `<SpeedTestWidget theme>`. The widget's `theme` prop writes
 * the same tokens to the same `<html>`, so it is only for a standalone embed
 * where the widget is the only themed thing on the page — and it must not be
 * combined with this provider, or the theme is applied twice.
 */
export function CometThemeProvider({
  theme,
  children,
}: {
  theme?: RuntimeTheme | undefined;
  children: ReactNode;
}) {
  useApplyTheme(theme);
  return <>{children}</>;
}

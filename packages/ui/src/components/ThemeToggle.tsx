import type { ColorScheme } from "@lightspeed/config";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "./ui/button";

const ORDER: ColorScheme[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** Cycles system → light → dark. Controlled: the caller owns the value. */
export function ThemeToggle({
  value,
  onChange,
}: {
  value: ColorScheme;
  onChange: (scheme: ColorScheme) => void;
}) {
  const next = ORDER[(ORDER.indexOf(value) + 1) % ORDER.length] ?? "system";
  const Icon = ICON[value];
  return (
    <Button
      aria-label={`Theme: ${value}. Switch to ${next} mode.`}
      onClick={() => onChange(next)}
      size="icon"
      title={`Theme: ${value}`}
      variant="outline"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

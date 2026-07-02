import { cn } from "../lib/utils";

/** Which measurement a centerpiece is showing: download, upload, or at rest. */
export type Tone = "download" | "upload" | "idle";

const DOT_COLOR: Record<Tone, string> = {
  download: "var(--primary)",
  upload: "var(--accent)",
  idle: "var(--muted-foreground)",
};

/** Solid display color for a tone's headline number / meter fill. */
export function toneColor(tone: Tone): string {
  if (tone === "upload") {
    return "var(--accent)";
  }
  if (tone === "download") {
    return "var(--primary)";
  }
  return "var(--foreground)";
}

/** Small phase eyebrow with a tone dot that pulses while measuring. */
export function PhaseLabel({
  label,
  tone,
  active,
}: {
  label: string;
  tone: Tone;
  active: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      <span
        className={cn("size-2 rounded-full", active && "motion-safe:animate-pulse")}
        style={{ backgroundColor: DOT_COLOR[tone], opacity: tone === "idle" ? 0.4 : 1 }}
      />
      {label}
    </span>
  );
}

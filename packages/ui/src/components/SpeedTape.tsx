import type { SpeedSample } from "@lightspeed/core";

import { useCountUp } from "../hooks/useCountUp";
import { speedParts } from "../lib/format";
import { PhaseLabel, toneColor, type Tone } from "./PhaseLabel";
import { SampleChart } from "./SampleChart";

/**
 * "Signal Tape" centerpiece. Reads like a network instrument: the current value
 * fills a horizontal meter against the auto-scaled ceiling, with the live
 * throughput running as a tape beneath it. The meter is driven by the same
 * count-up as the number (scaleX transform, never an animated width), so it
 * settles smoothly and snaps under reduced motion.
 */
export function SpeedTape({
  label,
  bitsPerSecond,
  tone,
  active,
  samples,
  scaleMaxMbps,
  secondaryBitsPerSecond,
  secondaryLabel,
}: {
  label: string;
  bitsPerSecond: number | null;
  tone: Tone;
  active: boolean;
  samples: SpeedSample[];
  scaleMaxMbps: number;
  secondaryBitsPerSecond?: number | null | undefined;
  secondaryLabel?: string | undefined;
}) {
  const displayed = useCountUp(bitsPerSecond);
  const secondaryDisplayed = useCountUp(secondaryBitsPerSecond ?? null);
  const primaryParts = speedParts(displayed);
  const secondaryParts = speedParts(secondaryDisplayed);
  const mbps = displayed === null ? null : displayed / 1_000_000;
  const fraction = mbps === null ? 0 : Math.min(1, Math.max(0, mbps / scaleMaxMbps));
  const meterColor = toneColor(tone);
  const showSummary = secondaryLabel !== undefined;

  return (
    <div className="grid gap-3">
      <div
        className={
          showSummary
            ? "grid gap-2 @md/widget:grid-cols-[minmax(0,1fr)_auto] @md/widget:items-end"
            : "flex items-end justify-between gap-3"
        }
      >
        {showSummary ? (
          <SummaryLabel primaryLabel={label} secondaryLabel={secondaryLabel} />
        ) : (
          <PhaseLabel active={active} label={label} tone={tone} />
        )}
        {showSummary ? (
          <div className="flex min-w-0 max-w-full flex-wrap items-baseline justify-end gap-x-2 gap-y-1 text-right">
            <SummarySpeed parts={primaryParts} tone="download" />
            <span className="text-xl font-semibold text-muted-foreground/70">|</span>
            <SummarySpeed parts={secondaryParts} tone="upload" />
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <strong
              className="text-4xl leading-none font-semibold tracking-[-0.01em] tabular-nums @md/widget:text-5xl"
              style={{
                color: displayed === null ? "var(--muted-foreground)" : toneColor(tone),
              }}
            >
              {primaryParts?.value ?? "--"}
            </strong>
            <span className="text-sm font-medium text-muted-foreground">
              {primaryParts?.unit ?? "Mbps"}
            </span>
          </div>
        )}
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {showSummary ? (
          <div
            aria-hidden="true"
            className="grid h-full w-full grid-cols-2 rounded-full"
          >
            <span className="bg-primary" />
            <span className="bg-accent" />
          </div>
        ) : (
          <div
            className="h-full w-full origin-left rounded-full"
            style={{
              transform: `scaleX(${fraction})`,
              // Tone-coloured (download = primary, upload = accent) so the meter
              // obeys the two-trace rule; a subtle same-hue sheen left to right.
              background:
                tone === "idle"
                  ? "var(--border)"
                  : `linear-gradient(90deg, color-mix(in oklab, ${meterColor} 55%, var(--background)), ${meterColor})`,
            }}
          />
        )}
      </div>

      <SampleChart
        className="h-28 w-full sm:h-32"
        samples={samples}
        scaleMaxMbps={scaleMaxMbps}
      />
    </div>
  );
}

function SummaryLabel({
  primaryLabel,
  secondaryLabel,
}: {
  primaryLabel: string;
  secondaryLabel: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      <span className="size-2 shrink-0 rounded-full bg-primary" />
      <span className="truncate">{primaryLabel}</span>
      <span className="text-muted-foreground/70">|</span>
      <span className="size-2 shrink-0 rounded-full bg-accent" />
      <span className="truncate">{secondaryLabel}</span>
    </span>
  );
}

function SummarySpeed({
  parts,
  tone,
}: {
  parts: ReturnType<typeof speedParts>;
  tone: Extract<Tone, "download" | "upload">;
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1"
      style={{
        color: parts === null ? "var(--muted-foreground)" : toneColor(tone),
      }}
    >
      <strong className="text-3xl leading-none font-semibold tracking-[-0.01em] tabular-nums @md/widget:text-4xl @2xl/widget:text-5xl">
        {parts?.value ?? "--"}
      </strong>
      <span className="text-sm font-medium text-muted-foreground">
        {parts?.unit ?? "Mbps"}
      </span>
    </span>
  );
}

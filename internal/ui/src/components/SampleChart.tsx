import type { SpeedSample } from "@comet-speedtest/core";
import { type PointerEvent, useId, useState } from "react";

import { selectChartSamples } from "../lib/chartSamples";
import { niceCeil, speed } from "../lib/format";
import { cn } from "../lib/utils";

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_Y = 10;
const MAX_CHART_POINTS = 180;

const TONE: Record<SpeedSample["phase"], string> = {
  download: "var(--primary)",
  upload: "var(--accent)",
};

/**
 * Speed-over-time graph. Plots the whole throughput run, downsampled only for
 * very large configs, as a smooth line split and recoloured at each
 * download→upload boundary. Scales with the shared dial ceiling so the trace
 * never clips.
 */
export function SampleChart({
  samples,
  scaleMaxMbps,
  className,
}: {
  samples: SpeedSample[];
  scaleMaxMbps?: number;
  className?: string;
}) {
  const fillId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const data = selectChartSamples(samples, MAX_CHART_POINTS);
  const peak = Math.max(1, ...data.map((s) => s.bitsPerSecond / 1_000_000));
  const max = scaleMaxMbps && scaleMaxMbps > 0 ? scaleMaxMbps : niceCeil(peak);
  const stepX = data.length > 1 ? VIEW_W / (data.length - 1) : 0;

  const points = data.map((sample, index) => ({
    x: data.length > 1 ? index * stepX : VIEW_W / 2,
    y:
      VIEW_H -
      PAD_Y -
      Math.min(1, sample.bitsPerSecond / 1_000_000 / max) * (VIEW_H - PAD_Y * 2),
    phase: sample.phase,
  }));

  // Break the path wherever the phase flips so each leg keeps its own colour.
  const segments: Array<{ phase: SpeedSample["phase"]; pts: typeof points }> = [];
  for (const point of points) {
    const last = segments.at(-1);
    if (last && last.phase === point.phase) {
      last.pts.push(point);
    } else {
      // Bridge to the new segment so the line stays visually continuous.
      const bridge = last ? [last.pts.at(-1) as (typeof points)[number]] : [];
      segments.push({ phase: point.phase, pts: [...bridge, point] });
    }
  }

  const gridYs = [0.25, 0.5, 0.75].map(
    (ratio) => VIEW_H - PAD_Y - ratio * (VIEW_H - PAD_Y * 2),
  );
  const baseline = VIEW_H - PAD_Y;
  const head = points.at(-1);
  const hasData = data.length > 0;
  const hovered =
    hoverIndex !== null && points[hoverIndex] && data[hoverIndex]
      ? { point: points[hoverIndex], sample: data[hoverIndex] }
      : null;

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (!hasData) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const index = stepX > 0 ? Math.round(Math.min(VIEW_W, Math.max(0, x)) / stepX) : 0;
    setHoverIndex(Math.min(data.length - 1, Math.max(0, index)));
  }

  function handlePointerLeave(): void {
    setHoverIndex(null);
  }

  return (
    <div
      aria-label="Speed over time"
      className={cn(
        "relative h-32 w-full overflow-hidden rounded-lg bg-muted/30",
        className,
      )}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      role="img"
    >
      <svg
        className="size-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      >
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridYs.map((y) => (
          <line
            className="text-border"
            key={y}
            stroke="currentColor"
            strokeDasharray="2 6"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2={VIEW_W}
            y1={y}
            y2={y}
          />
        ))}

        {hasData ? (
          <>
            <path
              d={`M ${points[0]?.x ?? 0} ${baseline} ${points
                .map((p) => `L ${p.x} ${p.y}`)
                .join(" ")} L ${head?.x ?? 0} ${baseline} Z`}
              fill={`url(#${fillId})`}
            />
            {segments.map((segment, index) => (
              <path
                d={`M ${segment.pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`}
                fill="none"
                key={index}
                stroke={TONE[segment.phase]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {head ? (
              <circle
                cx={head.x}
                cy={head.y}
                fill={TONE[head.phase]}
                r="3.5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {hovered ? (
              <>
                <line
                  stroke="var(--foreground)"
                  strokeOpacity="0.28"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  x1={hovered.point.x}
                  x2={hovered.point.x}
                  y1={PAD_Y}
                  y2={baseline}
                />
                <circle
                  cx={hovered.point.x}
                  cy={hovered.point.y}
                  fill="var(--popover)"
                  r="5"
                  stroke={TONE[hovered.sample.phase]}
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </>
        ) : null}
      </svg>

      {hovered ? (
        <ChartTooltip
          firstSample={data[0] as SpeedSample}
          point={hovered.point}
          sample={hovered.sample}
        />
      ) : null}

      {!hasData ? (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Throughput graph appears as the test runs.
        </span>
      ) : null}
    </div>
  );
}

function ChartTooltip({
  firstSample,
  point,
  sample,
}: {
  firstSample: SpeedSample;
  point: { x: number; y: number; phase: SpeedSample["phase"] };
  sample: SpeedSample;
}) {
  const leftPercent = (point.x / VIEW_W) * 100;
  const topPercent = (point.y / VIEW_H) * 100;
  const elapsedMs = Math.max(0, sample.endedAtMs - firstSample.startedAtMs);
  const align =
    leftPercent < 18
      ? "translate-x-0"
      : leftPercent > 82
        ? "-translate-x-full"
        : "-translate-x-1/2";
  const vertical =
    topPercent < 28 ? "translate-y-2" : "-translate-y-[calc(100%+0.5rem)]";

  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 min-w-28 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
        align,
        vertical,
      )}
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
      }}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: TONE[sample.phase] }}
        />
        <span className="capitalize">{sample.phase}</span>
        <span className="text-muted-foreground">{formatElapsed(elapsedMs)}</span>
      </div>
      <div className="mt-0.5 font-semibold tabular-nums">
        {speed(sample.bitsPerSecond)}
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0)}s`;
}

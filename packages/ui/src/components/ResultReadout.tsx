import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  Gauge,
  Upload,
  Waves,
} from "lucide-react";
import type { ComponentType } from "react";

import { latency, speedParts } from "../lib/format";
import { cn } from "../lib/utils";
import { MetricInfo, metricInfo, type MetricInfoKey } from "./MetricInfo";
import type { MetricLabels, MetricValues } from "./MetricTiles";
import { toneColor } from "./PhaseLabel";
import { TooltipProvider } from "./ui/tooltip";

/** One direction's added-latency-under-load grade, as shown beside its reading. */
export interface DirectionBufferbloat {
  grade: string;
  addedLatencyMs: number;
}

/**
 * The final readout. Download and upload are the two heroes, side by side, in
 * their tones (teal / terracotta) — the number is the product. Latency, the two
 * loaded-latency readings (each with its own bufferbloat grade), and jitter sit
 * beneath as one quiet, compact stats line — supporting evidence, never
 * competing for the eye. No live graph here: that belongs to the run.
 */
export function ResultReadout({
  values,
  labels,
  downloadBufferbloat = null,
  uploadBufferbloat = null,
  idleJitterMs = null,
  loadedJitterMs = null,
}: {
  values: MetricValues;
  labels: MetricLabels;
  downloadBufferbloat?: DirectionBufferbloat | null;
  uploadBufferbloat?: DirectionBufferbloat | null;
  idleJitterMs?: number | null;
  loadedJitterMs?: number | null;
}) {
  // Surface the loaded jitter — that's what limits quality — labelled "load" so
  // it's never confused with the (usually fine) idle jitter; idle stays in the
  // tooltip. Falls back to idle when there's no loaded reading.
  const loadedJitter = loadedJitterMs != null;
  const jitterValue = loadedJitter ? loadedJitterMs : idleJitterMs;
  const jitterTitle = [
    idleJitterMs != null ? `${latency(idleJitterMs)} idle` : null,
    loadedJitterMs != null ? `${latency(loadedJitterMs)} under load` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TooltipProvider>
      <div className="ls-results grid gap-4 @md/widget:gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Hero
            infoKey="download"
            icon={Download}
            label={labels.download}
            tone="download"
            value={values.downloadBps}
          />
          <Hero
            infoKey="upload"
            icon={Upload}
            label={labels.upload}
            tone="upload"
            value={values.uploadBps}
          />
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 rounded-xl border bg-muted/30 p-4 text-sm @md/widget:grid-cols-2">
          {/* Top row: idle latency + jitter. Bottom row: the two loaded latencies,
            paired with download on the left. */}
          <StatRow
            infoKey="idleLatency"
            icon={Gauge}
            label={labels.idleLatency}
            value={latency(values.idleLatencyMs)}
          />
          {jitterValue != null ? (
            <StatRow
              infoKey="jitter"
              icon={Activity}
              label="Jitter"
              qualifier={loadedJitter ? "load" : "idle"}
              detail={jitterTitle ? `Reading: ${jitterTitle}` : undefined}
              value={latency(jitterValue)}
            />
          ) : null}
          <StatRow
            grade={downloadBufferbloat?.grade ?? null}
            gradeDetail={bloatDetail(downloadBufferbloat)}
            infoKey="downloadLatency"
            icon={ArrowDownToLine}
            label={labels.downloadLatency}
            value={latency(values.downloadLatencyMs)}
          />
          <StatRow
            grade={uploadBufferbloat?.grade ?? null}
            gradeDetail={bloatDetail(uploadBufferbloat)}
            infoKey="uploadLatency"
            icon={ArrowUpFromLine}
            label={labels.uploadLatency}
            value={latency(values.uploadLatencyMs)}
          />
        </dl>
      </div>
    </TooltipProvider>
  );
}

function Hero({
  icon: Icon,
  label,
  value,
  tone,
  infoKey,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  tone: "download" | "upload";
  infoKey: MetricInfoKey;
}) {
  const parts = speedParts(value);
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <MetricInfo label={label}>{metricInfo[infoKey]}</MetricInfo>
      </span>
      <span className="flex items-baseline gap-1.5">
        <strong
          className="text-4xl leading-none font-semibold tracking-[-0.01em] tabular-nums @md/widget:text-5xl @2xl/widget:text-6xl"
          style={{
            color: parts === null ? "var(--muted-foreground)" : toneColor(tone),
          }}
        >
          {parts?.value ?? "--"}
        </strong>
        <span className="text-sm font-medium text-muted-foreground">
          {parts?.unit ?? "Mbps"}
        </span>
      </span>
    </div>
  );
}

/** One latency row: icon + label on the left, tabular value (+ qualifier / grade) on the right. */
function StatRow({
  icon: Icon,
  label,
  value,
  qualifier,
  grade = null,
  gradeDetail,
  detail,
  infoKey,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  qualifier?: string;
  grade?: string | null;
  gradeDetail?: string | undefined;
  detail?: string | undefined;
  infoKey: MetricInfoKey;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <MetricInfo label={label}>
          <span className="grid gap-1">
            <span>{metricInfo[infoKey]}</span>
            {detail ? <span>{detail}</span> : null}
          </span>
        </MetricInfo>
      </dt>
      <dd className="flex shrink-0 items-center gap-1.5">
        <span className="font-semibold tabular-nums">{value}</span>
        {qualifier ? (
          <span className="text-xs text-muted-foreground">{qualifier}</span>
        ) : null}
        {grade ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[0.65rem] font-semibold",
              gradeTone(grade),
            )}
          >
            <Waves aria-hidden="true" className="size-2.5 shrink-0" />
            {grade}
            <MetricInfo label="Bufferbloat grade" side="bottom">
              <span className="grid gap-1">
                <span>{metricInfo.bufferbloat}</span>
                {gradeDetail ? <span>{gradeDetail}</span> : null}
              </span>
            </MetricInfo>
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function bloatDetail(bloat: DirectionBufferbloat | null): string | undefined {
  return bloat
    ? `This run scored ${bloat.grade} with +${Math.round(
        bloat.addedLatencyMs,
      )} ms added latency under load.`
    : undefined;
}

/** Bufferbloat grade chip: good grades read teal, middling warm, failing red. */
function gradeTone(grade: string): string {
  const letter = grade.trim().charAt(0).toUpperCase();
  if (letter === "A" || letter === "B") {
    return "border-primary/40 bg-primary/10 text-foreground";
  }
  if (letter === "C" || letter === "D") {
    return "border-accent/40 bg-accent/10 text-foreground";
  }
  return "border-destructive/40 bg-destructive/10 text-destructive";
}

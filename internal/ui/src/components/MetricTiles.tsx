import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  Gauge,
  Upload,
} from "lucide-react";
import type { ComponentType } from "react";

import { latency, speed } from "../lib/format";
import { cn } from "../lib/utils";

export interface MetricLabels {
  download: string;
  upload: string;
  idleLatency: string;
  downloadLatency: string;
  uploadLatency: string;
}

export interface MetricValues {
  downloadBps: number | null;
  uploadBps: number | null;
  idleLatencyMs: number | null;
  downloadLatencyMs: number | null;
  uploadLatencyMs: number | null;
}

export type ActivePhase = "download" | "upload" | "idle-latency" | null;

/**
 * The headline numbers, shared by the live run and the final summary. Throughput
 * sits on top; the three latency readings (idle, under download load, under
 * upload load) sit below — the engine measures loaded latency separately for
 * each direction, so they are shown separately too. Throughput values carry
 * "Mbps"; latency values carry "ms". The actively measuring tiles are lit.
 */
export function MetricTiles({
  labels,
  values,
  activePhase = null,
}: {
  labels: MetricLabels;
  values: MetricValues;
  activePhase?: ActivePhase;
}) {
  return (
    <div className="ls-results grid gap-2.5 sm:gap-3">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <Tile
          active={activePhase === "download"}
          icon={Download}
          kind="speed"
          label={labels.download}
          value={values.downloadBps}
        />
        <Tile
          active={activePhase === "upload"}
          icon={Upload}
          kind="speed"
          label={labels.upload}
          value={values.uploadBps}
        />
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <Tile
          active={activePhase === "idle-latency"}
          icon={Gauge}
          kind="latency"
          label={labels.idleLatency}
          value={values.idleLatencyMs}
        />
        <Tile
          active={activePhase === "download"}
          icon={ArrowDownToLine}
          kind="latency"
          label={labels.downloadLatency}
          value={values.downloadLatencyMs}
        />
        <Tile
          active={activePhase === "upload"}
          icon={ArrowUpFromLine}
          kind="latency"
          label={labels.uploadLatency}
          value={values.uploadLatencyMs}
        />
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  kind,
  active,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  kind: "speed" | "latency";
  active: boolean;
}) {
  const text = kind === "speed" ? speed(value) : latency(value);
  const pending = value === null;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg bg-muted/50 p-3 transition-colors sm:p-4",
        active && "bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0 sm:size-4" />
        <span className="truncate" title={label}>
          {label}
        </span>
      </span>
      <strong
        className={cn(
          "text-base font-semibold tabular-nums sm:text-2xl",
          pending && "text-muted-foreground",
        )}
      >
        {text}
      </strong>
    </div>
  );
}

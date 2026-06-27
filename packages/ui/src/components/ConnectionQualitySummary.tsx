import type {
  ConnectionQualityResult,
  QualityGrade,
  QualityLimitingFactor,
  QualityScore,
} from "@lightspeed/core";
import { ChevronDown, Gamepad2, Globe2, MonitorPlay, PhoneCall } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";

/**
 * The connection-quality verdict, kept calm. The one-line summary and overall
 * grade are always visible — that is the reassuring takeaway. The per-use-case
 * breakdown and the bufferbloat / jitter detail are tucked into a disclosure so
 * the result stays uncluttered until someone wants the evidence.
 */
export function ConnectionQualitySummary({
  quality,
  idleJitterMs = null,
  loadedJitterMs = null,
}: {
  quality: ConnectionQualityResult;
  idleJitterMs?: number | null;
  loadedJitterMs?: number | null;
}) {
  const hasScores =
    quality.overall.score !== null ||
    quality.webBrowsing.score !== null ||
    quality.gaming.score !== null ||
    quality.streaming.score !== null ||
    quality.videoCalling.score !== null;
  if (!hasScores) {
    return null;
  }

  // The quality score weighs the worst jitter across idle and under-load, so when
  // the loaded reading is the higher one, name it — "limited by jitter" alone is
  // confusing when the idle jitter is fine and the spike is only under load.
  const jitterLabel =
    loadedJitterMs != null && (idleJitterMs == null || loadedJitterMs >= idleJitterMs)
      ? "jitter under load"
      : "jitter";

  return (
    <section
      aria-label="Connection quality"
      className="grid gap-3 border-t pt-4 text-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h2 className="text-sm leading-tight font-semibold">Connection quality</h2>
          <p className="mt-1 max-w-[62ch] text-muted-foreground">
            {quality.overall.explanation}
          </p>
        </div>
        <QualityScoreBadge label="Overall" score={quality.overall} />
      </div>

      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card [&::-webkit-details-marker]:hidden">
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 transition-transform group-open:rotate-180"
          />
          <span className="group-open:hidden">Show breakdown</span>
          <span className="hidden group-open:inline">Hide breakdown</span>
        </summary>

        <div className="mt-3 grid grid-cols-1 gap-2.5 @md/widget:grid-cols-2 @xl/widget:grid-cols-4">
          <QualityUse
            icon={Globe2}
            jitterLabel={jitterLabel}
            label="Web browsing"
            score={quality.webBrowsing}
          />
          <QualityUse
            icon={Gamepad2}
            jitterLabel={jitterLabel}
            label="Gaming"
            score={quality.gaming}
          />
          <QualityUse
            icon={MonitorPlay}
            jitterLabel={jitterLabel}
            label="Streaming"
            score={quality.streaming}
          />
          <QualityUse
            icon={PhoneCall}
            jitterLabel={jitterLabel}
            label="Video calls"
            score={quality.videoCalling}
          />
        </div>
      </details>
    </section>
  );
}

function QualityUse({
  icon: Icon,
  label,
  score,
  jitterLabel,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  score: QualityScore;
  jitterLabel: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 rounded-lg bg-muted/50 p-3">
      <span className="flex min-w-0 max-w-full items-center gap-1.5 font-medium">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </span>
      <QualityScoreBadge score={score} />
      <p className="text-xs text-muted-foreground">
        {score.limitingFactors.length > 0
          ? `Limited by ${formatFactors(score.limitingFactors, jitterLabel)}`
          : "No major limiter"}
      </p>
    </div>
  );
}

function QualityScoreBadge({ label, score }: { label?: string; score: QualityScore }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
      <Badge
        className={cn("gap-1.5 tabular-nums capitalize", gradeClass(score.grade))}
        variant="outline"
      >
        <span>{score.score ?? "--"}</span>
        <span aria-hidden="true">·</span>
        <span>{score.grade.replace("-", " ")}</span>
      </Badge>
    </span>
  );
}

function gradeClass(grade: QualityGrade): string {
  switch (grade) {
    case "excellent":
      return "border-primary/40 bg-primary/10 text-foreground";
    case "good":
      return "border-primary/30 text-foreground";
    case "fair":
      return "border-accent/40 bg-accent/10 text-foreground";
    case "poor":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "unknown":
      return "text-muted-foreground";
  }
}

function formatFactors(factors: QualityLimitingFactor[], jitterLabel: string): string {
  return factors.map((factor) => formatFactor(factor, jitterLabel)).join(", ");
}

function formatFactor(factor: QualityLimitingFactor, jitterLabel: string): string {
  switch (factor) {
    case "download":
      return "download";
    case "upload":
      return "upload";
    case "idle-latency":
      return "idle latency";
    case "loaded-latency":
      return "loaded latency";
    case "bufferbloat":
      return "bufferbloat";
    case "jitter":
      return jitterLabel;
  }
}

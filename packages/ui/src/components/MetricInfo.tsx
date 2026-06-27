import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export type MetricInfoKey =
  | "download"
  | "upload"
  | "idleLatency"
  | "jitter"
  | "downloadLatency"
  | "uploadLatency"
  | "bufferbloat";

export const metricInfo: Record<MetricInfoKey, string> = {
  download:
    "Download speed is how quickly your connection receives data. Higher is better for streaming, loading pages, installing updates, and downloading files.",
  upload:
    "Upload speed is how quickly your connection sends data. Higher is better for video calls, cloud backups, sending files, and livestreaming.",
  idleLatency:
    "Idle latency is the round-trip delay when the connection is not busy. Lower values make clicks, games, calls, and remote work feel more responsive.",
  jitter:
    "Jitter is how much latency jumps around between samples. Lower values keep voice, video, gaming, and screen sharing smooth instead of choppy.",
  downloadLatency:
    "Download latency is delay while the connection is busy receiving data. Lower values mean browsing, gaming, and calls stay responsive during downloads or streaming.",
  uploadLatency:
    "Upload latency is delay while the connection is busy sending data. Lower values mean calls, games, and browsing stay responsive during uploads or backups.",
  bufferbloat:
    "Bufferbloat grades how much latency rises under load. Better grades mean your connection can stay responsive while other devices are downloading or uploading.",
};

export function MetricInfo({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left" | "inline-start" | "inline-end";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`About ${label}`}
            className="shrink-0"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Info aria-hidden="true" />
          </Button>
        }
      />
      <TooltipContent
        align="start"
        className="max-w-72 items-start text-left"
        side={side}
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

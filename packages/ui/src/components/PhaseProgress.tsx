import type {
  SpeedTestPhase,
  SpeedTestRunPhase,
  SpeedTestState,
} from "@lightspeed/core";
import { Check } from "lucide-react";

import { cn } from "../lib/utils";

const STEPS: Array<{ phase: SpeedTestPhase; label: string }> = [
  { phase: "idle-latency", label: "Latency" },
  { phase: "download", label: "Download" },
  { phase: "upload", label: "Upload" },
  { phase: "finalize", label: "Finalize" },
];

/** Compact connected stepper showing how far through the run we are. */
export function PhaseProgress({
  state,
  selectedPhases,
}: {
  state: SpeedTestState;
  selectedPhases?: readonly SpeedTestRunPhase[];
}) {
  const steps = selectedPhases
    ? STEPS.filter(
        (step) => step.phase === "finalize" || selectedPhases.includes(step.phase),
      )
    : STEPS;
  const complete = state.status === "complete";
  const activeIndex = state.phase
    ? steps.findIndex((step) => step.phase === state.phase)
    : -1;

  return (
    <ol className="flex items-center gap-1.5" aria-label="Test progress">
      {steps.map((step, index) => {
        const done = complete || index < activeIndex;
        const active = !complete && index === activeIndex;
        return (
          <li className="flex min-w-0 items-center gap-1.5" key={step.phase}>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.62rem] font-semibold transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-xs font-medium",
                active ? "text-foreground" : "text-muted-foreground",
                "max-sm:sr-only",
                active && "max-sm:not-sr-only",
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "h-px w-4 shrink-0 sm:w-6",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

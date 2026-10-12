import {
  defaultRuntimeConfig,
  type RuntimeBrand,
  type RuntimeContent,
  type RuntimeTheme,
} from "@comet-speedtest/config";
import type {
  SpeedTestDiagnostics,
  SpeedTestConfig,
  SpeedTestError,
  SpeedTestResult,
} from "@comet-speedtest/core";
import { scoreConnectionQuality } from "@comet-speedtest/core";
import { LineChart, Loader2, Play, RotateCcw, Square } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { usePrefersReducedMotion } from "../hooks/useCountUp";
import { useSpeedTestController } from "../hooks/useSpeedTestController";
import { useSpeedTestView } from "../hooks/useSpeedTestView";
import { useApplyTheme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import { ConnectionQualitySummary } from "./ConnectionQualitySummary";
import { ErrorNotice } from "./ErrorNotice";
import { PhaseProgress } from "./PhaseProgress";
import { ResultReadout } from "./ResultReadout";
import { SampleChart } from "./SampleChart";
import { SpeedTape } from "./SpeedTape";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";

// Reveal height animation duration (collapse / draw).
const REVEAL_MS = 650;
// Hold time for one sweep phase - a touch longer than the reveal so the button
// fully reaches the top before it reverses direction.
const SWEEP_MS = REVEAL_MS + 90;
// The primary action becomes a drawing wave for the full time it is traveling.
const LAUNCH_DRAW_MS = REVEAL_MS;
const SWEEP_DRAW_MS = SWEEP_MS + REVEAL_MS;

export function SpeedTestWidget(props: {
  config: SpeedTestConfig;
  theme?: RuntimeTheme;
  brand?: RuntimeBrand;
  content?: RuntimeContent;
  /** Submission status for the run `runId`; ignored for any other result. */
  submission?: {
    runId: string;
    diagnostic: SpeedTestDiagnostics["submission"] | null;
  } | null;
  /** Called when the user starts a run, before its result or error. */
  onStart?: () => void;
  onResult?: (result: SpeedTestResult) => void | Promise<void>;
  onError?: (error: SpeedTestError) => void;
}) {
  const { onError, onResult, onStart } = props;
  // Standalone-embed convenience: pass `theme` and the widget themes itself,
  // no setup. For an app with its own chrome or dark mode, wrap it in
  // `<CometThemeProvider theme>` and omit this prop instead - both write
  // the same tokens to `<html>`, so doing both applies the theme twice. No-op
  // when `theme` is undefined.
  useApplyTheme(props.theme);
  const controller = useSpeedTestController(props.config);
  const [dismissedErrorKey, setDismissedErrorKey] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  // True during a sweep: both reveals are held closed so the button rides to the
  // top between phases (results/instrument collapse up, then the next draws down).
  const [collapsing, setCollapsing] = useState(false);
  // What the card is currently showing. It lags the run status so a transition
  // can play the up-then-down sweep before the content swaps.
  const [stage, setStage] = useState<"idle" | "live" | "results">("idle");
  const [primaryMoving, setPrimaryMoving] = useState(false);
  // Which brand colour the travelling beam glows: primary for launches and
  // re-runs (going to the live test), accent for the sweep into results - so the
  // same motion reads as "acquiring signal" vs "locking the reading".
  const [sweepTone, setSweepTone] = useState<"primary" | "accent">("primary");
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primaryMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const reportedResultRunRef = useRef<string | null>(null);
  const reportedErrorRef = useRef<string | null>(null);
  const content = {
    ...(defaultRuntimeConfig.content as Required<RuntimeContent>),
    ...props.content,
  };
  const brand = {
    ...(defaultRuntimeConfig.brand as Required<RuntimeBrand>),
    ...props.brand,
  };
  const { status, phase } = controller.state;
  // The run is "running" before any phase starts while the reachability probe
  // runs (phase is still null). Show a dedicated checking state for that window
  // instead of the live instrument, which would otherwise read "Finishing up".
  const connecting = status === "running" && phase === null;
  // "Active" = the run has launched (probing or measuring). Drives the launch
  // choreography: the button expands + rises and the run components draw out.
  const active = status === "running";

  // Overlay the submission status onto the result it belongs to, so the copied
  // payload and any diagnostics view reflect it. A status from an earlier run
  // never shows on a newer result. Submission does not affect the numbers.
  const displayedResult = useMemo(() => {
    if (!controller.result) {
      return null;
    }
    const submission =
      props.submission?.runId === controller.result.runId
        ? props.submission.diagnostic
        : null;
    if (!submission) {
      return controller.result;
    }
    return {
      ...controller.result,
      diagnostics: {
        ...controller.result.diagnostics,
        submission,
      },
    };
  }, [controller.result, props.submission]);

  const view = useSpeedTestView({
    state: controller.state,
    result: displayedResult,
    partial: controller.partial,
    samples: controller.samples,
    config: controller.config,
    labels: { download: content.downloadLabel, upload: content.uploadLabel },
  });

  const activeErrorKey = controller.error ? errorKey(controller.error) : null;
  const showError =
    controller.error !== null &&
    activeErrorKey !== null &&
    activeErrorKey !== dismissedErrorKey;
  const visibleError = showError ? controller.error : null;

  // Idle shows no status line (the Go button speaks for itself); the live region
  // stays mounted so running/complete/error are still announced.
  const statusText =
    status === "running"
      ? content.runningStatus
      : status === "complete"
        ? content.completeStatus
        : status === "error"
          ? "Test failed."
          : status === "aborted"
            ? "Test stopped."
            : "";
  const canRestart = ["complete", "error", "aborted"].includes(status);

  const bufferbloat = displayedResult?.bufferbloat ?? null;
  const idleJitterMs = displayedResult?.latency.idle?.jitterMs ?? null;
  // The quality score weighs the worst jitter across idle and under-load, so the
  // "limited by jitter" verdict is often driven by load-time spikes the idle
  // number never shows. Surface that value so the verdict matches a real number.
  const loadedJitterMs = displayedResult
    ? Math.max(
        displayedResult.latency.underDownloadLoad?.jitterMs ?? 0,
        displayedResult.latency.underUploadLoad?.jitterMs ?? 0,
      ) || null
    : null;
  const quality = useMemo(
    () => (displayedResult ? scoreConnectionQuality(displayedResult) : null),
    [displayedResult],
  );
  const hasResult = Boolean(displayedResult || controller.partial);

  useEffect(() => {
    if (controller.result && reportedResultRunRef.current !== controller.result.runId) {
      reportedResultRunRef.current = controller.result.runId;
      void onResult?.(controller.result);
    }
  }, [controller.result, onResult]);

  useEffect(() => {
    if (controller.error) {
      const key = `${controller.error.code}:${controller.error.phase ?? ""}:${
        controller.error.message
      }`;
      if (reportedErrorRef.current === key) {
        return;
      }
      reportedErrorRef.current = key;
      onError?.(controller.error);
    }
  }, [controller.error, onError]);

  const clearPrimaryMoveTimer = useCallback((): void => {
    if (primaryMoveTimer.current) {
      clearTimeout(primaryMoveTimer.current);
      primaryMoveTimer.current = null;
    }
  }, []);

  const drawWithPrimary = useCallback(
    (durationMs: number, tone: "primary" | "accent" = "primary"): void => {
      if (reducedMotion) {
        setPrimaryMoving(false);
        return;
      }
      clearPrimaryMoveTimer();
      setSweepTone(tone);
      setPrimaryMoving(true);
      primaryMoveTimer.current = setTimeout(() => {
        primaryMoveTimer.current = null;
        setPrimaryMoving(false);
      }, durationMs);
    },
    [clearPrimaryMoveTimer, reducedMotion],
  );

  async function start(options: { drawPrimary?: boolean } = {}): Promise<void> {
    if (options.drawPrimary !== false) {
      drawWithPrimary(LAUNCH_DRAW_MS);
    }
    setDismissedErrorKey(null);
    setShowChart(false);
    reportedErrorRef.current = null;
    onStart?.();
    await controller.start();
  }

  useEffect(
    () => () => {
      if (animTimer.current) {
        clearTimeout(animTimer.current);
      }
      clearPrimaryMoveTimer();
    },
    [clearPrimaryMoveTimer],
  );

  useEffect(() => {
    if (reducedMotion) {
      clearPrimaryMoveTimer();
      setPrimaryMoving(false);
    }
  }, [clearPrimaryMoveTimer, reducedMotion]);

  // What the stage should be showing, from the run status. An error counts as a
  // result so its notice collapses with the rest on the next re-run sweep.
  const desiredStage: "idle" | "live" | "results" = active
    ? "live"
    : hasResult || visibleError
      ? "results"
      : "idle";

  // Drive the stage toward what's wanted with an up-then-down sweep: hold both
  // reveals closed (the button rides to the top), pause, then show the new
  // content (the button comes back down). This covers the natural completion and
  // stop (instrument -> results). A *layout* effect so the collapse is triggered
  // synchronously before paint - matching the click-driven re-run sweep, which is
  // smooth; a passive effect lets the old instrument paint first and the collapse
  // skips. Transitions involving idle, and reduced motion, switch instantly. The
  // re-run sweep is driven by relaunch() instead, since it must keep the results
  // on screen until it starts the next run.
  useLayoutEffect(() => {
    if (stage === desiredStage) {
      return;
    }
    if (reducedMotion || stage === "idle" || desiredStage === "idle") {
      setStage(desiredStage);
      setCollapsing(false);
      return;
    }
    if (animTimer.current) {
      clearTimeout(animTimer.current);
    }
    drawWithPrimary(SWEEP_DRAW_MS, desiredStage === "results" ? "accent" : "primary");
    setCollapsing(true);
    animTimer.current = setTimeout(() => {
      animTimer.current = null;
      setStage(desiredStage);
      setCollapsing(false);
    }, SWEEP_MS);
  }, [desiredStage, drawWithPrimary, reducedMotion, stage]);

  // Re-run sweep: collapse the visible results first (the button rises and clears
  // them), pause, then swap to the live stage and start the next run so the test
  // draws back down underneath.
  function relaunch(): void {
    if (reducedMotion) {
      void start();
      return;
    }
    if (animTimer.current) {
      clearTimeout(animTimer.current);
    }
    drawWithPrimary(SWEEP_DRAW_MS);
    setCollapsing(true);
    setShowChart(false);
    animTimer.current = setTimeout(() => {
      animTimer.current = null;
      setStage("live");
      setCollapsing(false);
      void start({ drawPrimary: false });
    }, SWEEP_MS);
  }

  function handlePrimary(): void {
    if (collapsing) {
      return;
    }
    if (status === "running") {
      controller.stop();
      return;
    }
    if (hasResult) {
      relaunch();
      return;
    }
    void start();
  }

  // Launch choreography. "expanded" keeps the button full width through the
  // sweep; only the idle stage vertically centers it. Both reveals stay closed
  // while "collapsing", so the button rides to the top between the collapse-up
  // and draw-down phases.
  const expanded = active || collapsing;
  const idleLayout = stage === "idle";
  const resultsOpen = stage === "results" && !collapsing;
  const testOpen = stage === "live" && !collapsing;
  const PrimaryIcon = active ? Square : canRestart ? RotateCcw : Play;
  const primaryLabel = active
    ? content.stopLabel
    : canRestart
      ? content.restartLabel
      : content.startLabel;

  return (
    <section className="ls-widget @container/widget mx-auto grid w-full max-w-3xl gap-5 rounded-2xl bg-card p-5 text-card-foreground shadow-[0_24px_80px_rgb(23_32_42/8%)] dark:border @md/widget:gap-6 @md/widget:p-7 @2xl/widget:p-8">
      <header className="flex items-center gap-3">
        {brand.logoUrl ? (
          <img
            alt={brand.name}
            className="size-10 shrink-0 object-contain"
            src={brand.logoUrl}
          />
        ) : (
          <svg
            aria-hidden="true"
            className="size-9 shrink-0 text-primary"
            fill="none"
            viewBox="0 0 32 32"
          >
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="currentColor"
              strokeDasharray="56.5 75.4"
              strokeLinecap="round"
              strokeWidth="5"
              transform="rotate(135 16 16)"
            />
          </svg>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-muted-foreground">
            {brand.name}
          </p>
          <h1 className="text-xl leading-tight font-semibold @md/widget:text-2xl">
            {content.title}
          </h1>
        </div>
      </header>

      <div
        className={cn(
          "transition-[padding] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          idleLayout ? "py-8 @md/widget:py-12" : "py-0",
        )}
      >
        {/* Results (and any error notice) - drawn out when a run finishes. On
            re-run they collapse first (the button rises and clears them) before
            the test draws back in. The error lives here so it collapses too. */}
        <Reveal open={resultsOpen}>
          {stage === "results" ? (
            <div className="grid gap-5 pb-5 @md/widget:gap-6 @md/widget:pb-6">
              {visibleError ? (
                <ErrorNotice
                  error={visibleError}
                  onDismiss={() => setDismissedErrorKey(errorKey(visibleError))}
                />
              ) : null}
              {hasResult ? (
                <>
                  <ResultReadout
                    downloadBufferbloat={bufferbloat?.download ?? null}
                    idleJitterMs={idleJitterMs}
                    labels={{
                      download: content.downloadLabel,
                      upload: content.uploadLabel,
                      idleLatency: content.latencyLabel,
                      downloadLatency: `${content.downloadLabel} latency`,
                      uploadLatency: `${content.uploadLabel} latency`,
                    }}
                    loadedJitterMs={loadedJitterMs}
                    uploadBufferbloat={bufferbloat?.upload ?? null}
                    values={view.metrics}
                  />
                  {quality ? (
                    <ConnectionQualitySummary
                      idleJitterMs={idleJitterMs}
                      loadedJitterMs={loadedJitterMs}
                      quality={quality}
                    />
                  ) : null}
                  {controller.samples.length > 0 ? (
                    <div className="grid gap-3">
                      <div className="flex justify-center">
                        <Button
                          aria-expanded={showChart}
                          onClick={() => setShowChart((shown) => !shown)}
                          size="sm"
                          variant="ghost"
                        >
                          <LineChart aria-hidden="true" data-icon="inline-start" />
                          {showChart ? "Hide chart" : "Show chart"}
                        </Button>
                      </div>
                      {showChart ? (
                        <SampleChart
                          className="h-28 w-full sm:h-32"
                          samples={controller.samples}
                          scaleMaxMbps={view.scaleMaxMbps}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </Reveal>

        {/* The run instrument - drawn out beneath the button while the test runs,
            or the probe indicator while still reaching the server. Kept mounted
            through a collapse so it animates up instead of vanishing. */}
        <Reveal open={testOpen}>
          {stage === "live" ? (
            <div className="grid gap-5 pb-5 @md/widget:gap-6 @md/widget:pb-6">
              {connecting ? (
                <p
                  aria-live="polite"
                  className="flex items-center justify-center gap-2.5 text-sm font-medium text-muted-foreground"
                  role="status"
                >
                  <Loader2
                    aria-hidden="true"
                    className="size-4 motion-safe:animate-spin"
                  />
                  Checking server...
                </p>
              ) : null}
              <PhaseProgress
                selectedPhases={view.selectedPhases}
                state={controller.state}
              />
              <SpeedTape
                active={status === "running" && !connecting}
                bitsPerSecond={view.hero.value}
                label={view.hero.label}
                samples={controller.samples}
                scaleMaxMbps={view.scaleMaxMbps}
                tone={view.hero.tone}
              />
              {status === "running" && !connecting ? (
                <Progress aria-label="Test progress" value={view.progress} />
              ) : null}
            </div>
          ) : null}
        </Reveal>

        {/* The traveling primary action: expands to the card edge on launch and
            rides to the bottom of whatever is drawn out above it. */}
        <div
          className={cn(
            "mx-auto grid w-full gap-2 transition-[max-width] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            expanded ? "max-w-full" : "max-w-md",
          )}
        >
          <Button
            aria-label={primaryLabel}
            className={cn(
              "relative w-full overflow-hidden",
              "transition-[background-color,border-color,color,box-shadow] duration-200",
              // While traveling the button sheds its brand fill and label and
              // becomes a faintly-lit instrument plate for the beam of light to
              // sweep over (styled in styles.css so the beam colour can tint it) -
              // lit, never a blanked-out (disabled-looking) hole. It resolves back
              // to its real variant when motion stops via the color transition
              // above. The accent class only tints the sweep into results.
              primaryMoving && "ls-primary-traveling border-transparent shadow-none",
              primaryMoving && sweepTone === "accent" && "ls-sweep-accent",
            )}
            onClick={handlePrimary}
            size="lg"
            variant={active && !primaryMoving ? "destructive" : "default"}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex items-center gap-1.5 transition-opacity duration-150",
                primaryMoving ? "opacity-0" : "opacity-100",
              )}
            >
              <PrimaryIcon aria-hidden="true" data-icon="inline-start" />
              {primaryLabel}
            </span>
            {primaryMoving ? <PrimaryActionWave /> : null}
          </Button>
          {/* Status (complete / failed / stopped) is announced to assistive tech
              but never shown - the result and the error notice already say it. */}
          <p aria-live="polite" className="sr-only">
            {statusText}
          </p>
        </div>
      </div>
    </section>
  );
}

function PrimaryActionWave() {
  return (
    <span
      aria-hidden="true"
      className="ls-primary-wave pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      <span className="ls-primary-wave__strip" />
    </span>
  );
}

/**
 * A vertical "draw out" reveal that animates its content's height in and out
 * (clipping while closed), so the button below rides up as it collapses and down
 * as it expands. Uses the Web Animations API on the actual measured heights,
 * which animates reliably in both directions - CSS height/`grid-rows`
 * transitions snap on collapse. It settles to `auto` after an expand so live
 * content can keep resizing.
 */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) {
      return;
    }
    const rest = (): void => {
      outer.style.height = open ? "auto" : "0px";
    };
    // Start in the resolved state without animating on first mount.
    if (!mounted.current) {
      mounted.current = true;
      rest();
      return;
    }
    if (reduced || typeof outer.animate !== "function") {
      rest();
      return;
    }
    const from = outer.offsetHeight;
    const to = open ? inner.scrollHeight : 0;
    if (from === to) {
      rest();
      return;
    }
    const animation = outer.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: REVEAL_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    });
    animation.onfinish = () => {
      rest();
      animation.cancel();
    };
    return () => animation.cancel();
  }, [open, reduced]);

  return (
    <div
      ref={outerRef}
      aria-hidden={open ? undefined : true}
      className="overflow-hidden"
    >
      <div ref={innerRef}>
        <div
          className={cn(
            "transition-[opacity,transform] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            // Settle down into place as the beam draws it out, lift up into the
            // beam as it collapses - so content reads as drawn by the light, not
            // just height-animated. Transform only, so it never perturbs the
            // scrollHeight the Reveal measures.
            open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function errorKey(error: SpeedTestError | Error): string {
  return `${"code" in error ? error.code : error.name}:${"phase" in error ? (error.phase ?? "") : ""}:${error.message}`;
}

import {
  normalizeConfigWithTargets,
  type NormalizedSpeedTestConfig,
  type RuntimeTheme,
} from "@comet-speedtest/config";
import { createResultRecord, type SpeedTestResult } from "@comet-speedtest/core";
import {
  selectTarget,
  type TargetProfileSummary,
} from "@comet-speedtest/core/diagnostics";
import {
  ErrorNotice,
  CometThemeProvider,
  SpeedTestWidget,
  ThemeToggle,
  useColorScheme,
} from "@comet-speedtest/internal-ui";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@comet-speedtest/internal-ui/components/ui/alert";
import { Button } from "@comet-speedtest/internal-ui/components/ui/button";

import "@comet-speedtest/internal-ui/styles.css";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { loadProductionConfig } from "../config/loadProductionConfig";

import "./production.css";

type SubmissionDiagnostic = NonNullable<SpeedTestResult["diagnostics"]["submission"]>;
type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      config: NormalizedSpeedTestConfig;
      selectedTarget: TargetProfileSummary | null;
    }
  | { status: "error"; error: Error };
/** The submission of one run's result; `diagnostic` is null while in flight. */
type Submission = { runId: string; diagnostic: SubmissionDiagnostic | null };

const SUBMISSION_TIMEOUT_MS = 15_000;

export function ProductionApp() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [dismissedLoadErrorKey, setDismissedLoadErrorKey] = useState<string | null>(
    null,
  );

  const readyConfig = state.status === "ready" ? state.config : null;
  const [scheme, setScheme] = useColorScheme(
    readyConfig?.theme.colorScheme ?? "system",
  );
  // The app owns root theming (the shell — gradient, toggle, loading and error
  // states — is themed even before the widget mounts), so it resolves the theme
  // here and hands it to CometThemeProvider rather than to the widget.
  const themed = useMemo<RuntimeTheme>(
    () => ({ ...(readyConfig?.theme ?? {}), colorScheme: scheme }),
    [readyConfig, scheme],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadProductionConfig(controller.signal)
      .then((config) => {
        return selectConfiguredTarget(config, controller.signal);
      })
      .then(({ config, selectedTarget }) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({ status: "ready", config, selectedTarget });
        if (config.brand.faviconUrl) {
          setFavicon(config.brand.faviconUrl);
        }
        document.title = config.content.title;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDismissedLoadErrorKey(null);
          setState({
            status: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => controller.abort();
  }, []);

  const loadErrorKey =
    state.status === "error" ? `${state.error.name}:${state.error.message}` : null;

  return (
    <CometThemeProvider theme={themed}>
      <main className="production-shell relative flex min-h-screen flex-col items-center bg-background px-4 py-6 sm:px-6 sm:py-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] bg-[radial-gradient(60%_100%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-[0.07]"
        />
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle onChange={setScheme} value={scheme} />
        </div>

        <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 py-10">
          {state.status === "loading" ? (
            <div
              className="production-loading flex w-[min(560px,100%)] items-center justify-center gap-3 text-muted-foreground"
              role="status"
            >
              <span className="production-spinner size-[22px] animate-spin rounded-full border-[3px] border-border border-t-primary" />
              Loading speed test
            </div>
          ) : null}
          {state.status === "error" && loadErrorKey !== dismissedLoadErrorKey ? (
            <section className="production-error flex w-[min(560px,100%)] flex-col gap-3 [overflow-wrap:anywhere]">
              <ErrorNotice
                error={state.error}
                onDismiss={() => setDismissedLoadErrorKey(loadErrorKey)}
              />
            </section>
          ) : null}
          {state.status === "ready" ? (
            <ProductionSpeedTest
              config={state.config}
              selectedTarget={state.selectedTarget}
            />
          ) : null}
        </div>
      </main>
    </CometThemeProvider>
  );
}

/**
 * The loaded speed test plus its result submissions. Each submission belongs to
 * the run that produced it and is cleared when the next run starts, so a slow
 * response from an earlier run never shows during or over a later one.
 */
function ProductionSpeedTest({
  config,
  selectedTarget,
}: {
  config: NormalizedSpeedTestConfig;
  selectedTarget: TargetProfileSummary | null;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [dismissedWarningRunId, setDismissedWarningRunId] = useState<string | null>(
    null,
  );

  const handleResult = useCallback(
    async (result: SpeedTestResult) => {
      const { submitUrl } = config.result;
      if (!submitUrl) {
        return;
      }
      const { runId } = result;
      setSubmission({ runId, diagnostic: null });
      const diagnostic = await submitResult(submitUrl, result, {
        selectedTarget,
        includeRawSamples: config.result.includeRawSamples,
      });
      setSubmission((current) =>
        current?.runId === runId ? { runId, diagnostic } : current,
      );
    },
    [config, selectedTarget],
  );

  const failure =
    submission?.diagnostic?.ok === false
      ? { runId: submission.runId, message: submission.diagnostic.message }
      : null;

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4">
      {failure && failure.runId !== dismissedWarningRunId ? (
        <Alert className="w-full" variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
          <AlertAction>
            <Button
              aria-label="Dismiss warning"
              onClick={() => setDismissedWarningRunId(failure.runId)}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {/* No `theme` prop: the provider above already themed `<html>`, and
        the widget renders through those tokens. Passing it here too
        would apply the same theme a second time. */}
      <SpeedTestWidget
        brand={config.brand}
        config={config}
        content={config.content}
        onResult={handleResult}
        onStart={() => setSubmission(null)}
        submission={submission}
      />
    </div>
  );
}

/** POSTs the result record and reports the outcome; never throws. */
async function submitResult(
  submitUrl: string,
  result: SpeedTestResult,
  options: { selectedTarget: TargetProfileSummary | null; includeRawSamples: boolean },
): Promise<SubmissionDiagnostic> {
  try {
    const record = createResultRecord(result, {
      ...(options.selectedTarget ? { selectedTarget: options.selectedTarget } : {}),
      rawSamples: options.includeRawSamples ? "preserve" : "strip",
    });
    const response = await fetch(submitUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(SUBMISSION_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `Result submission failed with HTTP ${response.status}.`,
      };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return {
        ok: false,
        message: `Result submission timed out after ${SUBMISSION_TIMEOUT_MS / 1000} seconds.`,
      };
    }
    return {
      ok: false,
      message: `Result submission failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

async function selectConfiguredTarget(
  config: NormalizedSpeedTestConfig,
  signal: AbortSignal,
): Promise<{
  config: NormalizedSpeedTestConfig;
  selectedTarget: TargetProfileSummary | null;
}> {
  if (config.targetProfiles.length === 0) {
    return { config, selectedTarget: null };
  }

  const selection = await selectTarget({
    targets: config.targetProfiles,
    strategy: config.targetSelection?.strategy ?? "lowest-latency",
    ...(config.targetSelection?.targetId
      ? { targetId: config.targetSelection.targetId }
      : {}),
    signal,
    timeoutMs: config.test.latency.timeoutMs,
  });
  if (signal.aborted) {
    throw new DOMException("Target selection aborted.", "AbortError");
  }
  const selectedConfig = normalizeConfigWithTargets(config, selection.targets);

  return {
    config: selectedConfig,
    selectedTarget: {
      id: selection.selected.id,
      ...(selection.selected.label ? { label: selection.selected.label } : {}),
      ...(selection.selected.metadata ? { metadata: selection.selected.metadata } : {}),
    },
  };
}

function setFavicon(url: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.href = url;
}

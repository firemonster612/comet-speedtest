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
} from "@comet-speedtest/ui";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@comet-speedtest/ui/components/ui/alert";
import { Button } from "@comet-speedtest/ui/components/ui/button";

import "@comet-speedtest/ui/styles.css";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadProductionConfig } from "../config/loadProductionConfig";

import "./production.css";

type SubmissionDiagnostic = SpeedTestResult["diagnostics"]["submission"];
type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      config: NormalizedSpeedTestConfig;
      selectedTarget: TargetProfileSummary | null;
      submission: SubmissionDiagnostic | null;
      warning: string | null;
    }
  | { status: "error"; error: Error };

export function ProductionApp() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [dismissedLoadErrorKey, setDismissedLoadErrorKey] = useState<string | null>(
    null,
  );
  const [dismissedWarning, setDismissedWarning] = useState<string | null>(null);
  const configRef = useRef<NormalizedSpeedTestConfig | null>(null);
  const selectedTargetRef = useRef<TargetProfileSummary | null>(null);

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
        setState({
          status: "ready",
          config,
          selectedTarget,
          submission: null,
          warning: null,
        });
        configRef.current = config;
        selectedTargetRef.current = selectedTarget;
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

  const submitResult = useCallback(async function submitResult(
    config: NormalizedSpeedTestConfig,
    result: SpeedTestResult,
  ): Promise<void> {
    if (!config.result.submitUrl) {
      return;
    }
    const selectedTarget = selectedTargetRef.current;
    setState({
      status: "ready",
      config,
      selectedTarget,
      submission: null,
      warning: null,
    });
    try {
      const record = createResultRecord(result, {
        ...(selectedTarget ? { selectedTarget } : {}),
        rawSamples: config.result.includeRawSamples ? "preserve" : "strip",
      });
      const response = await fetch(config.result.submitUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!response.ok) {
        const message = `Result submission failed with HTTP ${response.status}.`;
        setDismissedWarning(null);
        setState({
          status: "ready",
          config,
          selectedTarget,
          submission: { ok: false, status: response.status, message },
          warning: message,
        });
        return;
      }
      setState({
        status: "ready",
        config,
        selectedTarget,
        submission: { ok: true, status: response.status },
        warning: null,
      });
    } catch (error) {
      const message = `Result submission failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      setDismissedWarning(null);
      setState({
        status: "ready",
        config,
        selectedTarget,
        submission: { ok: false, message },
        warning: message,
      });
    }
  }, []);

  const handleResult = useCallback(
    (result: SpeedTestResult) => {
      const config = configRef.current;
      if (config) {
        return submitResult(config, result);
      }
    },
    [submitResult],
  );
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
            <div className="flex w-full max-w-3xl flex-col items-center gap-4">
              {state.warning && state.warning !== dismissedWarning ? (
                <Alert className="w-full" variant="destructive">
                  <AlertDescription>{state.warning}</AlertDescription>
                  <AlertAction>
                    <Button
                      aria-label="Dismiss warning"
                      onClick={() => setDismissedWarning(state.warning)}
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
                brand={state.config.brand}
                config={state.config}
                content={state.config.content}
                onResult={handleResult}
                submission={state.submission ?? undefined}
              />
            </div>
          ) : null}
        </div>
      </main>
    </CometThemeProvider>
  );
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

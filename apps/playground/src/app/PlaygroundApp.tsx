import {
  defaultRuntimeConfig,
  loadRuntimeConfig,
  normalizeConfig,
  validateConfig,
  type RuntimeConfig,
  type RuntimeTheme,
} from "@lightspeed/config";
import { ErrorNotice, LightspeedThemeProvider, SpeedTestWidget } from "@lightspeed/ui";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@lightspeed/ui/components/ui/alert";
import { Button } from "@lightspeed/ui/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@lightspeed/ui/components/ui/tabs";

import "@lightspeed/ui/styles.css";
import {
  Braces,
  Gauge,
  Layers,
  Link2,
  Palette,
  RotateCcw,
  Timer,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { ConfigPanel } from "../panels/ConfigPanel";
import { EndpointPanel } from "../panels/EndpointPanel";
import { LatencyPanel } from "../panels/LatencyPanel";
import { SamplingPanel } from "../panels/SamplingPanel";
import { ThemePanel, type PreviewScheme } from "../panels/ThemePanel";
import { ThroughputPanel } from "../panels/ThroughputPanel";

import "./playground.css";

type Tab = "endpoints" | "throughput" | "sampling" | "latency" | "theme" | "config";

interface Section {
  id: Tab;
  label: string;
  icon: LucideIcon;
  description: string;
}

const SECTIONS: readonly Section[] = [
  {
    id: "endpoints",
    label: "Endpoints",
    icon: Link2,
    description:
      "The URLs the test fetches. Probe them to confirm CORS and status before you ship a profile.",
  },
  {
    id: "throughput",
    label: "Throughput",
    icon: Gauge,
    description:
      "Download and upload measurement: payload sizes, durations, and concurrent workers per direction.",
  },
  {
    id: "sampling",
    label: "Sampling",
    icon: Layers,
    description:
      "Window cadence, samples per window, and whether raw per-sample data is kept in the result.",
  },
  {
    id: "latency",
    label: "Latency",
    icon: Timer,
    description:
      "Idle and under-load latency probing, plus which endpoint the latency phase targets.",
  },
  {
    id: "theme",
    label: "Theme",
    icon: Palette,
    description:
      "Brand, color scheme, palette, and copy — applied to the live preview the moment you change them.",
  },
  {
    id: "config",
    label: "Config",
    icon: Braces,
    description:
      "Import, export, or reset the full runtime configuration as JSON in one place.",
  },
];

/** The live preview pane — the speed-test widget, or a validation notice. */
function PlaygroundPreview({
  normalized,
}: {
  normalized: ReturnType<typeof normalizeConfig> | null;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [normalized]);

  if (!normalized) {
    return dismissed ? null : (
      <Alert variant="destructive">
        <AlertDescription>Fix config validation before running.</AlertDescription>
        <AlertAction>
          <Button
            aria-label="Dismiss validation error"
            onClick={() => setDismissed(true)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  // No `theme` prop: PlaygroundApp wraps the page in LightspeedThemeProvider,
  // so the live-edited draft theme is already applied to `<html>`.
  return (
    <SpeedTestWidget
      brand={normalized.brand}
      config={normalized}
      content={normalized.content}
    />
  );
}

/** The configuration bench: section rail + active panel, one connected surface. */
function PlaygroundConfigBench({
  activeTab,
  onTab,
  onResetDefaults,
  renderPanel,
}: {
  activeTab: Tab;
  onTab: (tab: Tab) => void;
  onResetDefaults: () => void;
  renderPanel: (id: Tab) => ReactNode;
}) {
  return (
    <Tabs
      className="ls-config-bench flex flex-col overflow-hidden rounded-xl border bg-card lg:flex-row"
      onValueChange={(value) => onTab(value as Tab)}
      orientation="vertical"
      value={activeTab}
    >
      <TabsList
        className="ls-config-nav h-auto w-full shrink-0 flex-col items-stretch justify-start gap-1 rounded-none border-b bg-muted/30 p-2 lg:w-16 lg:border-r lg:border-b-0 lg:p-2.5"
        variant="line"
      >
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <TabsTrigger
              aria-label={section.label}
              className="ls-config-trigger h-auto w-full flex-none justify-start gap-2.5 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-card/70 hover:text-foreground data-active:bg-card data-active:text-foreground data-active:shadow-sm data-active:[&_svg]:text-primary lg:justify-center lg:px-0 lg:py-2.5"
              key={section.id}
              title={section.label}
              value={section.id}
            >
              <Icon aria-hidden="true" />
              <span className="ls-config-label truncate">{section.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      <div className="ls-config-content min-w-0 flex-1">
        {SECTIONS.map((section) => (
          <TabsContent
            className="ls-panel-enter focus-visible:outline-none"
            key={section.id}
            value={section.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg leading-tight font-semibold">{section.label}</h2>
                <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
                  {section.description}
                </p>
              </div>
              <Button
                onClick={onResetDefaults}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" data-icon="inline-start" />
                Reset to defaults
              </Button>
            </div>
            <div className="px-5 py-5 sm:px-6">{renderPanel(section.id)}</div>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

export function PlaygroundApp() {
  const savedStateRef = useRef(loadSavedState());
  // When a saved draft matches the config source we're about to load, keep it
  // instead of resetting to the freshly fetched baseline on first load.
  const restoreDraftRef = useRef(false);

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = savedStateRef.current?.activeTab;
    if (saved && SECTIONS.some((section) => section.id === saved)) {
      return saved;
    }
    return "endpoints";
  });
  const [configUrl, setConfigUrl] = useState(() => {
    const url = new URL(location.href);
    return (
      url.searchParams.get("config") ??
      savedStateRef.current?.configUrl ??
      "/lightspeed.config.json"
    );
  });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fetched, setFetched] = useState<RuntimeConfig | null>(null);
  const [draft, setDraft] = useState<RuntimeConfig>(() => {
    const saved = savedStateRef.current;
    const savedUrl = saved?.configUrl ?? "/lightspeed.config.json";
    if (saved?.draft && savedUrl === configUrl) {
      try {
        const hydrated = completeRuntimeConfig(saved.draft);
        restoreDraftRef.current = true;
        return hydrated;
      } catch {
        // Saved draft is stale or invalid; fall back to defaults.
      }
    }
    return completeRuntimeConfig(defaultRuntimeConfig);
  });
  const [error, setError] = useState<Error | null>(null);
  const [dismissedErrorKey, setDismissedErrorKey] = useState<string | null>(null);
  const [dismissedValidationKey, setDismissedValidationKey] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [probeResult, setProbeResult] = useState<string>("");
  // Playground-only override so users can inspect the light/dark palettes
  // without changing the production `colorScheme` saved in the draft.
  const [previewScheme, setPreviewScheme] = useState<PreviewScheme>("config");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadRuntimeConfig({ url: configUrl, signal: controller.signal })
      .then((runtime) => {
        const complete = completeRuntimeConfig(runtime);
        setFetched(complete);
        // Keep a restored draft on first load; otherwise track the baseline.
        if (restoreDraftRef.current) {
          restoreDraftRef.current = false;
        } else {
          setDraft(complete);
        }
        setError(null);
        setDismissedErrorKey(null);
      })
      .catch((nextError: unknown) => {
        if (!controller.signal.aborted) {
          const resolved =
            nextError instanceof Error ? nextError : new Error(String(nextError));
          setError(resolved);
          setDismissedErrorKey(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [configUrl, reloadNonce]);

  // Persist the working draft, the config source, and the open tab so a reload
  // restores the session instead of resetting to the fetched baseline.
  useEffect(() => {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ configUrl, draft, activeTab }),
      );
    } catch {
      // Storage may be unavailable (private mode, quota); persistence is best-effort.
    }
  }, [configUrl, draft, activeTab]);

  const validation = useMemo(() => validateConfig(draft), [draft]);
  const issueCount = validation.ok ? 0 : validation.issues.length;
  const validationMessage = validation.issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(" ");
  const loadErrorKey = error ? errorKey(error) : null;
  const validationKey = validation.ok ? null : validationMessage;
  const normalized = useMemo(() => {
    if (!validation.ok) {
      return null;
    }
    try {
      return normalizeConfig(draft, { source: configUrl, baseUrl: location.href });
    } catch {
      return null;
    }
  }, [configUrl, draft, validation.ok]);

  // The theme applied to <html>. When a preview scheme is forced, override only
  // the colorScheme so the live preview flips palettes without mutating the draft.
  const previewTheme = useMemo<RuntimeTheme | undefined>(() => {
    if (previewScheme === "config") {
      return draft.theme;
    }
    return { ...draft.theme, colorScheme: previewScheme };
  }, [draft.theme, previewScheme]);

  function update(mutator: (config: RuntimeConfig) => RuntimeConfig): void {
    setDraft((current) => mutator(structuredClone(current)));
  }

  function importConfig(next: RuntimeConfig): void {
    setDraft(completeRuntimeConfig(next));
  }

  async function probeEndpoints(): Promise<void> {
    const targets = draft.targets;
    const checks = [
      ["download", targets.download, "HEAD"],
      [
        "latency",
        targets.latency ?? targets.download,
        draft.test?.latency?.method ?? "HEAD",
      ],
      ["upload", targets.upload, "OPTIONS"],
    ] as const;
    const lines: string[] = [];
    for (const [label, target, method] of checks) {
      try {
        const response = await fetch(new URL(target, location.href), {
          method,
          cache: "no-store",
        });
        lines.push(`${label}: ${response.status} ${response.statusText || "OK"}`);
      } catch (nextError) {
        lines.push(
          `${label}: ${nextError instanceof Error ? nextError.message : String(nextError)}`,
        );
      }
    }
    setProbeResult(lines.join("\n"));
  }

  function resetToFetched(): void {
    if (fetched) {
      setDraft(fetched);
    }
  }

  function renderPanel(id: Tab): ReactNode {
    switch (id) {
      case "endpoints":
        return (
          <EndpointPanel
            config={draft}
            onProbe={() => void probeEndpoints()}
            onUpdate={update}
            probeResult={probeResult}
          />
        );
      case "throughput":
        return <ThroughputPanel config={draft} onUpdate={update} />;
      case "sampling":
        return <SamplingPanel config={draft} onUpdate={update} />;
      case "latency":
        return <LatencyPanel config={draft} onUpdate={update} />;
      case "theme":
        return (
          <ThemePanel
            config={draft}
            onPreviewSchemeChange={setPreviewScheme}
            onUpdate={update}
            previewScheme={previewScheme}
          />
        );
      case "config":
        return (
          <ConfigPanel
            config={draft}
            configUrl={configUrl}
            issueCount={issueCount}
            loadError={error}
            loading={loading}
            onImport={importConfig}
            onConfigUrlChange={setConfigUrl}
            onReloadConfig={() => setReloadNonce((current) => current + 1)}
            onResetFetched={resetToFetched}
          />
        );
    }
  }

  return (
    <LightspeedThemeProvider theme={previewTheme}>
      <div className="ls-playground flex min-h-screen flex-col bg-background text-foreground">
        <h1 className="sr-only">Speed test playground</h1>
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
          {loading || error || !validation.ok ? (
            <div className="flex flex-col gap-3">
              {loading ? (
                <Alert>
                  <AlertDescription>Loading runtime config…</AlertDescription>
                </Alert>
              ) : null}
              {error && loadErrorKey !== dismissedErrorKey ? (
                <ErrorNotice
                  error={error}
                  onDismiss={() => setDismissedErrorKey(loadErrorKey)}
                />
              ) : null}
              {!validation.ok && validationKey !== dismissedValidationKey ? (
                <Alert variant="destructive">
                  <AlertDescription>{validationMessage}</AlertDescription>
                  <AlertAction>
                    <Button
                      aria-label="Dismiss validation error"
                      onClick={() => setDismissedValidationKey(validationKey)}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </AlertAction>
                </Alert>
              ) : null}
            </div>
          ) : null}

          <div className="grid items-start gap-5 lg:grid-cols-[4.25rem_minmax(0,1fr)] lg:items-stretch">
            <div className="ls-config-slot">
              {/* One bench: the section rail and the panel it controls share a single
                surface, divided by a hairline, so the active control reads as
                driving the adjacent content. */}
              <PlaygroundConfigBench
                activeTab={activeTab}
                onTab={setActiveTab}
                onResetDefaults={() =>
                  setDraft(completeRuntimeConfig(defaultRuntimeConfig))
                }
                renderPanel={renderPanel}
              />
            </div>

            <aside className="grid content-start gap-5 lg:sticky lg:top-5 lg:content-center">
              <PlaygroundPreview normalized={normalized} />
            </aside>
          </div>
        </div>
      </div>
    </LightspeedThemeProvider>
  );
}

function completeRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  const baseUrl = typeof location === "undefined" ? "http://localhost/" : location.href;
  const normalized = normalizeConfig(config, {
    source: "playground-draft",
    baseUrl,
  });

  const complete: RuntimeConfig = {
    brand: { ...normalized.brand },
    theme: { ...normalized.theme },
    content: { ...normalized.content },
    targets: {
      download: config.targets.download,
      upload: config.targets.upload,
      latency: config.targets.latency ?? config.targets.download,
    },
    test: {
      download: { ...normalized.test.download },
      upload: { ...normalized.test.upload },
      sampling: { ...normalized.test.sampling },
      latency: { ...normalized.test.latency },
      selection: {
        phases: [...normalized.test.selection.phases],
        loadedLatency: { ...normalized.test.selection.loadedLatency },
      },
    },
    result: {
      submitUrl: config.result?.submitUrl ?? normalized.result.submitUrl,
      includeRawSamples: normalized.result.includeRawSamples,
    },
  };

  if (config.targetProfiles) {
    complete.targetProfiles = config.targetProfiles.map((profile) => ({
      id: profile.id,
      ...(profile.label ? { label: profile.label } : {}),
      ...(profile.metadata ? { metadata: profile.metadata } : {}),
      targets: {
        download: profile.targets.download,
        upload: profile.targets.upload,
        latency: profile.targets.latency ?? profile.targets.download,
      },
    }));
  }
  if (normalized.targetSelection) {
    complete.targetSelection = { ...normalized.targetSelection };
  } else if (config.targetSelection !== undefined) {
    complete.targetSelection = config.targetSelection;
  }

  return complete;
}

function errorKey(error: Error): string {
  return `${error.name}:${error.message}`;
}

const STORAGE_KEY = "lightspeed:playground";

interface SavedPlaygroundState {
  configUrl?: string;
  draft?: RuntimeConfig;
  activeTab?: Tab;
}

/** Best-effort read of the persisted playground session; never throws. */
function loadSavedState(): SavedPlaygroundState | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedPlaygroundState) : null;
  } catch {
    return null;
  }
}

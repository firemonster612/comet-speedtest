import type { RuntimeConfig } from "@comet-speedtest/config";
import { Alert, AlertDescription } from "@comet-speedtest/ui/components/ui/alert";
import { Button } from "@comet-speedtest/ui/components/ui/button";
import { Input } from "@comet-speedtest/ui/components/ui/input";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { type ConfigUpdater, Field, Panel } from "./shared";

export function EndpointPanel({
  config,
  onUpdate,
  onProbe,
  probeResult,
}: {
  config: RuntimeConfig;
  onUpdate: ConfigUpdater;
  onProbe: () => void;
  probeResult: string;
}) {
  const [serverOrigin, setServerOrigin] = useState(() =>
    inferServerOrigin(config.targets),
  );
  const [serverOriginError, setServerOriginError] = useState("");
  const normalizedServerOrigin = normalizeServerOrigin(serverOrigin);
  const currentOrigin = getCurrentOrigin();
  const isCrossOrigin =
    normalizedServerOrigin !== null &&
    currentOrigin !== null &&
    normalizedServerOrigin !== currentOrigin;

  useEffect(() => {
    setServerOrigin(inferServerOrigin(config.targets));
  }, [config.targets.download, config.targets.upload, config.targets.latency]);

  function applyServerOrigin(): void {
    const origin = normalizeServerOrigin(serverOrigin);
    if (!origin) {
      setServerOriginError("Enter a valid server IP, host, or origin.");
      return;
    }
    setServerOriginError("");
    onUpdate((draft) => ({
      ...draft,
      targets: {
        download: withOrigin(origin, draft.targets.download),
        upload: withOrigin(origin, draft.targets.upload),
        latency: withOrigin(origin, draft.targets.latency ?? draft.targets.download),
      },
    }));
  }

  return (
    <Panel>
      <div className="col-span-2 grid gap-3 border-b pb-5 max-md:col-span-1">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Server origin or IP">
            <Input
              className="min-w-0 sm:w-96"
              placeholder="192.168.1.50:8080"
              value={serverOrigin}
              onChange={(event) => {
                setServerOrigin(event.target.value);
                setServerOriginError("");
              }}
            />
          </Field>
          <Button onClick={applyServerOrigin} type="button" variant="outline">
            Apply server
          </Button>
        </div>
        {serverOriginError ? (
          <p className="text-sm text-destructive">{serverOriginError}</p>
        ) : null}
        {isCrossOrigin ? (
          <Alert>
            <AlertDescription>
              Cross-origin tests may fail unless that server is configured to allow all
              CORS requests from this playground origin. The recommended flow is to
              serve the playground from the same server that hosts the speed-test
              endpoints.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <Field label="Download URL">
        <Input
          value={config.targets.download}
          onChange={(event) =>
            onUpdate((draft) => ({
              ...draft,
              targets: { ...draft.targets, download: event.target.value },
            }))
          }
        />
      </Field>
      <Field label="Upload URL">
        <Input
          value={config.targets.upload}
          onChange={(event) =>
            onUpdate((draft) => ({
              ...draft,
              targets: { ...draft.targets, upload: event.target.value },
            }))
          }
        />
      </Field>
      <Field label="Latency URL">
        <Input
          value={config.targets.latency ?? ""}
          onChange={(event) =>
            onUpdate((draft) => {
              const targets = { ...draft.targets };
              if (event.target.value) {
                targets.latency = event.target.value;
              } else {
                delete targets.latency;
              }
              return { ...draft, targets };
            })
          }
        />
      </Field>
      <div className="col-span-2 flex flex-col gap-3 max-md:col-span-1">
        <Button className="w-fit" onClick={onProbe} variant="outline">
          <Search aria-hidden="true" data-icon="inline-start" />
          Probe CORS and status
        </Button>
        <pre className="overflow-auto rounded-md border bg-muted/50 p-3 text-sm text-foreground">
          {probeResult || "No probe run yet."}
        </pre>
      </div>
    </Panel>
  );
}

function inferServerOrigin(targets: RuntimeConfig["targets"]): string {
  const baseUrl = getCurrentHref();
  const origins = [targets.download, targets.upload, targets.latency]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value, baseUrl).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  const [first] = origins;
  return first && origins.every((origin) => origin === first) ? first : "";
}

function normalizeServerOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

function withOrigin(origin: string, target: string): string {
  try {
    const path = new URL(target, getCurrentHref());
    return `${origin}${path.pathname}${path.search}${path.hash}`;
  } catch {
    return target;
  }
}

function getCurrentHref(): string {
  return typeof location === "undefined" ? "http://localhost/" : location.href;
}

function getCurrentOrigin(): string | null {
  return typeof location === "undefined" ? null : location.origin;
}

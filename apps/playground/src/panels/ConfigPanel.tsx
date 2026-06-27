import { exportConfig, type RuntimeConfig } from "@lightspeed/config";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@lightspeed/ui/components/ui/alert";
import { Badge } from "@lightspeed/ui/components/ui/badge";
import { Button } from "@lightspeed/ui/components/ui/button";
import { Input } from "@lightspeed/ui/components/ui/input";
import { Textarea } from "@lightspeed/ui/components/ui/textarea";
import { RefreshCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Field, Panel } from "./shared";

export function ConfigPanel({
  config,
  configUrl,
  issueCount,
  loading,
  loadError,
  onImport,
  onReloadConfig,
  onConfigUrlChange,
  onResetFetched,
}: {
  config: RuntimeConfig;
  configUrl: string;
  issueCount: number;
  loading: boolean;
  loadError: Error | null;
  onImport: (config: RuntimeConfig) => void;
  onReloadConfig: () => void;
  onConfigUrlChange: (url: string) => void;
  onResetFetched: () => void;
}) {
  const text = useMemo(() => exportConfig(config), [config]);
  const [draftText, setDraftText] = useState(text);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraftText(text);
  }, [text]);

  return (
    <Panel>
      <div className="col-span-2 grid gap-3 border-b pb-5 max-md:col-span-1">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Config URL">
            <Input
              className="min-w-0 sm:w-96"
              value={configUrl}
              onChange={(event) => onConfigUrlChange(event.target.value)}
            />
          </Field>
          <Button onClick={onReloadConfig} type="button" variant="outline">
            <RefreshCcw aria-hidden="true" data-icon="inline-start" />
            Reload
          </Button>
          <ConfigStatusBadge
            issueCount={issueCount}
            loadError={loadError}
            loading={loading}
          />
        </div>
      </div>

      <div className="col-span-2 flex flex-col gap-3 max-md:col-span-1">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onResetFetched} size="sm" variant="outline">
            Reset to fetched config
          </Button>
          <Button
            onClick={() => {
              try {
                onImport(JSON.parse(draftText) as RuntimeConfig);
                setError("");
              } catch (nextError) {
                setError(
                  nextError instanceof Error ? nextError.message : String(nextError),
                );
              }
            }}
            size="sm"
          >
            Import JSON
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="[overflow-wrap:anywhere]">
              {error}
            </AlertDescription>
            <AlertAction>
              <Button
                aria-label="Dismiss import error"
                onClick={() => setError("")}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        <Field label="Import or export JSON">
          <Textarea
            className="max-h-[52vh] min-h-[440px] overflow-auto font-mono text-xs"
            spellCheck={false}
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
          />
        </Field>
      </div>
    </Panel>
  );
}

function ConfigStatusBadge({
  issueCount,
  loading,
  loadError,
}: {
  issueCount: number;
  loading: boolean;
  loadError: Error | null;
}) {
  const state =
    loading || loadError || issueCount > 0
      ? {
          label: loading
            ? "Loading config"
            : loadError
              ? "Config load failed"
              : `${issueCount} issue${issueCount === 1 ? "" : "s"}`,
          variant: loadError || issueCount > 0 ? "destructive" : "outline",
        }
      : {
          label: "Config valid",
          variant: "outline",
        };

  return (
    <Badge
      aria-live="polite"
      className="h-8 self-end px-3 text-sm font-medium"
      variant={state.variant as "outline" | "destructive"}
    >
      {state.label}
    </Badge>
  );
}

import type { SpeedTestError } from "@lightspeed/core";
import { TriangleAlert, X } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";

export function ErrorNotice({
  error,
  onDismiss,
}: {
  error: SpeedTestError | Error;
  onDismiss?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Test unavailable</AlertTitle>
      <AlertDescription className="[overflow-wrap:anywhere]">
        <p>{error.message}</p>
        {"code" in error ? (
          <code className="font-mono text-xs">{error.code}</code>
        ) : null}
        {"phase" in error && error.phase ? <p>Failed during {error.phase}.</p> : null}
      </AlertDescription>
      {onDismiss ? (
        <AlertAction>
          <Button
            aria-label="Dismiss error"
            onClick={onDismiss}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

import type { SpeedTestResult } from "@comet-speedtest/core";

export function TransportDiagnostics({ result }: { result: SpeedTestResult | null }) {
  if (!result) {
    return null;
  }
  const diagnostics = result.diagnostics;
  return (
    <details className="border-t pt-3.5 text-sm">
      <summary className="cursor-pointer font-medium select-none">Diagnostics</summary>
      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">Download transport</dt>
        <dd>
          {diagnostics.requestedTransports.download
            ? `${diagnostics.requestedTransports.download} requested, ${
                diagnostics.actualTransports.download ?? "not run"
              } actual`
            : "Not run"}
        </dd>
        <dt className="text-muted-foreground">Upload transport</dt>
        <dd>
          {diagnostics.requestedTransports.upload
            ? `${diagnostics.requestedTransports.upload} requested, ${
                diagnostics.actualTransports.upload ?? "not run"
              } actual`
            : "Not run"}
        </dd>
        <dt className="text-muted-foreground">Measurement basis</dt>
        <dd>
          Download: {diagnostics.measurementBasis.download ?? "not run"}; upload:{" "}
          {diagnostics.measurementBasis.upload ?? "not run"}
        </dd>
        <dt className="text-muted-foreground">Workers started</dt>
        <dd>
          Download: {diagnostics.workersStarted.download}/
          {diagnostics.workersRequested.download}; upload:{" "}
          {diagnostics.workersStarted.upload}/{diagnostics.workersRequested.upload}
        </dd>
        <dt className="text-muted-foreground">Fallbacks</dt>
        <dd>
          {diagnostics.fallbackReasons.length > 0
            ? diagnostics.fallbackReasons.join("; ")
            : "None"}
        </dd>
        <dt className="text-muted-foreground">Errors</dt>
        <dd>
          {diagnostics.errors.length > 0
            ? diagnostics.errors
                .map((error) =>
                  [error.phase, error.code, error.message].filter(Boolean).join(": "),
                )
                .join("; ")
            : "None"}
        </dd>
        {diagnostics.submission ? (
          <>
            <dt className="text-muted-foreground">Submission</dt>
            <dd>
              {diagnostics.submission.ok ? "Accepted" : "Failed"}
              {diagnostics.submission.status
                ? `, HTTP ${diagnostics.submission.status}`
                : ""}
              {diagnostics.submission.message
                ? `: ${diagnostics.submission.message}`
                : ""}
            </dd>
          </>
        ) : null}
      </dl>
      <pre className="mt-3 overflow-auto rounded-md bg-foreground p-3 text-background">
        {JSON.stringify(diagnostics.capabilityReport, null, 2)}
      </pre>
    </details>
  );
}

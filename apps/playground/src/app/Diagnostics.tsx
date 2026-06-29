import type { SpeedTestResult } from "@comet-speedtest/core";
import { SampleChart } from "@comet-speedtest/ui";
import { Button } from "@comet-speedtest/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comet-speedtest/ui/components/ui/table";
import { Clipboard, Download } from "lucide-react";

/**
 * Diagnostics readout for the playground. Renders flat — it lives inside a
 * configuration-section card whose header already supplies the "Diagnostics"
 * heading, so wrapping it in its own card would nest cards (forbidden).
 */
export function Diagnostics({
  result,
  configText,
}: {
  result: SpeedTestResult | null;
  configText: string;
}) {
  return (
    <div className="diagnostics-panel flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!configText}
          onClick={() => void navigator.clipboard?.writeText(configText)}
          size="sm"
          variant="outline"
        >
          <Clipboard aria-hidden="true" data-icon="inline-start" />
          Copy config
        </Button>
        <Button
          disabled={!result}
          onClick={() => {
            if (result) {
              void navigator.clipboard?.writeText(JSON.stringify(result, null, 2));
            }
          }}
          size="sm"
          variant="outline"
        >
          <Download aria-hidden="true" data-icon="inline-start" />
          Copy result
        </Button>
      </div>
      {result ? <ResultDiagnosticsSummary result={result} /> : null}
      <pre className="overflow-auto rounded-md border bg-muted/50 p-3 text-xs text-foreground">
        {result ? JSON.stringify(result, null, 2) : configText || "No run yet."}
      </pre>
    </div>
  );
}

function ResultDiagnosticsSummary({ result }: { result: SpeedTestResult }) {
  const errors = result.diagnostics.errors;
  return (
    <div className="diagnostics-summary flex flex-col gap-2.5">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">Transports</dt>
        <dd>
          Download {transportLabel(result, "download")}; upload{" "}
          {transportLabel(result, "upload")}
        </dd>
        <dt className="text-muted-foreground">Workers</dt>
        <dd>
          Download {result.diagnostics.workersStarted.download}/
          {result.diagnostics.workersRequested.download}; upload{" "}
          {result.diagnostics.workersStarted.upload}/
          {result.diagnostics.workersRequested.upload}
        </dd>
        <dt className="text-muted-foreground">Fallbacks</dt>
        <dd>
          {result.diagnostics.fallbackReasons.length > 0
            ? result.diagnostics.fallbackReasons.join("; ")
            : "None"}
        </dd>
        <dt className="text-muted-foreground">Errors</dt>
        <dd>
          {errors.length > 0
            ? errors
                .map((error) =>
                  [error.phase, error.code, error.message].filter(Boolean).join(": "),
                )
                .join("; ")
            : "None"}
        </dd>
        <dt className="text-muted-foreground">Capabilities</dt>
        <dd>{JSON.stringify(result.diagnostics.capabilityReport)}</dd>
      </dl>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Phase</TableHead>
            <TableHead>Samples</TableHead>
            <TableHead>Windows</TableHead>
            <TableHead>Percentile</TableHead>
            <TableHead>Mbps</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(["download", "upload"] as const).map((phase) => {
            const throughput = result[phase];
            return (
              <TableRow key={phase}>
                <TableCell>{phase}</TableCell>
                <TableCell>
                  {throughput ? (throughput.samples?.length ?? "hidden") : "not run"}
                </TableCell>
                <TableCell>
                  {throughput ? (throughput.windows?.length ?? "hidden") : "not run"}
                </TableCell>
                <TableCell>
                  {throughput ? `p${throughput.percentile}` : "not run"}
                </TableCell>
                <TableCell>
                  {throughput
                    ? (throughput.bitsPerSecond / 1_000_000).toFixed(2)
                    : "not run"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <PhaseMath result={result} phase="download" />
      <PhaseMath result={result} phase="upload" />
    </div>
  );
}

function PhaseMath({
  result,
  phase,
}: {
  result: SpeedTestResult;
  phase: "download" | "upload";
}) {
  const throughput = result[phase];
  if (!throughput) {
    return null;
  }
  const samples = throughput.samples ?? [];
  const measuredWindows = throughput.windows?.filter((window) => !window.warmup) ?? [];
  return (
    <section
      className="phase-math flex min-w-0 flex-col gap-2"
      aria-label={`${phase} sample math`}
    >
      <h3 className="font-medium capitalize">{phase} sample math</h3>
      {samples.length > 0 ? (
        <>
          <SampleChart samples={samples} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Warmup</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Bytes</TableHead>
                <TableHead>Mbps</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {samples.map((sample, index) => (
                <TableRow key={`${phase}-sample-${sample.endedAtMs}-${index}`}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{sample.warmup ? "yes" : "no"}</TableCell>
                  <TableCell>{sample.durationMs.toFixed(0)} ms</TableCell>
                  <TableCell>{sample.bytes.toLocaleString()}</TableCell>
                  <TableCell>{mbps(sample.bitsPerSecond)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : (
        <p>Raw samples hidden by result.includeRawSamples.</p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Window</TableHead>
            <TableHead>Samples</TableHead>
            <TableHead>Warmup</TableHead>
            <TableHead>Average Mbps</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(throughput.windows ?? []).map((window) => (
            <TableRow key={`${phase}-window-${window.index}`}>
              <TableCell>{window.index + 1}</TableCell>
              <TableCell>{window.sampleCount}</TableCell>
              <TableCell>{window.warmup ? "yes" : "no"}</TableCell>
              <TableCell>{mbps(window.averageBitsPerSecond)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p>
        Final p{throughput.percentile} over {measuredWindows.length} measured windows:{" "}
        {mbps(throughput.bitsPerSecond)} Mbps.
      </p>
    </section>
  );
}

function mbps(bitsPerSecond: number): string {
  return (bitsPerSecond / 1_000_000).toFixed(2);
}

function transportLabel(result: SpeedTestResult, phase: "download" | "upload"): string {
  const requested = result.diagnostics.requestedTransports[phase];
  if (!requested) {
    return "not run";
  }
  return `${requested} -> ${result.diagnostics.actualTransports[phase] ?? "not run"}`;
}

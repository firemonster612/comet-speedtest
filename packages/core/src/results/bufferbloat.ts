import type {
  BufferbloatDirection,
  BufferbloatGrade,
  BufferbloatResult,
  LatencyResult,
} from "./resultTypes";

/**
 * Grade boundaries on latency *added* under load (ms), worst-direction.
 * Roughly the Waveform/DSLReports scale: added latency under load is what makes
 * a fast link feel slow on calls and games. Anything at or past the last
 * boundary is an F.
 */
const GRADE_BOUNDARIES: ReadonlyArray<{ grade: BufferbloatGrade; underMs: number }> = [
  { grade: "A", underMs: 30 },
  { grade: "B", underMs: 60 },
  { grade: "C", underMs: 100 },
  { grade: "D", underMs: 200 },
];

/**
 * Derive a bufferbloat grade from the idle and under-load latency buckets. Pure
 * — no network work; it only reads medians already computed by
 * {@link aggregateLatency}. Median (not mean) keeps a single spike from
 * dominating the grade. Returns `grade: null` when idle or loaded latency is
 * missing (e.g. latency disabled, or the run never reached a loaded phase).
 */
export function gradeBufferbloat(latency: {
  idle: LatencyResult | null;
  underDownloadLoad: LatencyResult | null;
  underUploadLoad: LatencyResult | null;
}): BufferbloatResult {
  const idleLatencyMs = latency.idle?.medianMs ?? null;
  const download = gradeDirection(
    idleLatencyMs,
    latency.underDownloadLoad?.medianMs ?? null,
  );
  const upload = gradeDirection(
    idleLatencyMs,
    latency.underUploadLoad?.medianMs ?? null,
  );
  // The overall reading is the worse-bloating direction: same idle baseline, so
  // the larger added latency is also the larger loaded latency.
  const worst = worstDirection(download, upload);
  return {
    idleLatencyMs,
    loadedLatencyMs: worst?.loadedLatencyMs ?? null,
    addedLatencyMs: worst?.addedLatencyMs ?? null,
    grade: worst?.grade ?? null,
    download,
    upload,
  };
}

function gradeDirection(
  idleLatencyMs: number | null,
  loadedLatencyMs: number | null,
): BufferbloatDirection | null {
  if (idleLatencyMs === null || loadedLatencyMs === null) {
    return null;
  }
  const addedLatencyMs = Math.max(0, loadedLatencyMs - idleLatencyMs);
  const grade =
    GRADE_BOUNDARIES.find((boundary) => addedLatencyMs < boundary.underMs)?.grade ??
    "F";
  return { loadedLatencyMs, addedLatencyMs, grade };
}

function worstDirection(
  a: BufferbloatDirection | null,
  b: BufferbloatDirection | null,
): BufferbloatDirection | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return a.addedLatencyMs >= b.addedLatencyMs ? a : b;
}

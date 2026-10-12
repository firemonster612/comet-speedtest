import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Runs from a package's prepack hook: fails the pack when `main`, `types` or any
// `exports` target is missing, so a tarball never ships entry points it lacks.

const packageRoot = process.cwd();
const manifest = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);
const entries = [
  manifest.main,
  manifest.types,
  ...exportTargets(manifest.exports),
].filter((entry) => typeof entry === "string");
const missing = [...new Set(entries)].filter(
  (entry) => !existsSync(resolve(packageRoot, entry)),
);

if (missing.length > 0) {
  console.error(`${manifest.name} is missing entry points: ${missing.join(", ")}`);
  process.exit(1);
}

function exportTargets(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(exportTargets);
}

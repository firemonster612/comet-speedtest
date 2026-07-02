import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const appDist = resolve(workspaceRoot, "apps/production/dist");
const bundledApp = resolve(packageRoot, "dist-app");

await rm(bundledApp, { force: true, recursive: true });
await cp(appDist, bundledApp, { recursive: true });

console.log(`Copied production app bundle to ${bundledApp}`);

import type { RuntimeConfig, ValidationIssue, ValidationResult } from "./runtimeConfig";
import {
  runtimeFieldSchema,
  runtimeSectionKeys,
  testSectionKeys,
  type TestSection,
  testFieldSchema,
} from "./schema";
import { isSpeedTestRunPhase, throughputRunPhases } from "./selection";

const rootFields = new Set([
  "$schema",
  "brand",
  "theme",
  "content",
  "targets",
  "targetProfiles",
  "targetSelection",
  "test",
  "result",
]);

const knownFields = new Map<string, Set<string>>([
  ["brand", new Set(runtimeSectionKeys("brand"))],
  [
    "theme",
    new Set([
      "colorScheme",
      "light",
      "dark",
      "primaryColor",
      "accentColor",
      "backgroundColor",
      "surfaceColor",
      "textColor",
      "mutedTextColor",
      "borderColor",
      "fontFamily",
      "radius",
    ]),
  ],
  [
    "theme.light",
    new Set([
      "primaryColor",
      "accentColor",
      "backgroundColor",
      "surfaceColor",
      "textColor",
      "mutedTextColor",
      "borderColor",
    ]),
  ],
  [
    "theme.dark",
    new Set([
      "primaryColor",
      "accentColor",
      "backgroundColor",
      "surfaceColor",
      "textColor",
      "mutedTextColor",
      "borderColor",
    ]),
  ],
  ["content", new Set(runtimeSectionKeys("content"))],
  ["targets", new Set(["download", "upload", "latency"])],
  ["targetSelection", new Set(["strategy", "targetId"])],
  ["test", new Set(["download", "upload", "sampling", "latency", "selection"])],
  // The per-field key lists for each test sub-section come from the schema.
  ["test.download", new Set(testSectionKeys("download"))],
  ["test.upload", new Set(testSectionKeys("upload"))],
  ["test.sampling", new Set(testSectionKeys("sampling"))],
  ["test.latency", new Set(testSectionKeys("latency"))],
  ["test.selection", new Set(["phases", "loadedLatency"])],
  ["test.selection.loadedLatency", new Set(throughputRunPhases)],
  ["result", new Set(runtimeSectionKeys("result"))],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataIssue(issues: ValidationIssue[], path: string, value: unknown): void {
  if (value !== undefined && !isRecord(value)) {
    issues.push({ path, message: "Expected an object.", severity: "error" });
  }
}

function numberIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (value === undefined) {
    return;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    issues.push({
      path,
      message: `Expected a finite number between ${min} and ${max}.`,
      severity: "error",
    });
  }
}

function integerIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    issues.push({
      path,
      message: `Expected an integer between ${min} and ${max}.`,
      severity: "error",
    });
  }
}

function stringIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  required = false,
): void {
  if (value === undefined) {
    if (required) {
      issues.push({ path, message: "Field is required.", severity: "error" });
    }
    return;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({
      path,
      message: "Expected a non-empty string.",
      severity: "error",
    });
  }
}

function optionalStringIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
): void {
  if (value !== undefined && typeof value !== "string") {
    issues.push({
      path,
      message: "Expected a string.",
      severity: "error",
    });
  }
}

function nullableStringIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
): void {
  if (value === undefined || value === null) {
    return;
  }
  optionalStringIssue(issues, path, value);
}

function booleanIssue(issues: ValidationIssue[], path: string, value: unknown): void {
  if (value !== undefined && typeof value !== "boolean") {
    issues.push({ path, message: "Expected a boolean.", severity: "error" });
  }
}

function nullableIntegerIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (value === undefined || value === null) {
    return;
  }
  integerIssue(issues, path, value, min, max);
}

function enumIssue<T extends string>(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  allowed: readonly T[],
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issues.push({
      path,
      message: `Expected one of: ${allowed.join(", ")}.`,
      severity: "error",
    });
  }
}

function phaseListIssue(issues: ValidationIssue[], path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({
      path,
      message:
        "Expected a non-empty array containing idle-latency, download, or upload.",
      severity: "error",
    });
    return;
  }
  const seen = new Set<string>();
  for (const [index, phase] of value.entries()) {
    if (!isSpeedTestRunPhase(phase)) {
      issues.push({
        path: `${path}.${index}`,
        message: "Expected one of: idle-latency, download, upload.",
        severity: "error",
      });
      continue;
    }
    if (seen.has(phase)) {
      issues.push({
        path: `${path}.${index}`,
        message: `Duplicate phase "${phase}".`,
        severity: "error",
      });
    }
    seen.add(phase);
  }
}

function loadedLatencyIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
): void {
  if (value === undefined || typeof value === "boolean") {
    return;
  }
  if (!isRecord(value)) {
    issues.push({
      path,
      message: "Expected a boolean or an object with download/upload booleans.",
      severity: "error",
    });
    return;
  }
  for (const phase of throughputRunPhases) {
    booleanIssue(issues, `${path}.${phase}`, value[phase]);
  }
}

export function validateConfig(config: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const unknownFields: string[] = [];

  if (!isRecord(config)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "Config must be an object.", severity: "error" }],
      unknownFields,
    };
  }

  for (const key of Object.keys(config)) {
    if (!rootFields.has(key)) {
      unknownFields.push(key);
    }
  }
  collectUnknownFields(config, "", unknownFields);

  const maybeConfig = config as Partial<RuntimeConfig>;

  for (const section of ["brand", "content", "result"] as const) {
    const sectionValue = maybeConfig[section];
    if (sectionValue !== undefined && !isRecord(sectionValue)) {
      issues.push({ path: section, message: "Expected an object.", severity: "error" });
    }
  }

  for (const field of runtimeFieldSchema) {
    const section = maybeConfig[field.section];
    const value = isRecord(section) ? section[field.key] : undefined;
    const path = `${field.section}.${field.key}`;
    switch (field.kind) {
      case "string":
        optionalStringIssue(issues, path, value);
        break;
      case "nullableString":
        nullableStringIssue(issues, path, value);
        break;
      case "boolean":
        booleanIssue(issues, path, value);
        break;
      case "object":
        metadataIssue(issues, path, value);
        break;
    }
  }

  if (isRecord(maybeConfig.theme)) {
    enumIssue(issues, "theme.colorScheme", maybeConfig.theme.colorScheme, [
      "light",
      "dark",
      "system",
    ]);
    themePaletteIssue(issues, "theme.light", maybeConfig.theme.light);
    themePaletteIssue(issues, "theme.dark", maybeConfig.theme.dark);
  } else if (maybeConfig.theme !== undefined) {
    issues.push({
      path: "theme",
      message: "Expected an object.",
      severity: "error",
    });
  }

  if (!isRecord(maybeConfig.targets)) {
    issues.push({
      path: "targets",
      message: "Targets object is required.",
      severity: "error",
    });
  } else {
    stringIssue(issues, "targets.download", maybeConfig.targets.download, true);
    stringIssue(issues, "targets.upload", maybeConfig.targets.upload, true);
    stringIssue(issues, "targets.latency", maybeConfig.targets.latency);
  }

  const profileIds = new Set<string>();
  if (maybeConfig.targetProfiles !== undefined) {
    if (!Array.isArray(maybeConfig.targetProfiles)) {
      issues.push({
        path: "targetProfiles",
        message: "Expected an array of target profiles.",
        severity: "error",
      });
    } else {
      for (const [index, profile] of maybeConfig.targetProfiles.entries()) {
        const path = `targetProfiles.${index}`;
        if (!isRecord(profile)) {
          issues.push({
            path,
            message: "Expected an object.",
            severity: "error",
          });
          continue;
        }
        for (const key of Object.keys(profile)) {
          if (!["id", "label", "metadata", "targets"].includes(key)) {
            unknownFields.push(`${path}.${key}`);
          }
        }
        stringIssue(issues, `${path}.id`, profile.id, true);
        stringIssue(issues, `${path}.label`, profile.label);
        metadataIssue(issues, `${path}.metadata`, profile.metadata);
        if (typeof profile.id === "string" && profile.id.trim()) {
          if (profileIds.has(profile.id)) {
            issues.push({
              path: `${path}.id`,
              message: `Duplicate target profile id "${profile.id}".`,
              severity: "error",
            });
          }
          profileIds.add(profile.id);
        }
        if (!isRecord(profile.targets)) {
          issues.push({
            path: `${path}.targets`,
            message: "Targets object is required.",
            severity: "error",
          });
        } else {
          for (const key of Object.keys(profile.targets)) {
            if (!["download", "upload", "latency"].includes(key)) {
              unknownFields.push(`${path}.targets.${key}`);
            }
          }
          stringIssue(
            issues,
            `${path}.targets.download`,
            profile.targets.download,
            true,
          );
          stringIssue(issues, `${path}.targets.upload`, profile.targets.upload, true);
          stringIssue(issues, `${path}.targets.latency`, profile.targets.latency);
        }
      }
    }
  }

  const targetSelection = maybeConfig.targetSelection;
  if (targetSelection !== undefined && targetSelection !== null) {
    if (!isRecord(targetSelection)) {
      issues.push({
        path: "targetSelection",
        message: "Expected an object or null.",
        severity: "error",
      });
    } else {
      enumIssue(issues, "targetSelection.strategy", targetSelection.strategy, [
        "lowest-latency",
        "forced",
      ]);
      stringIssue(issues, "targetSelection.targetId", targetSelection.targetId);
      if (
        targetSelection.strategy === "forced" &&
        targetSelection.targetId === undefined
      ) {
        issues.push({
          path: "targetSelection.targetId",
          message: "Forced target selection requires a targetId.",
          severity: "error",
        });
      }
      if (
        typeof targetSelection.targetId === "string" &&
        profileIds.size > 0 &&
        !profileIds.has(targetSelection.targetId)
      ) {
        issues.push({
          path: "targetSelection.targetId",
          message: `Target profile "${targetSelection.targetId}" does not exist.`,
          severity: "error",
        });
      }
    }
  }

  if (maybeConfig.test !== undefined && !isRecord(maybeConfig.test)) {
    issues.push({
      path: "test",
      message: "Expected an object.",
      severity: "error",
    });
  }

  const test = isRecord(maybeConfig.test) ? maybeConfig.test : undefined;
  for (const section of ["download", "upload", "sampling", "latency"] as const) {
    const value = test?.[section];
    if (value !== undefined && !isRecord(value)) {
      issues.push({
        path: `test.${section}`,
        message: "Expected an object.",
        severity: "error",
      });
    }
  }

  const sectionRecord = (section: TestSection): Record<string, unknown> | undefined =>
    isRecord(test?.[section]) ? test[section] : undefined;

  for (const field of testFieldSchema) {
    const value = sectionRecord(field.section)?.[field.key];
    const path = `test.${field.section}.${field.key}`;
    switch (field.kind) {
      case "integer":
        integerIssue(issues, path, value, field.min ?? 0, field.max ?? 0);
        break;
      case "number":
        numberIssue(issues, path, value, field.min ?? 0, field.max ?? 0);
        break;
      case "nullableInteger":
        nullableIntegerIssue(issues, path, value, field.min ?? 0, field.max ?? 0);
        break;
      case "boolean":
        booleanIssue(issues, path, value);
        break;
      case "enum":
        enumIssue(issues, path, value, field.allowed ?? []);
        break;
    }
  }

  const selection = test?.selection;
  if (selection !== undefined && !isRecord(selection)) {
    issues.push({
      path: "test.selection",
      message: "Expected an object.",
      severity: "error",
    });
  } else if (selection) {
    phaseListIssue(issues, "test.selection.phases", selection.phases);
    loadedLatencyIssue(issues, "test.selection.loadedLatency", selection.loadedLatency);
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
    unknownFields,
  };
}

function themePaletteIssue(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
): void {
  if (value !== undefined && !isRecord(value)) {
    issues.push({ path, message: "Expected an object.", severity: "error" });
  }
}

function collectUnknownFields(
  value: Record<string, unknown>,
  parentPath: string,
  unknownFields: string[],
): void {
  const allowed = parentPath === "" ? rootFields : knownFields.get(parentPath);
  for (const [key, child] of Object.entries(value)) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    if (allowed && !allowed.has(key) && !unknownFields.includes(path)) {
      unknownFields.push(path);
    }
    if (isRecord(child) && knownFields.has(path)) {
      collectUnknownFields(child, path, unknownFields);
    }
  }
}

import { configInvalidError } from "./configErrors";
import { defaultRuntimeConfig } from "./defaults";
import type {
  NormalizedTargetProfile,
  NormalizedTargetSelectionConfig,
  NormalizedTestSelectionConfig,
  NormalizedRuntimeTheme,
  NormalizedSpeedTestConfig,
  RuntimeConfig,
  RuntimeTheme,
  RuntimeThemePalette,
  RuntimeTargetSelectionConfig,
  RuntimeTargets,
} from "./runtimeConfig";
import { runtimeSectionKeys, testSectionKeys } from "./schema";
import { normalizeTestSelection } from "./selection";
import { validateConfig } from "./validateRuntimeConfig";

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function absoluteUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}

function normalizeTargets(
  targets: RuntimeTargets,
  baseUrl: string,
): Required<RuntimeTargets> {
  return {
    download: absoluteUrl(targets.download, baseUrl),
    upload: absoluteUrl(targets.upload, baseUrl),
    latency: absoluteUrl(targets.latency ?? targets.download, baseUrl),
  };
}

function normalizeTargetProfiles(
  config: RuntimeConfig,
  baseUrl: string,
): NormalizedTargetProfile[] {
  return (config.targetProfiles ?? []).map((profile) => ({
    id: profile.id,
    ...(profile.label ? { label: profile.label } : {}),
    ...(profile.metadata ? { metadata: profile.metadata } : {}),
    targets: normalizeTargets(profile.targets, baseUrl),
  }));
}

function normalizeTargetSelection(
  selection: RuntimeTargetSelectionConfig | null | undefined,
): NormalizedTargetSelectionConfig | null {
  if (!selection) {
    return null;
  }
  return {
    strategy: selection.strategy ?? "lowest-latency",
    ...(selection.targetId ? { targetId: selection.targetId } : {}),
  };
}

function pickKnown(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    keys.flatMap((key) => (key in record ? [[key, record[key]]] : [])),
  );
}

const themePaletteKeys = [
  "primaryColor",
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textColor",
  "mutedTextColor",
  "borderColor",
] as const;

function pickThemePalette(value: unknown): Partial<RuntimeThemePalette> {
  return pickKnown(value, themePaletteKeys) as Partial<RuntimeThemePalette>;
}

function normalizeTheme(
  theme: RuntimeTheme | undefined,
  defaults: NormalizedRuntimeTheme,
): NormalizedRuntimeTheme {
  const legacyPalette = pickThemePalette(theme);
  const legacyDarkBrand: Partial<RuntimeThemePalette> = {};
  if (legacyPalette.primaryColor) {
    legacyDarkBrand.primaryColor = legacyPalette.primaryColor;
  }
  if (legacyPalette.accentColor) {
    legacyDarkBrand.accentColor = legacyPalette.accentColor;
  }

  return {
    colorScheme: theme?.colorScheme ?? defaults.colorScheme,
    light: {
      ...defaults.light,
      ...legacyPalette,
      ...pickThemePalette(theme?.light),
    },
    dark: {
      ...defaults.dark,
      ...legacyDarkBrand,
      ...pickThemePalette(theme?.dark),
    },
    fontFamily: theme?.fontFamily ?? defaults.fontFamily,
    radius: theme?.radius ?? defaults.radius,
  };
}

export function normalizeConfig(
  config: RuntimeConfig,
  options: { source?: string; baseUrl?: string; strict?: boolean } = {},
): NormalizedSpeedTestConfig {
  const validation = validateConfig(config);
  if (
    !validation.ok ||
    (options.strict === true && validation.unknownFields.length > 0)
  ) {
    throw configInvalidError(validation.issues, validation.unknownFields);
  }

  const defaults = defaultRuntimeConfig;
  const baseUrl =
    options.baseUrl ??
    (typeof location === "undefined" ? "http://localhost/" : location.href);
  const normalizedWithoutDiagnostics = {
    brand: {
      ...defaults.brand,
      ...pickKnown(config.brand, runtimeSectionKeys("brand")),
    },
    theme: normalizeTheme(config.theme, defaults.theme as NormalizedRuntimeTheme),
    content: {
      ...defaults.content,
      ...pickKnown(config.content, runtimeSectionKeys("content")),
    },
    targets: normalizeTargets(config.targets, baseUrl),
    targetProfiles: normalizeTargetProfiles(config, baseUrl),
    targetSelection: normalizeTargetSelection(config.targetSelection),
    test: {
      download: {
        ...defaults.test?.download,
        ...pickKnown(config.test?.download, testSectionKeys("download")),
      },
      upload: {
        ...defaults.test?.upload,
        ...pickKnown(config.test?.upload, testSectionKeys("upload")),
      },
      sampling: {
        ...defaults.test?.sampling,
        ...pickKnown(config.test?.sampling, testSectionKeys("sampling")),
      },
      latency: {
        ...defaults.test?.latency,
        ...pickKnown(config.test?.latency, testSectionKeys("latency")),
      },
      selection: normalizeTestSelection(
        pickKnown(config.test?.selection, ["phases", "loadedLatency"]),
        defaults.test?.selection as NormalizedTestSelectionConfig,
      ),
    },
    result: {
      ...defaults.result,
      ...pickKnown(config.result, runtimeSectionKeys("result")),
      submitUrl: config.result?.submitUrl
        ? absoluteUrl(config.result.submitUrl, baseUrl)
        : (config.result?.submitUrl ?? defaults.result?.submitUrl ?? null),
    },
  };

  const configHash = fnv1a(stableStringify(normalizedWithoutDiagnostics));
  return deepFreeze({
    ...normalizedWithoutDiagnostics,
    diagnostics: {
      source: options.source ?? "object",
      configHash,
      unknownFields: validation.unknownFields,
      normalizedAt: new Date().toISOString(),
    },
  } as NormalizedSpeedTestConfig);
}

export function normalizeConfigWithTargets(
  config: NormalizedSpeedTestConfig,
  targets: RuntimeTargets,
  options: { baseUrl?: string } = {},
): NormalizedSpeedTestConfig {
  return normalizeConfig(
    {
      brand: config.brand,
      theme: config.theme,
      content: config.content,
      targets,
      targetProfiles: config.targetProfiles,
      targetSelection: config.targetSelection,
      test: config.test,
      result: config.result,
    },
    {
      source: config.diagnostics.source,
      baseUrl:
        options.baseUrl ??
        (typeof location === "undefined" ? "http://localhost/" : location.href),
    },
  );
}

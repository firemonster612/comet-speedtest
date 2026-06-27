import type {
  ColorScheme,
  RuntimeConfig,
  RuntimeThemePalette,
} from "@lightspeed/config";
import { defaultRuntimeConfig } from "@lightspeed/config";
import { Input } from "@lightspeed/ui/components/ui/input";
import { Moon, Sun } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { type ConfigUpdater, Field, Panel, SelectField } from "./shared";

/**
 * Which palette the live preview renders. `"config"` follows the production
 * `colorScheme` saved in the draft; `"light"`/`"dark"` force a scheme so both
 * palettes can be inspected without changing what deployed apps would use. This
 * is playground-only state; it never touches the exported config.
 */
export type PreviewScheme = "config" | "light" | "dark";

type PaletteName = "light" | "dark";
type PaletteTokenKey = keyof RuntimeThemePalette;

const PALETTE_TOKENS: ReadonlyArray<{ key: PaletteTokenKey; label: string }> = [
  { key: "primaryColor", label: "Primary" },
  { key: "accentColor", label: "Accent" },
  { key: "backgroundColor", label: "Background" },
  { key: "surfaceColor", label: "Surface" },
  { key: "textColor", label: "Text" },
  { key: "mutedTextColor", label: "Muted text" },
  { key: "borderColor", label: "Border" },
];

const PRODUCTION_SCHEME_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

const PREVIEW_SCHEME_OPTIONS = [
  { label: "Follow config", value: "config" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

export function ThemePanel({
  config,
  onUpdate,
  previewScheme,
  onPreviewSchemeChange,
}: {
  config: RuntimeConfig;
  onUpdate: ConfigUpdater;
  previewScheme: PreviewScheme;
  onPreviewSchemeChange: (scheme: PreviewScheme) => void;
}) {
  return (
    <div className="flex flex-col gap-7">
      <Section title="Brand & copy">
        <Panel>
          <TextField
            area="brand"
            configKey="name"
            label="Brand name"
            value={config.brand?.name ?? ""}
            onUpdate={onUpdate}
          />
          <TextField
            area="brand"
            configKey="logoUrl"
            label="Logo URL"
            value={config.brand?.logoUrl ?? ""}
            onUpdate={onUpdate}
          />
          <TextField
            area="brand"
            configKey="serverLabel"
            label="Server label"
            value={config.brand?.serverLabel ?? ""}
            onUpdate={onUpdate}
          />
          <TextField
            area="content"
            configKey="title"
            label="Title"
            value={config.content?.title ?? ""}
            onUpdate={onUpdate}
          />
          <TextField
            area="content"
            configKey="startLabel"
            label="Start label"
            value={config.content?.startLabel ?? ""}
            onUpdate={onUpdate}
          />
        </Panel>
      </Section>

      <Section title="Color scheme">
        <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Production scheme"
              options={PRODUCTION_SCHEME_OPTIONS}
              value={config.theme?.colorScheme ?? "system"}
              onValueChange={(scheme) =>
                onUpdate((draft) => ({
                  ...draft,
                  theme: { ...draft.theme, colorScheme: scheme as ColorScheme },
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Saved to config; "System" follows the visitor's OS.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Preview scheme"
              options={PREVIEW_SCHEME_OPTIONS}
              value={previewScheme}
              onValueChange={(scheme) => onPreviewSchemeChange(scheme as PreviewScheme)}
            />
            <p className="text-xs text-muted-foreground">
              Playground only; force the live preview without changing the config.
            </p>
          </div>
        </div>
      </Section>

      <Section
        hint="Edit every token for both palettes. Swatches preview each palette regardless of the scheme above."
        title="Palettes"
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 max-md:grid-cols-1">
          <PaletteEditor config={config} name="light" onUpdate={onUpdate} />
          <PaletteEditor config={config} name="dark" onUpdate={onUpdate} />
        </div>
      </Section>

      <Section title="Typography">
        <Panel>
          <TextField
            area="theme"
            configKey="fontFamily"
            label="Font family"
            value={config.theme?.fontFamily ?? ""}
            onUpdate={onUpdate}
          />
          <TextField
            area="theme"
            configKey="radius"
            label="Radius"
            value={config.theme?.radius ?? "8px"}
            onUpdate={onUpdate}
          />
        </Panel>
      </Section>
    </div>
  );
}

/** A labeled stack of fields. Flat by design; the bench supplies the card. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function PaletteEditor({
  config,
  name,
  onUpdate,
}: {
  config: RuntimeConfig;
  name: PaletteName;
  onUpdate: ConfigUpdater;
}) {
  const palette = config.theme?.[name];
  const Icon = name === "light" ? Sun : Moon;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold capitalize">{name}</span>
        <div className="ml-auto flex items-center gap-1">
          {PALETTE_TOKENS.map((token) => {
            const value = paletteColor(palette, name, token.key);
            return (
              <span
                aria-hidden="true"
                className="size-4 rounded-[3px] border border-border/70"
                key={token.key}
                style={{ backgroundColor: value }}
                title={`${token.label}: ${value}`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {PALETTE_TOKENS.map((token) => (
          <ColorTokenRow
            key={token.key}
            label={token.label}
            name={name}
            value={paletteColor(palette, name, token.key)}
            onCommit={(value) => setPaletteColor(onUpdate, name, token.key, value)}
          />
        ))}
      </div>
    </div>
  );
}

function ColorTokenRow({
  label,
  name,
  value,
  onCommit,
}: {
  label: string;
  name: PaletteName;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function commitText(): void {
    const normalized = normalizeHex(text);
    if (normalized) {
      onCommit(normalized);
    } else {
      setText(value);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <Input
        aria-label={`${name} ${label} color picker`}
        className="h-8 w-9 shrink-0 cursor-pointer p-1"
        type="color"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      />
      <Input
        aria-label={`${name} ${label} hex`}
        className="h-8 flex-1 font-mono text-xs uppercase"
        spellCheck={false}
        value={text}
        onBlur={commitText}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function TextField({
  label,
  area,
  configKey,
  value,
  onUpdate,
}: {
  label: string;
  area: "brand" | "theme" | "content";
  configKey: string;
  value: string;
  onUpdate: ConfigUpdater;
}) {
  return (
    <Field label={label}>
      <Input
        value={value}
        onChange={(event) =>
          onUpdate((draft) => ({
            ...draft,
            [area]: { ...draft[area], [configKey]: event.target.value },
          }))
        }
      />
    </Field>
  );
}

function setPaletteColor(
  onUpdate: ConfigUpdater,
  name: PaletteName,
  key: PaletteTokenKey,
  value: string,
): void {
  onUpdate((draft) => ({
    ...draft,
    theme: {
      ...draft.theme,
      [name]: { ...draft.theme?.[name], [key]: value },
    },
  }));
}

/** Read a token, falling back to the shipped default palette then black. */
function paletteColor(
  palette: RuntimeThemePalette | undefined,
  name: PaletteName,
  key: PaletteTokenKey,
): string {
  return palette?.[key] ?? defaultRuntimeConfig.theme?.[name]?.[key] ?? "#000000";
}

/** Coerce loose hex input (`abc`, `#AABBCC`, `aabbcc`) to `#rrggbb`, else null. */
function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase()}`;
  }
  return null;
}

import type { RuntimeConfig, TestFieldSpec } from "@comet-speedtest/config";
import { testFieldDefault } from "@comet-speedtest/config";
import { Input } from "@comet-speedtest/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comet-speedtest/ui/components/ui/select";
import { Switch } from "@comet-speedtest/ui/components/ui/switch";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export type ConfigUpdater = (mutator: (config: RuntimeConfig) => RuntimeConfig) => void;

/**
 * The field deck for a configuration section. Renders flat — the surrounding
 * console "bench" already supplies the surface and the section heading, so a
 * card here would nest cards (forbidden by the design system). Just the dense,
 * responsive two-column field grid.
 */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-5 max-md:grid-cols-1">
      {children}
    </div>
  );
}

/** Labeled wrapping label — keeps the input/textarea associated for getByLabel. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Labeled control without label-wrapping, for Select/Switch triggers. */
export function ControlField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function SwitchField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm font-medium">
      <span className="text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="text-muted-foreground" id={labelId}>
        {label}
      </span>
      <Select
        items={options as Array<{ value: string; label: string }>}
        value={value}
        onValueChange={(next) => onValueChange(String(next))}
      >
        <SelectTrigger aria-labelledby={labelId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function numberValue(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readTestValue(config: RuntimeConfig, spec: TestFieldSpec): unknown {
  const section = (config.test as Record<string, unknown> | undefined)?.[spec.section];
  return (section as Record<string, unknown> | undefined)?.[spec.key];
}

function setTestValue(
  onUpdate: ConfigUpdater,
  spec: TestFieldSpec,
  value: unknown,
): void {
  onUpdate((draft) => ({
    ...draft,
    test: {
      ...draft.test,
      [spec.section]: {
        ...(draft.test?.[spec.section] as Record<string, unknown> | undefined),
        [spec.key]: value,
      },
    },
  }));
}

/**
 * Renders a single tunable `test` field straight from its schema entry, using
 * shadcn controls. Range, step, label, control type, and default value all come
 * from the spec, so panels never re-declare them and cannot drift from validation.
 */
export function SchemaField({
  spec,
  config,
  onUpdate,
}: {
  spec: TestFieldSpec;
  config: RuntimeConfig;
  onUpdate: ConfigUpdater;
}) {
  const current = readTestValue(config, spec);
  const fallback = testFieldDefault(spec);

  if (spec.kind === "boolean") {
    return (
      <SwitchField
        checked={(current ?? fallback) === true}
        label={spec.label}
        onCheckedChange={(checked) => setTestValue(onUpdate, spec, checked)}
      />
    );
  }

  if (spec.kind === "enum") {
    return (
      <SelectField
        label={spec.label}
        options={(spec.allowed ?? []).map((option) => ({
          label: option,
          value: option,
        }))}
        value={String(current ?? fallback ?? "")}
        onValueChange={(next) => setTestValue(onUpdate, spec, next)}
      />
    );
  }

  const nullable = spec.kind === "nullableInteger";
  return (
    <DeferredNumberField
      current={current}
      fallback={fallback}
      nullable={nullable}
      onCommit={(value) => setTestValue(onUpdate, spec, value)}
      spec={spec}
    />
  );
}

function DeferredNumberField({
  spec,
  current,
  fallback,
  nullable,
  onCommit,
}: {
  spec: TestFieldSpec;
  current: unknown;
  fallback: ReturnType<typeof testFieldDefault>;
  nullable: boolean;
  onCommit: (value: number | null) => void;
}) {
  const committedText = useMemo(
    () => numberFieldText(current, fallback, nullable),
    [current, fallback, nullable],
  );
  const [draftText, setDraftText] = useState(committedText);
  const skipNextCommitRef = useRef(false);

  useEffect(() => {
    setDraftText(committedText);
  }, [committedText]);

  function commit(): void {
    if (skipNextCommitRef.current) {
      skipNextCommitRef.current = false;
      return;
    }
    const parsed = numberValue(draftText);
    if (parsed === undefined) {
      if (nullable && draftText.trim() === "") {
        onCommit(null);
        return;
      }
      setDraftText(committedText);
      return;
    }
    onCommit(parsed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      skipNextCommitRef.current = true;
      setDraftText(committedText);
      event.currentTarget.blur();
    }
  }

  return (
    <Field label={spec.label}>
      <Input
        aria-valuemax={spec.max}
        aria-valuemin={spec.min}
        inputMode={spec.kind === "number" ? "decimal" : "numeric"}
        max={spec.max}
        min={spec.min}
        step={spec.step}
        type="number"
        value={draftText}
        onBlur={commit}
        onChange={(event) => setDraftText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </Field>
  );
}

function numberFieldText(
  current: unknown,
  fallback: ReturnType<typeof testFieldDefault>,
  nullable: boolean,
): string {
  if (typeof current === "number" && Number.isFinite(current)) {
    return String(current);
  }
  if (nullable) {
    return "";
  }
  return typeof fallback === "number" && Number.isFinite(fallback)
    ? String(fallback)
    : "";
}

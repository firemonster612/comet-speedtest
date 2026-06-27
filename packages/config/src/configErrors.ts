import type { ValidationIssue } from "./runtimeConfig";

export type RuntimeConfigErrorCode = "config-load-failed" | "config-invalid";

export class RuntimeConfigError extends Error {
  readonly code: RuntimeConfigErrorCode;
  readonly recoverable = true;
  readonly diagnostics?: Record<string, unknown>;

  constructor(
    code: RuntimeConfigErrorCode,
    message: string,
    options: { cause?: unknown; diagnostics?: Record<string, unknown> } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "RuntimeConfigError";
    this.code = code;
    if (options.diagnostics) {
      this.diagnostics = options.diagnostics;
    }
  }
}

export function configInvalidError(
  issues: ValidationIssue[],
  unknownFields: string[],
): RuntimeConfigError {
  const issueText = issues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .concat(unknownFields.map((field) => `${field}: Unknown field.`))
    .join(" ");
  return new RuntimeConfigError(
    "config-invalid",
    issueText || "Invalid Lightspeed config.",
    {
      diagnostics: {
        validation: {
          issues,
          unknownFields,
        },
      },
    },
  );
}

import "server-only";
import { randomUUID } from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const REDACTED = "[REDACTED]";

const SENSITIVE_SUBSTRINGS = [
  "password",
  "reauthpassword",
  "secret",
  "token",
  "signedurl",
  "signed_url",
  "authorization",
] as const;

function isSensitiveField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  if (lower === "key") {
    return true;
  }
  if (SENSITIVE_SUBSTRINGS.some((part) => lower.includes(part))) {
    return true;
  }
  return /^(?:api|auth|access|private|public|signing|encryption|master)_?key$/i.test(
    lower
  );
}

function scrubValue(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (depth > 8) {
    return "[TRUNCATED]";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, seen, depth + 1));
  }

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };
    if (process.env.NODE_ENV !== "production" && value.stack) {
      out.stack = value.stack;
    }
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveField(k) ? REDACTED : scrubValue(v, seen, depth + 1);
    }
    return out;
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    scrubbed[k] = isSensitiveField(k) ? REDACTED : scrubValue(v, seen, depth + 1);
  }
  return scrubbed;
}

function emitLog(level: LogLevel, message: string, context?: LogContext): void {
  const seen = new WeakSet<object>();
  const scrubbedContext = context
    ? (scrubValue(context, seen) as Record<string, unknown>)
    : {};

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...scrubbedContext,
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function logInfo(message: string, context?: LogContext): void {
  emitLog("info", message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  emitLog("warn", message, context);
}

export function logError(
  message: string,
  contextOrError?: LogContext | unknown,
  extraContext?: LogContext
): void {
  let mergedContext: LogContext | undefined;

  if (
    contextOrError !== undefined &&
    typeof contextOrError === "object" &&
    contextOrError !== null &&
    !(contextOrError instanceof Error) &&
    !Array.isArray(contextOrError)
  ) {
    mergedContext = {
      ...(contextOrError as LogContext),
      ...(extraContext ?? {}),
    };
  } else if (contextOrError !== undefined || extraContext !== undefined) {
    mergedContext = {
      ...(extraContext ?? {}),
      ...(contextOrError !== undefined ? { error: contextOrError } : {}),
    };
  }

  emitLog("error", message, mergedContext);
}

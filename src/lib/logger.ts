// Lightweight structured logger. We don't pull in winston/pino (no new
// dependencies without network access to install them, and the JSON-lines
// pattern they provide is trivial to hand-roll for this project's scale).
//
// Every log line is a single JSON object on stdout — easy to grep, easy to
// pipe into a real log aggregator later without changing this file.

type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function emit(level: LogLevel, event: string, fields: LogFields = {}) {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  const serialized = JSON.stringify(line);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(serialized);
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(serialized);
  } else {
    // eslint-disable-next-line no-console
    console.log(serialized);
  }
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};

// Correlation IDs let us trace "one upload -> one job -> N grading tasks"
// through the logs. crypto.randomUUID is available in the Node runtime
// Next.js API routes run on, so no extra dependency is needed.
export function newCorrelationId(): string {
  return crypto.randomUUID();
}

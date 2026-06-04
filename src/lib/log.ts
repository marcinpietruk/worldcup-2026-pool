// Minimal structured logger. Emits one JSON line per event (timestamp, level,
// event name, and arbitrary fields) — greppable locally and parseable by hosting
// log viewers (Vercel, etc.). Replaces scattered console.error calls.
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, event: string, fields?: Fields): void {
  const entry = { ts: new Date().toISOString(), level, event, ...fields };
  const line = JSON.stringify(entry, (_k, v) => (v instanceof Error ? v.message : v));
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};

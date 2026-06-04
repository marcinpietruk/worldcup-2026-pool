import { log } from "./log";

// Small helpers to keep route handlers terse.
export function ok(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function bad(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function serverError(e: unknown): Response {
  const message = e instanceof Error ? e.message : "Unexpected error";
  log.error("http.server_error", { message });
  return Response.json({ error: message }, { status: 500 });
}

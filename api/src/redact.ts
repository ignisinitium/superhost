// Redact sensitive fields from objects before returning them over the API.
// Mirrors worker/src/sanitize.ts SENSITIVE_KEYS — task payloads can carry SSH
// credentials and passwords, and tasks are readable via GET /api/tasks/:id, so
// secrets must never leave the API even for not-yet-processed (pending) tasks.
export const SENSITIVE_KEYS = new Set([
  'password', 'dbPassword', 'adminPassword', 'dbPass', 'token',
  'secret', 'apiKey', 'api_key', 'webhook_secret', 'private_key',
  'sshPassword', 'sshKey', 'passwordHash',
]);

export function redactPayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload;
  if (Array.isArray(payload)) return payload.map(redactPayload);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key) ? '[REDACTED]' : redactPayload(value);
  }
  return result;
}

// Redact the `payload` field of a task row (leaves other columns intact).
export function redactTask<T extends { payload?: unknown }>(row: T): T {
  if (row && typeof row === 'object' && 'payload' in row) {
    return { ...row, payload: redactPayload(row.payload) };
  }
  return row;
}

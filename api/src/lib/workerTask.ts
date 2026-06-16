import { query } from '../db.js';

interface RunOpts {
  timeoutMs?: number;
  pollMs?: number;
}

/**
 * Queue a worker task and wait for it to finish, returning the `result` object
 * the worker wrote back into the task payload.
 *
 * Used for read-style tasks (e.g. fetching a quarantined message off disk) where
 * the caller needs the answer within the same HTTP request. The `/api/tasks`
 * endpoint is admin-only, so client/mail-user routes can't poll task status from
 * the browser — resolving the task server-side keeps those routes self-contained.
 *
 * The worker is nudged via NOTIFY so it picks the task up immediately; the 5s
 * polling fallback in the worker is the backstop if the notification is missed.
 */
export async function runWorkerTask<T = unknown>(
  command: string,
  payload: Record<string, unknown>,
  opts: RunOpts = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const pollMs = opts.pollMs ?? 200;

  const ins = await query(
    'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id, command, payload, status, created_at',
    [command, JSON.stringify(payload)],
  );
  const task = ins.rows[0];

  try {
    await query('SELECT pg_notify($1, $2)', ['new_task', JSON.stringify(task)]);
  } catch {
    /* worker polling fallback will still pick it up */
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollMs));
    const r = await query('SELECT status, payload, error_message FROM tasks WHERE id = $1', [task.id]);
    const row = r.rows[0];
    if (!row) throw new Error('Task record disappeared');
    if (row.status === 'completed') {
      return (row.payload?.result ?? null) as T;
    }
    if (row.status === 'failed') {
      throw new Error(row.error_message || 'Worker task failed');
    }
  }
  throw new Error('Timed out waiting for the worker to process the request');
}

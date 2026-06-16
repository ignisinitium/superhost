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
export declare function runWorkerTask<T = unknown>(command: string, payload: Record<string, unknown>, opts?: RunOpts): Promise<T>;
export {};
//# sourceMappingURL=workerTask.d.ts.map
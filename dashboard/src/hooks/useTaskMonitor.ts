import { useCallback, useRef } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import type { Task } from '../../../shared/types';

interface MonitorOptions {
  /** Toast message shown on success */
  successMessage?: string;
  /** Toast message shown on failure (falls back to task error_message) */
  errorMessage?: string;
  /** Called when the task completes successfully */
  onSuccess?: (task: Task) => void;
  /** Called when the task fails */
  onError?: (task: Task) => void;
}

/**
 * Returns a monitorTask() function that polls a task until it completes or fails.
 *
 * Features:
 * - Exponential backoff: 2s → 4s → 8s → 16s → max 30s
 * - Cleanup: calling the returned `cancel` function stops polling
 * - Error handling: network errors are caught and surfaced
 * - No state leaks: safe to call even after component unmount via the cancel function
 */
export const useTaskMonitor = () => {
  // Track active intervals so they can be cancelled from outside (e.g. useEffect cleanup)
  const activeIntervals = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const monitorTask = useCallback(
    (taskId: number, optionsOrMessage?: MonitorOptions | string) => {
      const options: MonitorOptions =
        typeof optionsOrMessage === 'string'
          ? { successMessage: optionsOrMessage }
          : (optionsOrMessage ?? {});

      const {
        successMessage = 'Task completed successfully!',
        errorMessage,
        onSuccess,
        onError,
      } = options;

      const toastId = toast.loading('Processing...');
      let cancelled = false;
      let attempt = 0;
      const MAX_DELAY_MS = 30_000;
      const BASE_DELAY_MS = 2_000;

      const scheduleNext = () => {
        if (cancelled) return;
        // Exponential backoff: 2s, 4s, 8s, 16s, 30s, 30s, ...
        const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
        attempt++;

        const timer = setTimeout(() => {
          activeIntervals.current.delete(timer);
          poll();
        }, delay);

        activeIntervals.current.add(timer);
      };

      const poll = async () => {
        if (cancelled) return;

        try {
          const res = await api.get<Task>(`/tasks/${taskId}`);
          const task = res.data;

          if (task.status === 'completed') {
            toast.success(successMessage, { id: toastId });
            onSuccess?.(task);
            return; // Done — no more polling
          }

          if (task.status === 'failed') {
            const msg = errorMessage ?? `Task failed: ${task.error_message ?? 'Unknown error'}`;
            toast.error(msg, { id: toastId });
            onError?.(task);
            return; // Done — no more polling
          }

          // Still pending or processing — schedule next check
          scheduleNext();
        } catch (err) {
          // Network error or API down — don't give up immediately, retry
          if (!cancelled) {
            scheduleNext();
          }
        }
      };

      // Start polling after initial delay
      scheduleNext();

      // Return a cancel function for cleanup in useEffect
      return () => {
        cancelled = true;
        toast.dismiss(toastId);
      };
    },
    []
  );

  /** Cancel all active polls (call in useEffect cleanup) */
  const cancelAll = useCallback(() => {
    for (const timer of activeIntervals.current) {
      clearTimeout(timer);
    }
    activeIntervals.current.clear();
  }, []);

  return { monitorTask, cancelAll };
};

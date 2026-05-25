import api from '../api/client';
import toast from 'react-hot-toast';
import type { Task } from '../../../shared/types';

export const useTaskMonitor = () => {
  const monitorTask = (taskId: number, successMessage: string = 'Task completed successfully!') => {
    const toastId = toast.loading('Processing background task...');
    
    const checkStatus = async () => {
      try {
        const res = await api.get(`/tasks/${taskId}`);
        const task: Task = res.data;

        if (task.status === 'completed') {
          toast.success(successMessage, { id: toastId });
          return true;
        } else if (task.status === 'failed') {
          toast.error(`Task failed: ${task.error_message}`, { id: toastId });
          return true;
        }
        return false;
      } catch (err) {
        toast.error('Failed to check task status', { id: toastId });
        return true;
      }
    };

    const interval = setInterval(async () => {
      const isDone = await checkStatus();
      if (isDone) clearInterval(interval);
    }, 2000);
  };

  return { monitorTask };
};

import { useCallback, useRef } from 'react';
import { useToastStore } from '../toastStore';
import { apiFetch } from '../services/apiFetch';
import { useTranslation } from '../i18n/useTranslation';

interface UndoDeleteOptions {
  /** Human-readable label, e.g. "Supplier 'Nordic Dairy'" */
  label: string;
  /** Optimistically remove the item from Zustand state */
  removeFromState: () => void;
  /** Restore the item back to Zustand state */
  restoreToState: () => void;
  /** The API endpoint to DELETE, e.g. '/api/suppliers/abc123'. Ignored if apiDelete is provided. */
  apiEndpoint?: string;
  /** Custom async delete function (for bulk deletes). If provided, apiEndpoint is ignored. */
  apiDelete?: () => Promise<void>;
}

/**
 * Hook that provides an `undoableDelete` function.
 * Removes item from state immediately, shows a toast with Undo,
 * and schedules the real API call after 5 seconds.
 */
export function useUndoDelete() {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const removeToast = useToastStore((s) => s.removeToast);
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const undoableDelete = useCallback((opts: UndoDeleteOptions) => {
    const { label, removeFromState, restoreToState, apiEndpoint, apiDelete } = opts;

    // Optimistically remove from UI
    removeFromState();

    let cancelled = false;

    const toastId = addToast({
      message: t('toast.deleted', { label }),
      type: 'info',
      duration: 5500,
      action: {
        label: 'Undo',
        onClick: () => {
          cancelled = true;
          const timer = pendingTimers.current.get(toastId);
          if (timer) { clearTimeout(timer); pendingTimers.current.delete(toastId); }
          restoreToState();
        },
      },
    });

    const timer = setTimeout(async () => {
      pendingTimers.current.delete(toastId);
      if (cancelled) return;
      try {
        if (apiDelete) {
          await apiDelete();
        } else if (apiEndpoint) {
          await apiFetch(apiEndpoint, { method: 'DELETE' });
        }
      } catch (err: any) {
        // API call failed — restore item and show error
        restoreToState();
        addToast({ message: t('toast.failedDelete', { error: err?.message || 'Unknown error' }), type: 'error', duration: 5000 });
      }
    }, 5000);

    pendingTimers.current.set(toastId, timer);
  }, [addToast, removeToast, t]);

  return undoableDelete;
}

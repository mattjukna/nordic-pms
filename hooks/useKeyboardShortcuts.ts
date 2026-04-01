import { useEffect } from 'react';

/**
 * Registers Ctrl+S (save) and Escape keyboard shortcuts for a component.
 * Only fires when the component is mounted (i.e., active tab).
 */
export function useKeyboardShortcuts(opts: {
  onSave?: () => void;
  onEscape?: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S → save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        opts.onSave?.();
      }
      // Escape → cancel / close
      if (e.key === 'Escape') {
        opts.onEscape?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [opts.onSave, opts.onEscape]);
}

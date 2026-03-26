export type SessionEvent = {
  level: 'info' | 'warning' | 'error';
  message: string;
};

const STORAGE_KEY = 'nordic-pms-session-event';
const listeners = new Set<(event: SessionEvent) => void>();

export function emitSessionEvent(event: SessionEvent) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(event));
  } catch {
    // Ignore storage failures.
  }

  listeners.forEach((listener) => listener(event));
}

export function readSessionEvent(): SessionEvent | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionEvent) : null;
  } catch {
    return null;
  }
}

export function clearSessionEvent() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function subscribeSessionEvent(listener: (event: SessionEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

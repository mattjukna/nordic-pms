const STORAGE_KEY = 'nordic-pms-session-event';
const listeners = new Set();
export function emitSessionEvent(event) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(event));
    }
    catch {
        // Ignore storage failures.
    }
    listeners.forEach((listener) => listener(event));
}
export function readSessionEvent() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function clearSessionEvent() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    }
    catch {
        // Ignore storage failures.
    }
}
export function subscribeSessionEvent(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

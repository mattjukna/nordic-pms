export function loadDraft(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function saveDraft(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    }
    catch {
        // Ignore storage failures.
    }
}
export function clearDraft(key) {
    try {
        localStorage.removeItem(key);
    }
    catch {
        // Ignore storage failures.
    }
}

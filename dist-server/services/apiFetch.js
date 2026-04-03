import { getAccessToken } from '../auth/useAccessToken';
import { emitSessionEvent } from './sessionEvents';
export class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}
async function readResponseBody(res) {
    return res.text().catch(() => '');
}
export async function apiFetch(input, init) {
    const headers = { 'Content-Type': 'application/json', ...(init?.headers || {}) };
    const send = async (token) => fetch(input, { ...init, headers: { ...headers, Authorization: `Bearer ${token}` } });
    let token;
    try {
        token = await getAccessToken({ interactive: false });
    }
    catch (e) {
        throw new AuthError(e?.message || 'Authentication required');
    }
    let res = await send(token);
    let bodyText = await readResponseBody(res);
    if (res.status === 401 || res.status === 403) {
        emitSessionEvent({ level: 'warning', message: 'Session check failed. Retrying once before redirecting to sign-in.' });
        token = await getAccessToken({ forceRefresh: true, interactive: false });
        res = await send(token);
        bodyText = await readResponseBody(res);
    }
    if (res.status === 401 || res.status === 403) {
        emitSessionEvent({ level: 'error', message: 'Session expired. Sign-in is required to continue.' });
        void getAccessToken({ forceRefresh: true, interactive: true }).catch(() => undefined);
        throw new AuthError(`API ${res.status} ${res.statusText}: ${bodyText}`);
    }
    if (!res.ok) {
        throw new Error(`API ${res.status} ${res.statusText}: ${bodyText}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        try {
            return JSON.parse(bodyText || '{}');
        }
        catch {
            return bodyText;
        }
    }
    return bodyText;
}
export default apiFetch;

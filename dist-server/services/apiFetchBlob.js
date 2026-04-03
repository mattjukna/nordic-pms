import { getAccessToken } from '../auth/useAccessToken';
import { emitSessionEvent } from './sessionEvents';
export async function apiFetchBlob(url) {
    const send = async (token) => fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
    });
    let token = await getAccessToken({ interactive: false });
    let res = await send(token);
    if (res.status === 401 || res.status === 403) {
        emitSessionEvent({ level: 'warning', message: 'Session check failed during export. Retrying once.' });
        token = await getAccessToken({ forceRefresh: true, interactive: false });
        res = await send(token);
    }
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 401 || res.status === 403) {
            emitSessionEvent({ level: 'error', message: 'Session expired. Sign-in is required before export can continue.' });
            void getAccessToken({ forceRefresh: true, interactive: true }).catch(() => undefined);
        }
        throw new Error(`Export failed: ${res.status} ${res.statusText}: ${text}`);
    }
    const cd = res.headers.get('content-disposition') || '';
    const m = /filename="([^\"]+)"/i.exec(cd);
    const filename = m?.[1];
    const blob = await res.blob();
    return { blob, filename };
}
export default apiFetchBlob;

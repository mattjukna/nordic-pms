import { getAccessToken } from '../auth/useAccessToken';
import { emitSessionEvent } from './sessionEvents';

async function readResponseBody(res: Response) {
  return res.text().catch(() => '');
}

export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string,string> || {}) };
  const send = async (token: string) => fetch(input, { ...init, headers: { ...headers, Authorization: `Bearer ${token}` } });

  let token = await getAccessToken({ interactive: false });
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
    throw new Error(`API ${res.status} ${res.statusText}: ${bodyText}`);
  }
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText}: ${bodyText}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return JSON.parse(bodyText || '{}'); } catch { return bodyText; }
  }
  return bodyText;
}

export default apiFetch;

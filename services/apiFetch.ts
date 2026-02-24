import { getAccessToken } from '../auth/useAccessToken';

export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string,string> || {}) };
  // Acquire token (let errors bubble up to caller)
  const token = await getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(input, { ...init, headers });

  const bodyText = await res.text().catch(() => '');
  if (res.status === 401 || res.status === 403) {
    // Do not auto-logout here; throw rich error for UI to handle and debugging
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

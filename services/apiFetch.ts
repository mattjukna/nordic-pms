import { getAccessToken } from '../auth/useAccessToken';
import { msalInstance } from '../auth/msalInstance';

export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string,string> || {}) };
  try {
    const token = await getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch (err) {
    // If cannot acquire token, logout to force fresh login
    try { msalInstance.logoutRedirect(); } catch(e){}
    throw err;
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 || res.status === 403) {
    try { msalInstance.logoutRedirect(); } catch(e){}
    throw new Error(`${res.status} ${await res.text()}`);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export default apiFetch;

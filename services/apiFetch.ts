import { beginInteractiveSignIn, getAccessToken, InteractiveAuthRequiredError } from '../auth/useAccessToken';
import { emitSessionEvent } from './sessionEvents';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function readResponseBody(res: Response) {
  return res.text().catch(() => '');
}

function isInteractiveAuthRequired(err: any) {
  return err instanceof InteractiveAuthRequiredError || err?.name === 'InteractiveAuthRequiredError';
}

function startInteractiveSignIn() {
  void beginInteractiveSignIn().catch(() => undefined);
}

export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string,string> || {}) };
  const send = async (token: string) => fetch(input, { ...init, headers: { ...headers, Authorization: `Bearer ${token}` } });

  let token: string;
  try {
    token = await getAccessToken({ interactive: false });
  } catch (e: any) {
    if (isInteractiveAuthRequired(e)) {
      startInteractiveSignIn();
    }
    throw new AuthError(e?.message || 'Authentication required');
  }
  let res = await send(token);
  let bodyText = await readResponseBody(res);

  if (res.status === 401 || res.status === 403) {
    emitSessionEvent({ level: 'warning', message: 'Session check failed. Retrying once before redirecting to sign-in.' });
    try {
      token = await getAccessToken({ forceRefresh: true, interactive: false });
    } catch (e: any) {
      if (isInteractiveAuthRequired(e)) {
        startInteractiveSignIn();
      }
      throw new AuthError(e?.message || 'Authentication required');
    }
    res = await send(token);
    bodyText = await readResponseBody(res);
  }

  if (res.status === 401 || res.status === 403) {
    emitSessionEvent({ level: 'error', message: 'Session expired. Sign-in is required to continue.' });
    startInteractiveSignIn();
    throw new AuthError(`API ${res.status} ${res.statusText}: ${bodyText}`);
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

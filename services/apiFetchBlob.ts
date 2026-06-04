import { beginInteractiveSignIn, getAccessToken, InteractiveAuthRequiredError } from '../auth/useAccessToken';
import { emitSessionEvent } from './sessionEvents';

function isInteractiveAuthRequired(err: any) {
  return err instanceof InteractiveAuthRequiredError || err?.name === 'InteractiveAuthRequiredError';
}

function startInteractiveSignIn() {
  void beginInteractiveSignIn().catch(() => undefined);
}

export async function apiFetchBlob(url: string): Promise<{ blob: Blob; filename?: string }> {
  const send = async (token: string) => fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  let token: string;
  try {
    token = await getAccessToken({ interactive: false });
  } catch (err: any) {
    if (isInteractiveAuthRequired(err)) {
      startInteractiveSignIn();
    }
    throw err;
  }
  let res = await send(token);

  if (res.status === 401 || res.status === 403) {
    emitSessionEvent({ level: 'warning', message: 'Session check failed during export. Retrying once.' });
    try {
      token = await getAccessToken({ forceRefresh: true, interactive: false });
    } catch (err: any) {
      if (isInteractiveAuthRequired(err)) {
        startInteractiveSignIn();
      }
      throw err;
    }
    res = await send(token);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      emitSessionEvent({ level: 'error', message: 'Session expired. Sign-in is required before export can continue.' });
      startInteractiveSignIn();
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

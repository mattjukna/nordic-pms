import { getAccessToken } from '../auth/useAccessToken';

export async function apiFetchBlob(url: string): Promise<{ blob: Blob; filename?: string }> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Export failed: ${res.status} ${res.statusText}: ${text}`);
  }

  const cd = res.headers.get('content-disposition') || '';
  const m = /filename="([^\"]+)"/i.exec(cd);
  const filename = m?.[1];
  const blob = await res.blob();
  return { blob, filename };
}

export default apiFetchBlob;

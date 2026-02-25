export type RuntimeAuthConfig = {
  clientId: string;
  tenantId: string;
  allowedDomain: string;
  apiScope: string;
};

let cached: RuntimeAuthConfig | null = null;

export async function loadRuntimeAuthConfig(): Promise<RuntimeAuthConfig> {
  if (cached) return cached;
  const res = await fetch('/config', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load /config (${res.status})`);

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    const txt = await res.text();
    const snippet = txt.slice(0, 512).replace(/\s+/g, ' ').trim();
    throw new Error(`/config did not return JSON (content-type: ${contentType || 'unknown'}). Response snippet: ${snippet}`);
  }

  const cfg = (await res.json()) as RuntimeAuthConfig;
  cached = cfg;
  return cfg;
}

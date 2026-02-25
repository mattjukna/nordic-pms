export type RuntimeAuthConfig = {
  clientId: string;
  tenantId: string;
  allowedDomain: string;
  apiScope: string;
};

let cachedConfig: RuntimeAuthConfig | null = null;

export async function getRuntimeAuthConfig(): Promise<RuntimeAuthConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const resp = await fetch('/api/config', { cache: 'no-store' });
    if (!resp.ok) throw new Error(`Failed to fetch /api/config: ${resp.status}`);
    const json = await resp.json();
    cachedConfig = {
      clientId: String(json.clientId || ''),
      tenantId: String(json.tenantId || ''),
      allowedDomain: String(json.allowedDomain || ''),
      apiScope: String(json.apiScope || ''),
    };
    return cachedConfig;
  } catch (err: any) {
    console.warn('[runtimeConfig] could not load /api/config', err?.message ?? err);
    cachedConfig = { clientId: '', tenantId: '', allowedDomain: '', apiScope: '' };
    return cachedConfig;
  }
}

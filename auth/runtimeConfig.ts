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
  const cfg = (await res.json()) as RuntimeAuthConfig;
  cached = cfg;
  return cfg;
}

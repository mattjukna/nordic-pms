import { PublicClientApplication } from '@azure/msal-browser';
import { loadRuntimeAuthConfig } from './runtimeConfig';
import { buildMsalConfig } from './msalConfig';

// Synchronous fallback instance using Vite-provided env at build/dev time.
const syncClientId = (import.meta as any).env?.VITE_AAD_CLIENT_ID || '';
const syncTenantId = (import.meta as any).env?.VITE_AAD_TENANT_ID || '';
const syncAuthority = syncTenantId ? `https://login.microsoftonline.com/${syncTenantId}` : 'https://login.microsoftonline.com/common';

const msalConfigSync = {
	auth: {
		clientId: syncClientId,
		authority: syncAuthority,
		redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
		postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '',
		navigateToLoginRequestUrl: true,
	},
	cache: {
		cacheLocation: 'localStorage',
		storeAuthStateInCookie: false,
	},
} as any;

export const msalInstance = new PublicClientApplication(msalConfigSync as any);
export default msalInstance;

let singleton: PublicClientApplication | null = null;

export async function getMsalInstance(): Promise<PublicClientApplication> {
	if (singleton) return singleton;
	const cfg = await loadRuntimeAuthConfig();
	const cfgMsal = buildMsalConfig(cfg);
	singleton = new PublicClientApplication(cfgMsal as any);
	return singleton;
}

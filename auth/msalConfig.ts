import type { Configuration } from "@azure/msal-browser";
import { getRuntimeAuthConfig } from "../src/auth/runtimeConfig";

// Synchronous fallbacks for build-time / client-side imports (Vite injects these)
const SYNC_CLIENT_ID = (import.meta as any).env?.VITE_AAD_CLIENT_ID || '';
const SYNC_TENANT_ID = (import.meta as any).env?.VITE_AAD_TENANT_ID || '';
const SYNC_ALLOWED_DOMAIN = (import.meta as any).env?.VITE_AAD_ALLOWED_DOMAIN || '';
const SYNC_API_SCOPE = (import.meta as any).env?.VITE_AAD_API_SCOPE || '';

export const loginRequest = { scopes: [SYNC_API_SCOPE, 'openid', 'profile', 'email'].filter(Boolean) as string[] };

export function getAuthConfigErrors(): string[] {
  const errs: string[] = [];
  if (!SYNC_CLIENT_ID) errs.push('Missing MSAL_CLIENT_ID');
  if (!SYNC_TENANT_ID) errs.push('Missing MSAL_TENANT_ID');
  if (!SYNC_ALLOWED_DOMAIN) errs.push('Missing MSAL_ALLOWED_DOMAIN');
  if (!SYNC_API_SCOPE) errs.push('Missing MSAL_API_SCOPE (required for calling your backend API)');
  return errs;
}

export const allowedDomainExport = SYNC_ALLOWED_DOMAIN;

export type BuiltMsal = {
  msalConfig: Configuration;
  loginRequest: { scopes: string[] };
  allowedDomainExport: string;
  getAuthConfigErrors: () => string[];
};

export async function buildMsalConfig(): Promise<BuiltMsal> {
  const runtime = await getRuntimeAuthConfig();
  const clientId = runtime.clientId || '';
  const tenantId = runtime.tenantId || '';
  const allowedDomain = runtime.allowedDomain || '';
  const apiScope = runtime.apiScope || '';

  const authority = tenantId
    ? `https://login.microsoftonline.com/${tenantId}`
    : "https://login.microsoftonline.com/common";

  const msalConfig: Configuration = {
    auth: {
      clientId,
      authority,
      redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
      postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '',
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (_level, _message, containsPii) => {
          if (containsPii) return;
        },
        piiLoggingEnabled: false,
      },
    },
  };

  const loginRequest = {
    scopes: [apiScope, "openid", "profile", "email"].filter(Boolean) as string[],
  };

  const allowedDomainExport = allowedDomain;

  const getAuthConfigErrors = () => {
    const errs: string[] = [];
    if (!clientId) errs.push('Missing MSAL_CLIENT_ID');
    if (!tenantId) errs.push('Missing MSAL_TENANT_ID');
    if (!allowedDomain) errs.push('Missing MSAL_ALLOWED_DOMAIN');
    if (!apiScope) errs.push('Missing MSAL_API_SCOPE (required for calling your backend API)');
    return errs;
  };

  return { msalConfig, loginRequest, allowedDomainExport, getAuthConfigErrors };
}

export default buildMsalConfig;

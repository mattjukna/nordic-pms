import type { Configuration } from "@azure/msal-browser";
import type { RuntimeAuthConfig } from "./runtimeConfig";

// Synchronous fallbacks for build-time usage (Vite injects these values)
const SYNC_CLIENT_ID = (import.meta as any).env?.VITE_AAD_CLIENT_ID || '';
const SYNC_TENANT_ID = (import.meta as any).env?.VITE_AAD_TENANT_ID || '';
const SYNC_ALLOWED_DOMAIN = (import.meta as any).env?.VITE_AAD_ALLOWED_DOMAIN || '';
const SYNC_API_SCOPE = (import.meta as any).env?.VITE_AAD_API_SCOPE || '';

export function buildMsalConfig(cfg: RuntimeAuthConfig): Configuration {
  const authority = cfg.tenantId
    ? `https://login.microsoftonline.com/${cfg.tenantId}`
    : "https://login.microsoftonline.com/common";

  return {
    auth: {
      clientId: cfg.clientId,
      authority,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: false,
    },
  } as Configuration;
}

export function getAuthConfigErrors(cfg?: RuntimeAuthConfig): string[] {
  const errs: string[] = [];
  const clientId = cfg?.clientId ?? SYNC_CLIENT_ID;
  const tenantId = cfg?.tenantId ?? SYNC_TENANT_ID;
  const allowedDomain = cfg?.allowedDomain ?? SYNC_ALLOWED_DOMAIN;
  const apiScope = cfg?.apiScope ?? SYNC_API_SCOPE;
  if (!clientId) errs.push("Missing MSAL_CLIENT_ID");
  if (!tenantId) errs.push("Missing MSAL_TENANT_ID");
  if (!allowedDomain) errs.push("Missing MSAL_ALLOWED_DOMAIN");
  if (!apiScope) errs.push("Missing MSAL_API_SCOPE (required for calling your backend API)");
  return errs;
}

// Export synchronous helpers so existing components can still import them at build time.
export const loginRequest = { scopes: [SYNC_API_SCOPE, 'openid', 'profile', 'email'].filter(Boolean) as string[] };
export const allowedDomainExport = SYNC_ALLOWED_DOMAIN;

export default buildMsalConfig;

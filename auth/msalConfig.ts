// src/auth/msalConfig.ts
import type { Configuration } from "@azure/msal-browser";

/**
 * Read Vite-provided env vars in client builds.
 * These are injected by Vite as import.meta.env.VITE_*
 */
const clientId = (import.meta.env.VITE_AAD_CLIENT_ID as string) || "";
const tenantId = (import.meta.env.VITE_AAD_TENANT_ID as string) || "";
const allowedDomain = (import.meta.env.VITE_AAD_ALLOWED_DOMAIN as string) || "";
const apiScope = (import.meta.env.VITE_AAD_API_SCOPE as string) || "";

export const AAD_CLIENT_ID: string = clientId;
export const AAD_TENANT_ID: string = tenantId;
export const AAD_ALLOWED_DOMAIN: string = allowedDomain;
export const AAD_API_SCOPE: string = apiScope;

/**
 * Authority:
 * - For single-tenant (your org only): https://login.microsoftonline.com/<TENANT_ID>
 */
const authority = tenantId
  ? `https://login.microsoftonline.com/${tenantId}`
  : "https://login.microsoftonline.com/common"; // fallback only for local dev if tenant id missing

/**
 * MSAL config used to create PublicClientApplication
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: AAD_CLIENT_ID,
    authority,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '', // e.g. http://localhost:3000
    postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : '',
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, message, containsPii) => {
        if (containsPii) return;
        // Comment out if too noisy:
        // console.log(message);
      },
      piiLoggingEnabled: false,
    },
  },
};

/**
 * Scopes we ask for at login.
 * IMPORTANT:
 * - If you protect your backend with JWT middleware and expect an access token for your API,
 *   you should include your API scope here:
 *     api://<client-id>/access_as_user
 * - Empty strings must be filtered out (common misconfig).
 */
export const loginRequest = {
  scopes: [AAD_API_SCOPE, "openid", "profile", "email"].filter(Boolean) as string[],
};

/**
 * Optional: if you want to call Graph later (not needed for basic sign-in)
 */
export const graphRequest = {
  scopes: ["User.Read"],
};

/**
 * The only allowed email domain (e.g. "nordicproteins.com").
 * Your AuthGate should enforce:
 *   username.toLowerCase().endsWith(`@${allowedDomainExport}`)
 */
export const allowedDomainExport = AAD_ALLOWED_DOMAIN;

/**
 * Helpful runtime validation (use this in your LoginPage to show a readable error)
 */
export function getAuthConfigErrors(): string[] {
  const errs: string[] = [];
  if (!AAD_CLIENT_ID) errs.push("Missing MSAL_CLIENT_ID");
  if (!AAD_TENANT_ID) errs.push("Missing MSAL_TENANT_ID");
  if (!AAD_ALLOWED_DOMAIN) errs.push("Missing MSAL_ALLOWED_DOMAIN");
  // API scope can be optional ONLY if backend auth is disabled.
  // If your server verifies tokens, you almost certainly need it:
  if (!AAD_API_SCOPE) errs.push("Missing MSAL_API_SCOPE (required for calling your backend API)");
  return errs;
}

export default msalConfig;
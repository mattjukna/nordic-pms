// src/auth/msalConfig.ts
import type { Configuration } from "@azure/msal-browser";

/**
 * Read env vars from Vite (import.meta.env).
 * Keep values empty-string default so the app can show a clear error
 * instead of crashing at import-time.
 */
const env = (import.meta as any).env ?? {};

export const AAD_CLIENT_ID: string = (env.VITE_AAD_CLIENT_ID as string) || "";
export const AAD_TENANT_ID: string = (env.VITE_AAD_TENANT_ID as string) || "";
export const AAD_ALLOWED_DOMAIN: string = (env.VITE_AAD_ALLOWED_DOMAIN as string) || "";
export const AAD_API_SCOPE: string = (env.VITE_AAD_API_SCOPE as string) || "";

/**
 * Authority:
 * - For single-tenant (your org only): https://login.microsoftonline.com/<TENANT_ID>
 */
const authority = AAD_TENANT_ID
  ? `https://login.microsoftonline.com/${AAD_TENANT_ID}`
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
  if (!AAD_CLIENT_ID) errs.push("Missing VITE_AAD_CLIENT_ID");
  if (!AAD_TENANT_ID) errs.push("Missing VITE_AAD_TENANT_ID");
  if (!AAD_ALLOWED_DOMAIN) errs.push("Missing VITE_AAD_ALLOWED_DOMAIN");
  // API scope can be optional ONLY if backend auth is disabled.
  // If your server verifies tokens, you almost certainly need it:
  if (!AAD_API_SCOPE) errs.push("Missing VITE_AAD_API_SCOPE (required for calling your backend API)");
  return errs;
}

export default msalConfig;
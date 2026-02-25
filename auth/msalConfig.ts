import type { Configuration } from "@azure/msal-browser";
import { getRuntimeAuthConfig } from "../src/auth/runtimeConfig";

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

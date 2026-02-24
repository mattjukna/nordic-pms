const meta: any = (import.meta as any);
const clientId = meta.env?.VITE_AAD_CLIENT_ID as string || '';
const tenantId = meta.env?.VITE_AAD_TENANT_ID as string || '';
const allowedDomain = meta.env?.VITE_AAD_ALLOWED_DOMAIN as string || '';
const apiScope = meta.env?.VITE_AAD_API_SCOPE as string || '';

export const msalConfig = {
  auth: {
    clientId: clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false
  }
};

export const loginRequest = {
  scopes: [apiScope, 'openid', 'profile', 'email']
};

export const allowedDomainExport = allowedDomain;

export default msalConfig;

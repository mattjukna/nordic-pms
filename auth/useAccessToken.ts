import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { loadRuntimeAuthConfig } from './runtimeConfig';
import { getMsalInstance } from './msalInstance';

export async function getAccessToken(): Promise<string> {
  const cfg = await loadRuntimeAuthConfig();
  const scope = cfg.apiScope;
  if (!scope) throw new Error('Missing MSAL_API_SCOPE. Ensure server env vars are set and restart.');

  const msal = await getMsalInstance();
  const accounts = msal.getAllAccounts();
  if (!accounts || accounts.length === 0) throw new Error('No signed in account');
  const account = accounts[0];

  try {
    const resp = await msal.acquireTokenSilent({ account, scopes: [scope] });
    if (resp && resp.accessToken) return resp.accessToken;
    throw new Error('No access token');
  } catch (err: any) {
    if (err instanceof InteractionRequiredAuthError) {
      // Initiate interactive redirect to acquire scopes, then bail so caller stops and user is redirected
      const msal = await getMsalInstance();
      await msal.acquireTokenRedirect({ account, scopes: [scope] });
      throw new Error('Redirecting for token acquisition');
    }
    throw err;
  }
}

export default getAccessToken;

import { msalInstance } from './msalInstance';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { AAD_API_SCOPE } from './msalConfig';

export async function getAccessToken(): Promise<string> {
  const accounts = msalInstance.getAllAccounts();
  if (!accounts || accounts.length === 0) throw new Error('No signed in account');
  const account = accounts[0];

  const scope = AAD_API_SCOPE as string | undefined;
  if (!scope) throw new Error('Missing MSAL_API_SCOPE. Ensure server env vars are set and restart.');

  try {
    const resp = await msalInstance.acquireTokenSilent({ account, scopes: [scope] });
    if (resp && resp.accessToken) return resp.accessToken;
    throw new Error('No access token');
  } catch (err: any) {
    if (err instanceof InteractionRequiredAuthError) {
      // Initiate interactive redirect to acquire scopes, then bail so caller stops and user is redirected
      msalInstance.acquireTokenRedirect({ account, scopes: [scope] });
      throw new Error('Redirecting for token acquisition');
    }
    throw err;
  }
}

export default getAccessToken;

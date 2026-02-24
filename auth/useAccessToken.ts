import { msalInstance } from './msalInstance';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const meta: any = (import.meta as any);

export async function getAccessToken(): Promise<string> {
  const accounts = msalInstance.getAllAccounts();
  if (!accounts || accounts.length === 0) throw new Error('No signed in account');
  const account = accounts[0];
  try {
    const resp = await msalInstance.acquireTokenSilent({ account, scopes: [meta.env?.VITE_AAD_API_SCOPE as string || 'openid'] });
    if (resp && resp.accessToken) return resp.accessToken;
    throw new Error('No access token');
  } catch (err: any) {
    if (err instanceof InteractionRequiredAuthError) {
      // fallback to redirect
      msalInstance.acquireTokenRedirect({ account, scopes: [meta.env?.VITE_AAD_API_SCOPE as string || 'openid'] });
      throw new Error('Redirecting for interaction');
    }
    throw err;
  }
}

export default getAccessToken;

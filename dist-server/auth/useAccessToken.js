import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { loadRuntimeAuthConfig } from './runtimeConfig';
import { getMsalInstance } from './msalInstance';
import { emitSessionEvent } from '../services/sessionEvents';
export async function getAccessToken(options) {
    const cfg = await loadRuntimeAuthConfig();
    const scope = cfg.apiScope;
    if (!scope)
        throw new Error('Missing MSAL_API_SCOPE. Ensure server env vars are set and restart.');
    const msal = await getMsalInstance();
    const accounts = msal.getAllAccounts();
    if (!accounts || accounts.length === 0)
        throw new Error('No signed in account');
    const account = accounts[0];
    const interactive = options?.interactive ?? true;
    try {
        const resp = await msal.acquireTokenSilent({ account, scopes: [scope], forceRefresh: options?.forceRefresh ?? false });
        if (resp && resp.accessToken)
            return resp.accessToken;
        throw new Error('No access token');
    }
    catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
            emitSessionEvent({
                level: 'warning',
                message: 'Your session needs to be refreshed. Open work is being preserved before sign-in continues.',
            });
            if (!interactive) {
                throw new Error('Interactive sign-in required');
            }
            const msal = await getMsalInstance();
            await msal.acquireTokenRedirect({ account, scopes: [scope] });
            throw new Error('Redirecting for token acquisition');
        }
        throw err;
    }
}
export default getAccessToken;

import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { loadRuntimeAuthConfig } from './runtimeConfig';
import { getMsalInstance } from './msalInstance';
import { emitSessionEvent } from '../services/sessionEvents';

export class InteractiveAuthRequiredError extends Error {
  constructor(message = 'Interactive sign-in required') {
    super(message);
    this.name = 'InteractiveAuthRequiredError';
  }
}

const INTERACTIVE_ERROR_HINTS = [
  'interaction_required',
  'login_required',
  'consent_required',
  'invalid_grant',
  'no_tokens_found',
  'token_refresh_required',
  'refresh token',
  'aadsts50058',
  'aadsts50076',
  'aadsts50079',
  'aadsts50173',
  'aadsts65001',
  'aadsts700082',
  'aadsts700084',
];

function getErrorText(err: any) {
  return [
    err?.name,
    err?.errorCode,
    err?.subError,
    err?.errorMessage,
    err?.message,
  ].filter(Boolean).join(' ').toLowerCase();
}

function needsInteractiveAuth(err: any) {
  if (err instanceof InteractionRequiredAuthError) return true;
  const text = getErrorText(err);
  return INTERACTIVE_ERROR_HINTS.some((hint) => text.includes(hint));
}

function clearMsalBrowserCache(clientId: string) {
  const normalizedClientId = clientId.trim().toLowerCase();
  const shouldRemove = (key: string) => {
    const lower = key.toLowerCase();
    return (
      lower.startsWith('msal.') ||
      (normalizedClientId ? lower.includes(`.${normalizedClientId}.`) : false) ||
      (normalizedClientId ? lower.includes(normalizedClientId) : false) ||
      lower.includes('interaction.status') ||
      lower.includes('server.keys')
    );
  };

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
      keys.forEach((key) => {
        if (shouldRemove(key)) storage.removeItem(key);
      });
    } catch {
      // Ignore storage cleanup failures and continue with interactive sign-in.
    }
  }
}

async function redirectForSignIn(scope: string, account?: any, options?: { clearMsalCache?: boolean }) {
  const cfg = await loadRuntimeAuthConfig();
  if (options?.clearMsalCache ?? false) {
    clearMsalBrowserCache(cfg.clientId);
  }

  const msal = await getMsalInstance();
  const request = { scopes: [scope] };
  if (account && !options?.clearMsalCache) {
    await msal.acquireTokenRedirect({ ...request, account });
  } else {
    await msal.loginRedirect(request);
  }
  throw new Error('Redirecting for token acquisition');
}

export async function beginInteractiveSignIn(options?: { clearMsalCache?: boolean }): Promise<void> {
  const cfg = await loadRuntimeAuthConfig();
  const scope = cfg.apiScope;
  if (!scope) throw new Error('Missing MSAL_API_SCOPE. Ensure server env vars are set and restart.');

  const msal = await getMsalInstance();
  const account = msal.getAllAccounts()?.[0];
  emitSessionEvent({
    level: 'warning',
    message: 'Your sign-in session needs to be refreshed. Redirecting to Microsoft sign-in.',
  });
  await redirectForSignIn(scope, account, { clearMsalCache: options?.clearMsalCache ?? true });
}

export async function getAccessToken(options?: { forceRefresh?: boolean; interactive?: boolean }): Promise<string> {
  const cfg = await loadRuntimeAuthConfig();
  const scope = cfg.apiScope;
  if (!scope) throw new Error('Missing MSAL_API_SCOPE. Ensure server env vars are set and restart.');

  const msal = await getMsalInstance();
  const accounts = msal.getAllAccounts();
  if (!accounts || accounts.length === 0) {
    if (options?.interactive ?? true) {
      emitSessionEvent({
        level: 'warning',
        message: 'Sign-in is required to continue. Redirecting to Microsoft sign-in.',
      });
      await redirectForSignIn(scope, undefined, { clearMsalCache: true });
    }
    throw new InteractiveAuthRequiredError('No signed in account');
  }
  const account = accounts[0];
  const interactive = options?.interactive ?? true;

  try {
    const resp = await msal.acquireTokenSilent({ account, scopes: [scope], forceRefresh: options?.forceRefresh ?? false });
    if (resp && resp.accessToken) return resp.accessToken;
    throw new Error('No access token');
  } catch (err: any) {
    if (needsInteractiveAuth(err)) {
      emitSessionEvent({
        level: 'warning',
        message: 'Your session needs to be refreshed. Open work is being preserved before sign-in continues.',
      });
      if (!interactive) {
        throw new InteractiveAuthRequiredError();
      }
      await redirectForSignIn(scope, account, { clearMsalCache: true });
    }
    throw err;
  }
}

export default getAccessToken;

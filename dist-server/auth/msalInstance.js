import { PublicClientApplication } from '@azure/msal-browser';
import { loadRuntimeAuthConfig } from './runtimeConfig';
import { buildMsalConfig } from './msalConfig';
let pcaPromise = null;
export async function initMsal() {
    if (pcaPromise)
        return pcaPromise;
    pcaPromise = (async () => {
        const cfg = await loadRuntimeAuthConfig();
        const cfgMsal = buildMsalConfig(cfg);
        const clientId = cfgMsal?.auth?.clientId;
        const authority = cfgMsal?.auth?.authority;
        if (!clientId)
            throw new Error('Missing MSAL clientId after loading runtime config');
        console.log('[MSAL init]', clientId, authority);
        const pca = new PublicClientApplication(cfgMsal);
        try {
            // initialize if available (msal v3+ may expose initialize)
            if (typeof pca.initialize === 'function')
                await pca.initialize();
        }
        catch (e) {
            // non-fatal
        }
        return pca;
    })().catch((err) => {
        pcaPromise = null; // allow retry on next call
        throw err;
    });
    return pcaPromise;
}
export async function getMsalInstance() {
    return initMsal();
}

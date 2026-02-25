import type { PublicClientApplication } from '@azure/msal-browser';

export function installLogoutDebug(instance: any) {
  try {
    const anyMsal: any = instance as any;
    if ((anyMsal.__logoutDebugInstalled)) return;
    anyMsal.__logoutDebugInstalled = true;

    const origLogoutRedirect = anyMsal.logoutRedirect?.bind(anyMsal);
    const origLogoutPopup = anyMsal.logoutPopup?.bind(anyMsal);

    anyMsal.logoutRedirect = (...args: any[]) => {
      console.error('[AUTH] logoutRedirect called (blocked for debugging)');
      console.trace('[AUTH] logoutRedirect stack');
      return Promise.resolve();
    };

    anyMsal.logoutPopup = (...args: any[]) => {
      console.error('[AUTH] logoutPopup called (blocked for debugging)');
      console.trace('[AUTH] logoutPopup stack');
      return Promise.resolve();
    };

    anyMsal.__origLogoutRedirect = origLogoutRedirect;
    anyMsal.__origLogoutPopup = origLogoutPopup;
  } catch (e) {
    console.error('[AUTH] installLogoutDebug failed:', e);
  }
}

export default installLogoutDebug;

export function restoreLogoutDebug(instance: any) {
  try {
    const anyMsal: any = instance as any;
    if (anyMsal.__origLogoutRedirect) anyMsal.logoutRedirect = anyMsal.__origLogoutRedirect;
    if (anyMsal.__origLogoutPopup) anyMsal.logoutPopup = anyMsal.__origLogoutPopup;
    delete anyMsal.__logoutDebugInstalled;
    delete anyMsal.__origLogoutRedirect;
    delete anyMsal.__origLogoutPopup;
  } catch (e) {
    console.error('[AUTH] restoreLogoutDebug failed:', e);
  }
}

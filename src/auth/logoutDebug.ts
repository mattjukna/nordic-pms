import { msalInstance } from '../../auth/msalInstance';

export function installLogoutDebug() {
  try {
    // Avoid double-patching
    const anyMsal: any = msalInstance as any;
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

    // Keep originals accessible for later restore if needed
    anyMsal.__origLogoutRedirect = origLogoutRedirect;
    anyMsal.__origLogoutPopup = origLogoutPopup;
  } catch (e) {
    console.error('[AUTH] installLogoutDebug failed:', e);
  }
}

export default installLogoutDebug;

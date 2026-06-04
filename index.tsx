import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MsalProvider } from "@azure/msal-react";
import { initMsal } from "./auth/msalInstance";
import { installLogoutDebug } from './src/auth/logoutDebug';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Could not find root element");

async function clearLegacyRuntimeCaches() {
  try {
    if ('caches' in window) {
      await caches.delete('api-cache');
    }
  } catch {
    // Ignore cache cleanup failures.
  }
}

(async () => {
  await clearLegacyRuntimeCaches();

  const msalInstance = await initMsal();
  // Enable logout debug only when explicitly requested via VITE_AUTH_DEBUG_LOGOUT
  const enableLogoutDebug = (import.meta as any).env?.VITE_AUTH_DEBUG_LOGOUT === 'true';
  if (enableLogoutDebug) installLogoutDebug(msalInstance);

  try {
    await msalInstance.handleRedirectPromise();
  } catch (err) {
    console.error(err);
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <MsalProvider instance={msalInstance}>
          <App />
        </MsalProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
})();

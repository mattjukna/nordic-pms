import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MsalProvider } from "@azure/msal-react";
import getMsalInstance from "./auth/msalInstance";
import { installLogoutDebug } from './src/auth/logoutDebug';

// Enable logout debug only when explicitly requested via VITE_AUTH_DEBUG_LOGOUT
const enableLogoutDebug = (import.meta as any).env?.VITE_AUTH_DEBUG_LOGOUT === 'true';
if (enableLogoutDebug) installLogoutDebug();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Could not find root element");

(async () => {
  const msalInstance = await getMsalInstance();
  // Enable logout debug only when explicitly requested via VITE_AUTH_DEBUG_LOGOUT
  const enableLogoutDebug = (import.meta as any).env?.VITE_AUTH_DEBUG_LOGOUT === 'true';
  if (enableLogoutDebug) installLogoutDebug();

  try {
    await msalInstance.handleRedirectPromise();
  } catch (err) {
    console.error(err);
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </React.StrictMode>
  );
})();
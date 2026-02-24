import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./auth/msalInstance";
import { installLogoutDebug } from './src/auth/logoutDebug';

// Enable logout debug only when explicitly requested via VITE_AUTH_DEBUG_LOGOUT
const enableLogoutDebug = (import.meta as any).env?.VITE_AUTH_DEBUG_LOGOUT === 'true';
if (enableLogoutDebug) installLogoutDebug();

// Ensure redirect response is processed before the app renders
msalInstance.handleRedirectPromise().catch(console.error);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Could not find root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </React.StrictMode>
);
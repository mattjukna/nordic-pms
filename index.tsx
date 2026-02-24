import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./auth/msalInstance";
import { installLogoutDebug } from './src/auth/logoutDebug';

// In development, install logout debugger to block auto-redirects and trace sources
if ((import.meta as any).env?.DEV) installLogoutDebug();

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
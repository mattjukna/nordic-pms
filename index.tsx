import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./auth/msalInstance";

// Critical for redirect flows: processes auth response on return
msalInstance
  .handleRedirectPromise()
  .catch((e) => console.error("MSAL redirect error:", e));

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Could not find root element");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </React.StrictMode>
);
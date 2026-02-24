import React, { useEffect, useMemo, useRef } from "react";
import NordicLogApp from "./components/NordicLogApp";
import LoginPage from "./components/auth/LoginPage";
import { allowedDomainExport } from "./auth/msalConfig";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { useStore } from "./store";

const getUsername = (acct: any) =>
  (acct?.username ||
    acct?.idTokenClaims?.preferred_username ||
    acct?.idTokenClaims?.upn ||
    "") as string;

const App: React.FC = () => {
  const store = useStore();
  const { accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const hydratedRef = useRef(false);

  const username = useMemo(() => getUsername(accounts?.[0]), [accounts]);
  const isDomainOk = useMemo(() => {
    if (!allowedDomainExport) return false;
    return (username || "").toLowerCase().endsWith(`@${allowedDomainExport}`);
  }, [username]);

  // Hydrate only once after auth passes
  useEffect(() => {
    if (isAuthenticated && isDomainOk && !hydratedRef.current) {
      hydratedRef.current = true;
      store.hydrateFromApi();
    }
  }, [isAuthenticated, isDomainOk, store]);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (!isDomainOk) {
    return <LoginPage unauthorizedEmail={username} />;
  }

  return <NordicLogApp isAuthed={true} />;
};

export default App;
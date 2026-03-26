import React, { useEffect, useMemo, useRef, useState } from "react";
import NordicLogApp from "./components/NordicLogApp";
import LoginPage from "./components/auth/LoginPage";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { useStore } from "./store";
import { loadRuntimeAuthConfig, RuntimeAuthConfig } from "./auth/runtimeConfig";

const extractEmailFromAccount = (acct: any) => {
  // prefer idTokenClaims.preferred_username || upn || email, fallback to account.username
  const claims = acct?.idTokenClaims || {};
  return (
    (claims.preferred_username as string) || (claims.upn as string) || (claims.email as string) || acct?.username || ""
  );
};

const App: React.FC = () => {
  const hydrateFromApi = useStore((state) => state.hydrateFromApi);
  const { accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const hydratedRef = useRef(false);

  const [cfg, setCfg] = useState<RuntimeAuthConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const runtime = await loadRuntimeAuthConfig();
        if (!mounted) return;
        setCfg(runtime);
      } catch (e) {
        if (!mounted) return;
        console.error('Failed to load runtime config', e);
      } finally {
        if (!mounted) return;
        setCfgLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const userEmail = useMemo(() => extractEmailFromAccount(accounts?.[0]), [accounts]);
  const username = userEmail; // legacy name

  const allowedDomainList = useMemo(() => {
    const raw = (cfg?.allowedDomain || "") as string;
    return raw
      .split(/[;,]/)
      .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
  }, [cfg]);

  const userDomain = useMemo(() => (userEmail || "").trim().toLowerCase().split("@").pop() || "", [userEmail]);

  const isDomainOk = useMemo(() => {
    if (!cfg) return false; // don't evaluate until cfg loaded
    if (!allowedDomainList || allowedDomainList.length === 0) return true; // allow if no restriction
    return allowedDomainList.includes(userDomain);
  }, [cfg, allowedDomainList, userDomain]);

  // Hydrate only once after auth passes
  useEffect(() => {
    if (isAuthenticated && isDomainOk && !hydratedRef.current) {
      hydratedRef.current = true;
      hydrateFromApi();
    }
  }, [isAuthenticated, isDomainOk, hydrateFromApi]);

  if (cfgLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4">
        <div className="p-8 max-w-sm text-center">Loading configuration…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (!isDomainOk) {
    return (
      <LoginPage
        unauthorizedInfo={{
          email: userEmail,
          userDomain,
          allowed: (allowedDomainList || []).join(',')
        }}
      />
    );
  }

  return <NordicLogApp isAuthed={true} />;
};

export default App;
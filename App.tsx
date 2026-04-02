import React, { useEffect, useMemo, useRef, useState } from "react";
import NordicLogApp from "./components/NordicLogApp";
import LoginPage from "./components/auth/LoginPage";
import WelcomeScreen from "./components/WelcomeScreen";
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

  // Welcome screen: show once per calendar day
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      return localStorage.getItem('lastWelcomeDate') !== today;
    } catch { return true; }
  });

  const dismissWelcome = () => {
    try { localStorage.setItem('lastWelcomeDate', new Date().toISOString().slice(0, 10)); } catch {}
    setShowWelcome(false);
  };

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

  // SSE: listen for data-changed events from other clients and re-hydrate
  useEffect(() => {
    if (!isAuthenticated || !isDomainOk) return;
    let es: EventSource | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    try {
      es = new EventSource('/api/events');
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'data-changed') {
            // Debounce rapid successive changes (e.g. bulk operations)
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => hydrateFromApi(), 500);
          }
        } catch { /* ignore malformed messages */ }
      };
      es.onerror = () => {
        // EventSource will auto-reconnect; nothing extra needed
      };
    } catch { /* SSE not supported or blocked */ }
    return () => {
      if (debounce) clearTimeout(debounce);
      es?.close();
    };
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

  if (showWelcome) {
    return <WelcomeScreen userName={userEmail} onContinue={dismissWelcome} />;
  }

  return <NordicLogApp isAuthed={true} />;
};

export default App;
import React, { useEffect, useState } from 'react';
import NordicLogApp from './components/NordicLogApp';
import { msalInstance } from './auth/msalInstance';
import { allowedDomainExport } from './auth/msalConfig';
import LoginPage from './components/auth/LoginPage';
import { useStore } from './store';

const App: React.FC = () => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | undefined>(undefined);
  const accounts = msalInstance.getAllAccounts();
  const store = useStore();

  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const acct = accounts[0] as any;
      const username = acct.username || acct.idTokenClaims?.preferred_username || acct.userName || '';
      if (allowedDomainExport && username && username.toLowerCase().endsWith(`@${allowedDomainExport}`)) {
        setIsAuthed(true);
        setUnauthorizedEmail(undefined);
        // hydrate data once after auth
        store.hydrateFromApi();
      } else {
        setIsAuthed(false);
        setUnauthorizedEmail(username || undefined);
      }
    } else {
      setIsAuthed(false);
    }
  }, [accounts]);

  if (!isAuthed) {
    return <LoginPage unauthorizedEmail={unauthorizedEmail} />;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8">
      <NordicLogApp isAuthed={true} />
    </div>
  );
};

export default App;
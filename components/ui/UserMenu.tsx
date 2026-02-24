import React, { useState } from 'react';
import { msalInstance } from '../../auth/msalInstance';
import { useStore } from '../../store';
import UserSettingsModal from './UserSettingsModal';

const initials = (name?: string, email?: string) => {
  if (name) return name.split(' ').map(p => p[0]).slice(0,2).join('').toUpperCase();
  if (email) return email[0].toUpperCase();
  return 'U';
};

const UserMenu: React.FC = () => {
  const accounts = msalInstance.getAllAccounts();
  const acct: any = accounts && accounts.length > 0 ? accounts[0] : null;
  const name = acct?.name || acct?.idTokenClaims?.name || acct?.username || '';
  const email = acct?.username || acct?.idTokenClaims?.preferred_username || '';
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 p-1 rounded-md hover:bg-slate-100">
        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold">{initials(name, email)}</div>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded shadow-lg ring-1 ring-slate-900/5">
          <div className="p-3 border-b">
            <div className="text-sm font-bold">{name}</div>
            <div className="text-xs text-slate-500">{email}</div>
          </div>
          <div className="p-2">
            <button onClick={() => { setShowSettings(true); setOpen(false); }} className="w-full text-left px-2 py-2 text-sm hover:bg-slate-50">Settings</button>
            <button onClick={() => msalInstance.logoutRedirect()} className="w-full text-left px-2 py-2 text-sm text-red-600 hover:bg-slate-50">Sign out</button>
          </div>
        </div>
      )}

      <UserSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
};

export default UserMenu;

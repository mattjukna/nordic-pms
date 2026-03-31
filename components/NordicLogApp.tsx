import React, { useEffect, useState } from 'react';
import { LayoutDashboard, BarChart3, Bot, FileInput, Package, Settings, Scale, Box, Layers } from 'lucide-react';
import { useStore } from '../store';
import { GlassCard } from './ui/GlassCard';
import UserMenu from './ui/UserMenu';
import { InputTab } from './tabs/InputTab';
import { LivePreviewTab } from './tabs/LivePreviewTab';
import { TrendsTab } from './tabs/TrendsTab';
import { AITab } from './tabs/AITab';
import { InventoryTab } from './tabs/InventoryTab';
import { SettingsTab } from './tabs/SettingsTab';
import { clearSessionEvent, readSessionEvent, SessionEvent, subscribeSessionEvent } from '../services/sessionEvents';

const NordicLogApp: React.FC<{ isAuthed?: boolean }> = ({ isAuthed = false }) => {
  const activeTab = useStore((state) => state.activeTab);
  const setActiveTab = useStore((state) => state.setActiveTab);
  const isHydrating = useStore((state) => state.isHydrating);
  const hydrateError = useStore((state) => state.hydrateError);
  const hydrateRetryCount = useStore((state) => state.hydrateRetryCount);
  const userSettings = useStore((state) => state.userSettings);
  const hydrateFromApi = useStore((state) => state.hydrateFromApi);
  const [sessionEvent, setSessionEvent] = useState<SessionEvent | null>(null);

  useEffect(() => {
    setSessionEvent(readSessionEvent());
    return subscribeSessionEvent((event) => setSessionEvent(event));
  }, []);

  return (
    <div className={`${userSettings?.compactMode ? 'compact' : ''} w-full max-w-7xl mx-auto flex flex-col min-h-screen bg-slate-50`}>
      
      {/* Header & Nav */}
      <div className="p-2 md:p-4 shrink-0 z-50 sticky top-0">
        <GlassCard className="p-3 md:px-6 md:py-4 flex items-center justify-between gap-3 md:gap-4 shadow-md md:shadow-sm ring-1 ring-slate-900/5 backdrop-blur-xl bg-white/80 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Nordic Insights" className="h-8 md:h-10" />
          </div>

          {/* User menu on the right */}
          <div className="ml-4 shrink-0">
            <UserMenu />
          </div>

          {/* Tab Navigation */}
          <div className="w-full md:w-auto mt-2 md:mt-0 overflow-x-auto pb-1 md:pb-0 -mx-1 px-1 scrollbar-hide">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-max md:w-auto">
              {[
                { id: 'input', label: 'Input', icon: FileInput },
                { id: 'preview', label: 'Live View', icon: LayoutDashboard },
                { id: 'inventory', label: 'Stock', icon: Package },
                { id: 'trends', label: 'Analytics', icon: BarChart3 },
                { id: 'ai', label: 'Insights', icon: Bot },
                { id: 'settings', label: 'Master Data', icon: Settings },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`
                    flex items-center gap-2 px-3 md:px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap
                    ${activeTab === tab.id 
                      ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}
                  `}
                >
                  <tab.icon size={16} /> {tab.label}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 relative px-2 md:px-4 pb-8 min-w-0 overflow-x-hidden">
        {sessionEvent && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3 ${
            sessionEvent.level === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : sessionEvent.level === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <span>{sessionEvent.message}</span>
            <button
              onClick={() => {
                clearSessionEvent();
                setSessionEvent(null);
              }}
              className="text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {isHydrating ? (
          <div className="p-16 text-center flex flex-col items-center gap-4">
            <div className="relative h-14 w-14">
              <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
            </div>
            {hydrateRetryCount > 0 ? (
              <>
                <p className="text-slate-700 font-semibold text-lg">Database is waking up…</p>
                <p className="text-slate-500 text-sm max-w-md">
                  The database goes to sleep after a period of inactivity. It usually takes up to a minute to resume.
                  Retrying automatically — attempt {hydrateRetryCount}.
                </p>
              </>
            ) : (
              <p className="text-slate-600 font-medium">Loading data…</p>
            )}
          </div>
          ) : hydrateError ? (
            <div className="p-12 text-center flex flex-col items-center gap-4">
              {hydrateError.startsWith('Authentication') ? (
                <>
                  <div className="text-red-600 font-semibold text-lg">Authentication failed</div>
                  <p className="text-slate-500 text-sm max-w-md">
                    Your session could not be verified. Please sign in again to continue.
                  </p>
                  <button onClick={() => window.location.reload()} className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                    Reload &amp; sign in
                  </button>
                </>
              ) : (
                <>
                  <div className="text-red-600 font-semibold text-lg">Unable to connect to the database</div>
                  <p className="text-slate-500 text-sm max-w-md">
                    The database did not respond after several attempts. Please check your connection or try again.
                  </p>
                  <button onClick={hydrateFromApi} className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                    Try again
                  </button>
                </>
              )}
            </div>
        ) : (
          <>
            {activeTab === 'input' && <InputTab />}
            {activeTab === 'preview' && <LivePreviewTab />}
            {activeTab === 'inventory' && <InventoryTab />}
            {activeTab === 'trends' && <TrendsTab />}
            {activeTab === 'ai' && <AITab />}
            {activeTab === 'settings' && <SettingsTab />}
          </>
        )}
      </main>

    </div>
  );
};

export default NordicLogApp;
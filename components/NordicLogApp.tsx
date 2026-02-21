import React from 'react';
import { Factory, LayoutDashboard, BarChart3, Bot, FileInput, Package, Settings, Scale, Box, Layers } from 'lucide-react';
import { useStore } from '../store';
import { GlassCard } from './ui/GlassCard';
import { InputTab } from './tabs/InputTab';
import { LivePreviewTab } from './tabs/LivePreviewTab';
import { TrendsTab } from './tabs/TrendsTab';
import { AITab } from './tabs/AITab';
import { InventoryTab } from './tabs/InventoryTab';
import { SettingsTab } from './tabs/SettingsTab';

const NordicLogApp: React.FC = () => {
  const { activeTab, setActiveTab, hydrateFromApi } = useStore();
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    hydrateFromApi().finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col min-h-screen bg-slate-50">
      
      {/* Header & Nav */}
      <div className="p-2 md:p-4 shrink-0 z-50 sticky top-0">
        <GlassCard className="p-3 md:px-6 md:py-4 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4 shadow-md md:shadow-sm ring-1 ring-slate-900/5 backdrop-blur-xl bg-white/80">
          <div className="flex justify-between w-full md:w-auto items-center">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 rounded-lg p-2 text-white shadow-sm shrink-0">
                <Factory size={20} className="md:w-6 md:h-6" />
              </div>
              <div className="flex-1 md:flex-none">
                <h1 className="text-base md:text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  Nordic Proteins <span className="text-slate-400 font-light">PMS</span>
                </h1>
                <p className="text-[10px] md:text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                  Fractionation Plant 01 • Shift A
                </p>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="w-full md:w-auto overflow-x-auto pb-1 md:pb-0 -mx-1 px-1 scrollbar-hide">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-max md:w-auto">
              {[
                { id: 'input', label: 'Input', icon: FileInput },
                { id: 'preview', label: 'Live View', icon: LayoutDashboard },
                { id: 'inventory', label: 'Stock', icon: Package },
                { id: 'trends', label: 'Analytics', icon: BarChart3 },
                { id: 'ai', label: 'AI', icon: Bot },
                { id: 'settings', label: 'Database', icon: Settings },
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
      <main className="flex-1 relative px-2 md:px-4 pb-8">
        {loading ? <div className="p-6 text-center">Loading data...</div> : (
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
import React, { useState, useEffect } from 'react';
import { GlassCard } from './GlassCard';
import { useStore } from '../../store';

export const UserSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { userSettings, setUserSettings, resetUserSettings } = useStore();
  const [local, setLocal] = useState<any>(userSettings);

  useEffect(() => { setLocal(userSettings); }, [userSettings]);
  if (!isOpen) return null;

  const save = () => {
    setUserSettings(local);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <GlassCard className="p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold">User Settings</h3>
            <button onClick={onClose} className="text-slate-500">Close</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold">Plant Label</label>
              <input className="w-full p-2 border rounded mt-1" value={local.plantLabel || ''} onChange={e => setLocal((s:any)=>({ ...s, plantLabel: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold">Shift Label</label>
              <input className="w-full p-2 border rounded mt-1" value={local.shiftLabel || ''} onChange={e => setLocal((s:any)=>({ ...s, shiftLabel: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold">Default Stock View</label>
              <select className="w-full p-2 border rounded mt-1" value={local.defaultStockView} onChange={e => setLocal((s:any)=>({ ...s, defaultStockView: e.target.value }))}>
                <option value="kg">KG</option>
                <option value="pallets">Pallets</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold">Default Analytics Range</label>
              <select className="w-full p-2 border rounded mt-1" value={local.defaultAnalyticsRange} onChange={e => setLocal((s:any)=>({ ...s, defaultAnalyticsRange: e.target.value }))}>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="year">Year</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold">Date Format</label>
              <select className="w-full p-2 border rounded mt-1" value={local.dateFormat} onChange={e => setLocal((s:any)=>({ ...s, dateFormat: e.target.value }))}>
                <option value="ISO">ISO (YYYY-MM-DD)</option>
                <option value="US">US (MM/DD/YYYY)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={local.compactMode} onChange={e => setLocal((s:any)=>({ ...s, compactMode: e.target.checked }))} />
              <label className="text-xs font-bold">Compact Mode (reduce paddings)</label>
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { resetUserSettings(); onClose(); }} className="px-3 py-2 text-sm border rounded">Reset</button>
              <button onClick={save} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Save</button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default UserSettingsModal;

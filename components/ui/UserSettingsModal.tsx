import React, { useState, useEffect } from 'react';
import { GlassCard } from './GlassCard';
import { useStore } from '../../store';
import { useTranslation } from '../../i18n/useTranslation';

export const UserSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { userSettings, setUserSettings, resetUserSettings } = useStore();
  const [local, setLocal] = useState<any>(userSettings);
  const { t } = useTranslation();

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
            <h3 className="font-bold">{t('userSettings.title')}</h3>
            <button onClick={onClose} className="text-slate-500">{t('userSettings.close')}</button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold">{t('userSettings.plantLabel')}</label>
              <input className="w-full p-2 border rounded mt-1" value={local.plantLabel || ''} onChange={e => setLocal((s:any)=>({ ...s, plantLabel: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold">{t('userSettings.shiftLabel')}</label>
              <input className="w-full p-2 border rounded mt-1" value={local.shiftLabel || ''} onChange={e => setLocal((s:any)=>({ ...s, shiftLabel: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-bold">{t('userSettings.defaultStockView')}</label>
              <select className="w-full p-2 border rounded mt-1" value={local.defaultStockView} onChange={e => setLocal((s:any)=>({ ...s, defaultStockView: e.target.value }))}>
                <option value="kg">{t('userSettings.kgOption')}</option>
                <option value="pallets">{t('userSettings.palletsOption')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold">{t('userSettings.defaultAnalyticsRange')}</label>
              <select className="w-full p-2 border rounded mt-1" value={local.defaultAnalyticsRange} onChange={e => setLocal((s:any)=>({ ...s, defaultAnalyticsRange: e.target.value }))}>
                <option value="week">{t('userSettings.weekOption')}</option>
                <option value="month">{t('userSettings.monthOption')}</option>
                <option value="quarter">{t('userSettings.quarterOption')}</option>
                <option value="year">{t('userSettings.yearOption')}</option>
                <option value="all">{t('userSettings.allOption')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold">{t('userSettings.dateFormat')}</label>
              <select className="w-full p-2 border rounded mt-1" value={local.dateFormat} onChange={e => setLocal((s:any)=>({ ...s, dateFormat: e.target.value }))}>
                <option value="ISO">{t('userSettings.isoFormat')}</option>
                <option value="US">{t('userSettings.usFormat')}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={local.compactMode} onChange={e => setLocal((s:any)=>({ ...s, compactMode: e.target.checked }))} />
              <label className="text-xs font-bold">{t('userSettings.compactMode')}</label>
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { resetUserSettings(); onClose(); }} className="px-3 py-2 text-sm border rounded">{t('userSettings.reset')}</button>
              <button onClick={save} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">{t('userSettings.save')}</button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default UserSettingsModal;

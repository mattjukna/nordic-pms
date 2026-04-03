import React, { useMemo, useState } from 'react';
import { GlassCard } from './GlassCard';
import apiFetchBlob from '../../services/apiFetchBlob';
import { useTranslation } from '../../i18n/useTranslation';

const ALL_SHEETS = [
  // Operations (date-filtered)
  { key: 'intake', group: 'operations' },
  { key: 'production', group: 'operations' },
  { key: 'dispatch', group: 'operations' },
  { key: 'quality', group: 'operations' },
  { key: 'accounting', group: 'operations' },
  // Master data (full database)
  { key: 'suppliers', group: 'master' },
  { key: 'buyers', group: 'master' },
  { key: 'products', group: 'master' },
  { key: 'stock', group: 'master' },
  { key: 'quotas', group: 'master' },
] as const;

type SheetKey = typeof ALL_SHEETS[number]['key'];

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function ReportExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => toLocalDateStr(new Date()));

  // Sheet selection
  const [selectedSheets, setSelectedSheets] = useState<Set<SheetKey>>(
    () => new Set(ALL_SHEETS.filter(s => s.group === 'operations').map(s => s.key))
  );

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleSheet = (key: SheetKey) => {
    setSelectedSheets(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleGroup = (group: string) => {
    const groupKeys = ALL_SHEETS.filter(s => s.group === group).map(s => s.key);
    const allSelected = groupKeys.every(k => selectedSheets.has(k));
    setSelectedSheets(prev => {
      const next = new Set(prev);
      for (const k of groupKeys) allSelected ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const selectAll = () => setSelectedSheets(new Set(ALL_SHEETS.map(s => s.key)));
  const selectNone = () => setSelectedSheets(new Set());

  // Quick date presets
  const setPreset = (preset: string) => {
    const now = new Date();
    let s: Date;
    switch (preset) {
      case 'thisMonth': s = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'lastMonth': s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        setStartDate(toLocalDateStr(s));
        setEndDate(toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 0)));
        return;
      case 'thisQuarter': { const q = Math.floor(now.getMonth() / 3) * 3; s = new Date(now.getFullYear(), q, 1); break; }
      case 'thisYear': s = new Date(now.getFullYear(), 0, 1); break;
      case 'last90': s = new Date(now); s.setDate(s.getDate() - 90); break;
      default: return;
    }
    setStartDate(toLocalDateStr(s));
    setEndDate(toLocalDateStr(now));
  };

  const url = useMemo(() => {
    const sheets = Array.from(selectedSheets).join(',');
    return `/api/reports/export?from=${encodeURIComponent(startDate)}&to=${encodeURIComponent(endDate)}&sheets=${encodeURIComponent(sheets)}`;
  }, [startDate, endDate, selectedSheets]);

  async function onGenerate() {
    if (selectedSheets.size === 0) { setErr(t('reportExport.noSheetsSelected')); return; }
    setErr(null);
    setLoading(true);
    try {
      const { blob, filename } = await apiFetchBlob(url);
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob as any);
      a.href = objUrl;
      a.download = filename || `NordicPMS_export_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const operationsSheets = ALL_SHEETS.filter(s => s.group === 'operations');
  const masterSheets = ALL_SHEETS.filter(s => s.group === 'master');
  const opsAllSelected = operationsSheets.every(s => selectedSheets.has(s.key));
  const masterAllSelected = masterSheets.every(s => selectedSheets.has(s.key));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4">
      <GlassCard className="w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-lg">{t('reportExport.title')}</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        {/* Date range */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">{t('reportExport.dateRange')}</div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {(['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear', 'last90'] as const).map(p => (
              <button key={p} onClick={() => setPreset(p)} className="px-2.5 py-1 text-xs font-bold rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
                {t(`reportExport.preset_${p}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-200 rounded-md px-3 py-1.5 text-sm" />
            <span className="text-slate-400">→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-200 rounded-md px-3 py-1.5 text-sm" />
          </div>
        </div>

        {/* Sheet selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700">{t('reportExport.dataToExport')}</div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">{t('reportExport.selectAll')}</button>
              <button onClick={selectNone} className="text-xs text-slate-500 hover:underline">{t('reportExport.selectNone')}</button>
            </div>
          </div>

          {/* Operations group */}
          <div className="mb-3">
            <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
              <input type="checkbox" checked={opsAllSelected} onChange={() => toggleGroup('operations')} className="rounded" />
              <span className="text-sm font-semibold text-slate-600">{t('reportExport.groupOperations')}</span>
              <span className="text-[10px] text-slate-400">{t('reportExport.dateFiltered')}</span>
            </label>
            <div className="ml-6 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {operationsSheets.map(s => (
                <label key={s.key} className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                  <input type="checkbox" checked={selectedSheets.has(s.key)} onChange={() => toggleSheet(s.key)} className="rounded" />
                  {t(`reportExport.sheet_${s.key}`)}
                </label>
              ))}
            </div>
          </div>

          {/* Master data group */}
          <div>
            <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
              <input type="checkbox" checked={masterAllSelected} onChange={() => toggleGroup('master')} className="rounded" />
              <span className="text-sm font-semibold text-slate-600">{t('reportExport.groupMaster')}</span>
              <span className="text-[10px] text-slate-400">{t('reportExport.fullDatabase')}</span>
            </label>
            <div className="ml-6 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {masterSheets.map(s => (
                <label key={s.key} className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                  <input type="checkbox" checked={selectedSheets.has(s.key)} onChange={() => toggleSheet(s.key)} className="rounded" />
                  {t(`reportExport.sheet_${s.key}`)}
                </label>
              ))}
            </div>
          </div>
        </div>

        {err ? <div className="mb-3 text-sm text-red-700 whitespace-pre-wrap">{err}</div> : null}

        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 rounded border text-sm" onClick={onClose} disabled={loading}>{t('reportExport.cancel')}</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold disabled:opacity-60" onClick={onGenerate} disabled={loading || selectedSheets.size === 0}>
            {loading ? t('reportExport.generating') : t('reportExport.generateExcel')}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

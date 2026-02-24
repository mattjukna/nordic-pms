import React, { useMemo, useState } from 'react';
import { GlassCard } from './GlassCard';
import apiFetchBlob from '../../services/apiFetchBlob';

type ReportKind = 'full' | 'accounting' | 'intake' | 'production' | 'dispatch' | 'quality';

export default function ReportExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [report, setReport] = useState<ReportKind>('full');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const url = useMemo(() => `/api/reports/monthly?month=${encodeURIComponent(month)}&report=${encodeURIComponent(report)}`, [month, report]);

  async function onGenerate() {
    setErr(null);
    setLoading(true);
    try {
      const { blob, filename } = await apiFetchBlob(url);
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob as any);
      a.href = objUrl;
      a.download = filename || `NordicPMS_${report}_${month}.xlsx`;
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

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4">
      <GlassCard className="w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-lg">Export monthly report</div>
          <button className="text-slate-500 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="mb-1 text-slate-600">Month</div>
            <input className="w-full border rounded p-2" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-slate-600">Report type</div>
            <select className="w-full border rounded p-2" value={report} onChange={(e) => setReport(e.target.value as ReportKind)}>
              <option value="full">Full workbook (all sheets)</option>
              <option value="accounting">Accounting (monthly overview)</option>
              <option value="intake">Intake (detailed)</option>
              <option value="production">Production (detailed)</option>
              <option value="dispatch">Dispatch (detailed)</option>
              <option value="quality">Quality (detailed)</option>
            </select>
          </label>
        </div>

        {err ? <div className="mt-3 text-sm text-red-700 whitespace-pre-wrap">{err}</div> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button className="px-4 py-2 rounded border" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60" onClick={onGenerate} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Excel'}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

import React from 'react';
import { ProductionLogEntry } from '../types';
import { GlassCard } from './ui/GlassCard';
import { Clock, Package, Hash } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';

interface HistoryGridProps {
  history: ProductionLogEntry[];
}

const HistoryGrid: React.FC<HistoryGridProps> = ({ history }) => {
  const { t } = useTranslation();
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short'
    }).format(date);
  };

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

  if (history.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-white/40 italic">
        {t('historyGrid.noLogs')}
      </div>
    );
  }

  return (
    <div className="animate-slide-up w-full">
      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider text-gray-400">
                <th className="p-4 font-semibold"><div className="flex items-center gap-2"><Clock size={14} /> {t('historyGrid.time')}</div></th>
                <th className="p-4 font-semibold"><div className="flex items-center gap-2"><Hash size={14} /> {t('historyGrid.batchId')}</div></th>
                <th className="p-4 font-semibold"><div className="flex items-center gap-2"><Package size={14} /> {t('historyGrid.product')}</div></th>
                <th className="p-4 font-semibold text-right">{t('historyGrid.totalKg')}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {history.map((entry, index) => (
                <tr 
                  key={entry.id} 
                  className={`
                    border-b border-white/5 hover:bg-white/5 transition-colors
                    ${index === 0 ? 'bg-blue-500/10' : ''} 
                  `}
                >
                  <td className="p-4 font-mono text-blue-200">{formatDate(new Date(entry.timestamp))}</td>
                  <td className="p-4 text-white/70">{entry.batchId || 'PENDING'}</td>
                  <td className="p-4 font-medium text-white">
                    <span className="bg-white/10 px-2 py-1 rounded text-xs mr-2 border border-white/10">
                      {entry.productId}
                    </span>
                    {entry.productName}
                  </td>
                  <td className="p-4 text-right font-mono text-lg font-bold text-green-300">
                    {formatNumber(entry.totalKg)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
      
      <div className="mt-4 text-center text-xs text-white/30 uppercase tracking-widest">
        {t('historyGrid.showingLast', { count: String(history.length) })}
      </div>
    </div>
  );
};

export default HistoryGrid;
import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { GlassCard } from '../ui/GlassCard';
import { Bot, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export const AITab: React.FC = () => {
  const { generateAIInsights, alerts } = useStore();
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Auto-generate on mount if empty
    if (!insight) {
      handleGenerate();
    }
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    const result = await generateAIInsights();
    setInsight(result);
    setLoading(false);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Left: Alerts Stream */}
      <div className="w-full md:w-1/3 flex flex-col gap-4">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold flex items-center gap-2 px-1">
          <AlertTriangle size={14} /> System Signals
        </h3>
        <div className="space-y-3">
          {alerts.map(alert => (
            <div key={alert.id} className={`p-4 rounded-lg border text-sm shadow-sm ${
              alert.type === 'danger' ? 'bg-red-50 border-red-200 text-red-800' :
              alert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-xs uppercase opacity-70">{new Date(alert.timestamp).toLocaleTimeString()}</span>
              </div>
              {alert.message}
            </div>
          ))}
        </div>
      </div>

      {/* Right: AI Narrative */}
      <div className="w-full md:w-2/3 flex flex-col gap-4 min-h-[400px]">
         <div className="flex items-center justify-between px-1">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold flex items-center gap-2">
              <Bot size={14} /> AI Operations Assistant
            </h3>
            <button 
              onClick={handleGenerate}
              disabled={loading}
              className="text-xs bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-all shadow-sm flex items-center gap-2 font-medium"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} className="text-purple-600"/>}
              Refresh Analysis
            </button>
         </div>

         <GlassCard className="p-6 md:p-8 bg-white border-purple-100 relative">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                <Loader2 size={40} className="animate-spin mb-4 text-purple-600" />
                <p className="animate-pulse text-sm font-medium">Analyzing mass balance...</p>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none text-slate-600 prose-headings:text-slate-900 prose-strong:text-slate-800">
                {insight ? <ReactMarkdown>{insight}</ReactMarkdown> : <p className="text-slate-400 italic">No insights generated yet.</p>}
              </div>
            )}
         </GlassCard>
      </div>
    </div>
  );
};
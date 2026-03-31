import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hint?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick, hint }) => {
  const compact = typeof document !== 'undefined' && !!document.querySelector('.compact');
  const [hintOpen, setHintOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div 
      onClick={onClick}
      onDoubleClick={hint ? (e) => { e.preventDefault(); setHintOpen(true); } : undefined}
      onTouchStart={hint ? () => { timerRef.current = setTimeout(() => setHintOpen(true), 500); } : undefined}
      onTouchEnd={hint ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
      onTouchMove={hint ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
      className={`
        bg-white border border-gray-200 shadow-sm rounded-xl text-slate-900 transition-all duration-300
        ${className}
        ${compact ? ' p-2' : ''}
      `}
    >
      {children}
      {hint && hintOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={(e) => { e.stopPropagation(); setHintOpen(false); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="relative bg-white border border-slate-200 rounded-xl shadow-2xl p-5 mx-6 max-w-sm pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
              <button onClick={(e) => { e.stopPropagation(); setHintOpen(false); }} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={14} />
              </button>
              <div className="flex items-start gap-2.5">
                <HelpCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed pr-4">{hint}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
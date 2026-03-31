import React, { useState, useRef, useCallback, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HintOverlayProps {
  hint: string;
  children: React.ReactNode;
  className?: string;
}

export const Hintable: React.FC<HintOverlayProps> = ({ hint, children, className = '' }) => {
  const [open, setOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(true);
  }, []);

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setOpen(true), 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {children}

      {open && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-slate-900/30 rounded-xl pointer-events-auto" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-slate-200 rounded-xl shadow-2xl p-4 mx-4 max-w-sm pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
            <button onClick={() => setOpen(false)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={14} />
            </button>
            <div className="flex items-start gap-2.5">
              <HelpCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed pr-4">{hint}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

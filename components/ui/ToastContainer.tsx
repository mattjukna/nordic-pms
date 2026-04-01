import React, { useEffect, useState } from 'react';
import { X, Undo2, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { useToastStore, Toast } from '../../toastStore';

const iconMap = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const removeToast = useToastStore((s) => s.removeToast);
  const [progress, setProgress] = useState(100);
  const Icon = iconMap[toast.type];

  useEffect(() => {
    if (toast.duration <= 0) return;
    const start = Date.now();
    const frame = () => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(pct);
      if (pct > 0) requestAnimationFrame(frame);
    };
    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [toast.duration]);

  return (
    <div className={`relative overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm ${colorMap[toast.type]} animate-slide-up`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon size={18} className="shrink-0" />
        <span className="text-sm font-medium flex-1">{toast.message}</span>
        {toast.action && (
          <button
            onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md bg-white/80 hover:bg-white border border-current/20 transition-colors"
          >
            <Undo2 size={12} /> {toast.action.label}
          </button>
        )}
        <button onClick={() => removeToast(toast.id)} className="p-0.5 hover:bg-black/5 rounded">
          <X size={14} />
        </button>
      </div>
      {toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 h-0.5 bg-current/20 transition-none" style={{ width: `${progress}%` }} />
      )}
    </div>
  );
};

const ToastContainer: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
};

export default ToastContainer;

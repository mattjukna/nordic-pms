
import React, { useState } from 'react';
import { AlertTriangle, Lock, CheckCircle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  isDanger?: boolean; // Red button for deletes
  requireAuth?: boolean; // Requires password
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isDanger = false,
  requireAuth = false
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (requireAuth) {
      const expected = (import.meta as any).env?.VITE_ADMIN_PASSWORD;
      if (!expected || password !== expected) {
        setError('Incorrect Admin Password');
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      resetAndClose();
    } catch (err: any) {
      setError(err?.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden ring-1 ring-white/50">
        
        {/* Header */}
        <div className={`p-4 border-b flex items-center gap-3 ${isDanger ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
          <div className={`p-2 rounded-full ${isDanger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
            {requireAuth ? <Lock size={20} /> : <AlertTriangle size={20} />}
          </div>
          <h3 className={`font-bold ${isDanger ? 'text-red-900' : 'text-slate-800'}`}>{title}</h3>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4">{message}</p>
          
          {requireAuth && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Admin Password</label>
              <input 
                type="password" 
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Enter password to override..."
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoFocus
              />
            </div>
          )}
          {error && <p className="text-xs text-red-600 font-bold mt-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-100 flex gap-3 justify-end">
          <button 
            onClick={resetAndClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition-all transform active:scale-95 ${
              loading ? 'opacity-60 cursor-not-allowed' :
              isDanger || requireAuth ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Saving…' : requireAuth ? 'Authorize & Proceed' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

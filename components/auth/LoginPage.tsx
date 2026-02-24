import React from 'react';
import { GlassCard } from '../ui/GlassCard';
import { msalInstance } from '../../auth/msalInstance';
import { loginRequest, getAuthConfigErrors } from '../../auth/msalConfig';

export const LoginPage: React.FC<{ unauthorizedEmail?: string }> = ({ unauthorizedEmail }) => {
  const configErrors = getAuthConfigErrors();
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <GlassCard className="p-8 max-w-sm text-center">
        <h2 className="text-2xl font-bold mb-2">Nordic Proteins PMS</h2>
        <p className="text-sm text-slate-500 mb-6">Please sign in with your Microsoft account to continue.</p>
        {configErrors.length > 0 ? (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800 text-left">
            <strong>Configuration missing:</strong>
            <ul className="mt-2 list-disc list-inside">
              {configErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {unauthorizedEmail ? (
          <div className="mb-4 text-red-600">Unauthorized domain: {unauthorizedEmail}</div>
        ) : null}
        <button
          onClick={() => msalInstance.loginRedirect(loginRequest)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-bold"
          disabled={configErrors.length > 0}
        >
          Sign in with Microsoft
        </button>
        {unauthorizedEmail ? (
          <div className="text-xs text-slate-500 mt-3">If you believe this is an error, sign out and try with an allowed account.</div>
        ) : null}
      </GlassCard>
    </div>
  );
};

export default LoginPage;

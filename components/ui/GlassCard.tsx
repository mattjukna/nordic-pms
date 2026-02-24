import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick }) => {
  const compact = typeof document !== 'undefined' && !!document.querySelector('.compact');
  return (
    <div 
      onClick={onClick}
      className={`
        bg-white
        border border-gray-200
        shadow-sm
        rounded-xl
        text-slate-900
        transition-all duration-300
        ${className}
        ${compact ? ' p-2' : ''}
      `}
    >
      {children}
    </div>
  );
};
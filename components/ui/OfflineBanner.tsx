import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const { t } = useTranslation();

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[300] bg-amber-500 text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-2 shadow-lg">
      <WifiOff size={16} />
      {t('offline.message')}
    </div>
  );
};

export default OfflineBanner;

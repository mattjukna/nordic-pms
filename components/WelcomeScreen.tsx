import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation';

const getGreetingKey = (): 'greeting' | 'greetingAfternoon' | 'greetingEvening' => {
  const hour = new Date().getHours();
  if (hour < 12) return 'greeting';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
};

const WelcomeScreen: React.FC<{ userName?: string; onContinue: () => void }> = ({ userName, onContinue }) => {
  const { t } = useTranslation();
  const displayName = userName ? userName.split('@')[0] : '';

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img src="/logo.png" alt="Nordic Insights" className="h-20 md:h-28 drop-shadow-md" />
        </div>

        {/* Greeting */}
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800">
            {t(`welcome.${getGreetingKey()}`)}
            {displayName && <span className="text-blue-600">, {displayName}</span>}
          </h1>
          <p className="text-slate-500 text-lg">{t('welcome.subtitle')}</p>
        </div>

        {/* Date */}
        <div className="text-sm text-slate-400 font-medium">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>

        <p className="text-slate-500">{t('welcome.todaySummary')}</p>

        {/* Continue button */}
        <button
          onClick={onContinue}
          className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
        >
          {t('welcome.continueButton')}
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default WelcomeScreen;

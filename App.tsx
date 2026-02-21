import React from 'react';
import NordicLogApp from './components/NordicLogApp';

const App: React.FC = () => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8">
      <NordicLogApp />
    </div>
  );
};

export default App;
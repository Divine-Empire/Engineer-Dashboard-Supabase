import React, { useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import Providers from './app/providers';
import AppRoutes from './app/routes';
import { initializeStorage } from './utils/storageManager';

function App() {
  useEffect(() => {
    initializeStorage();
  }, []);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Providers>
        <AppRoutes />
      </Providers>
    </Router>
  );
}

export default App;
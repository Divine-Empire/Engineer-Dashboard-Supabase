import React, { createContext, useContext, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export default function Providers({ children }) {
  // Force light theme permanently
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => {} }}>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      {children}
    </ThemeContext.Provider>
  );
}

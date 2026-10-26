import React, { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// One client for the app: list pages fetch one server page per request, so a
// short stale window is enough to make tab/page switches feel instant without
// showing old data after a submit (writers call invalidateQueries).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function Providers({ children }) {
  // Force light theme permanently
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      {children}
    </QueryClientProvider>
  );
}

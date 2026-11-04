import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      // retry transient failures only; a 4xx (missing endpoint, no access) won't fix itself
      retry: (count: number, error: any) => !(error?.response?.status >= 400 && error?.response?.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});

// A tab left open across an update asks for page files that no longer exist (blank page): load the new version once.
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('dbi_reloaded_for_update')) return; // never loop
    sessionStorage.setItem('dbi_reloaded_for_update', '1');
    setTimeout(() => sessionStorage.removeItem('dbi_reloaded_for_update'), 15_000);
  } catch { /* storage blocked: reload anyway */ }
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <ThemeProvider>
            <AuthProvider>
              <App />
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </TooltipProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
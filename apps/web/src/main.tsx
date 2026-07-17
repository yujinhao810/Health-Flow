import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AuthProvider } from './hooks/useAuth';
import { router } from './router';
import { initializeThemeDocument, ThemeProvider } from './theme/ThemeProvider';
import './styles.css';

const queryClient = new QueryClient();
initializeThemeDocument();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AuthProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
          </ThemeProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);

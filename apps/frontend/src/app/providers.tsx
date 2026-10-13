'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-provider';
import { ThemeProvider } from '@/lib/theme-provider';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Proactively warm up backend service on initial client session mount
    fetch('/api/backend/health', { method: 'GET' }).catch(() => {});
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
            retry: (failureCount, error: any) => {
              if (error?.response?.status === 401 || error?.response?.status === 403) {
                return false;
              }
              return failureCount < 3;
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <AuthProvider>
          {children}
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
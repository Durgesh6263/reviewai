'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { onboardingTracker } from '@/lib/onboarding-tracker';
import type { User } from '@reviewai/types';

interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

interface AuthContextType {
  user: User | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  business_name?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user && !!tokens?.access_token;

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedTokens = localStorage.getItem('auth_tokens');
        const storedUser = localStorage.getItem('auth_user');

        if (storedTokens && storedUser) {
          const parsedTokens = JSON.parse(storedTokens);
          const parsedUser = JSON.parse(storedUser);

          // Check if access token is expired
          const expiresAt = parsedTokens.expires_at || (parsedTokens.expires_in ? Date.now() + parsedTokens.expires_in * 1000 : 0);
          const isExpired = expiresAt > 0 && Date.now() >= expiresAt;

          if (isExpired && parsedTokens.refresh_token) {
            // Try to refresh tokens
            try {
              const response = await api.post('/auth/refresh', {
                refresh_token: parsedTokens.refresh_token,
              }) as { success: boolean; data: AuthTokens };
              const newTokens = response.data;
              localStorage.setItem('auth_tokens', JSON.stringify(newTokens));
              setTokens(newTokens);
              setUser(parsedUser);
            } catch {
              // Refresh failed, clear auth
              clearAuth();
            }
          } else {
            setTokens(parsedTokens);
            setUser(parsedUser);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        clearAuth();
      } finally {
        setIsLoading(false);

        // Check onboarding after auth init
        if (typeof window !== 'undefined') {
          checkOnboardingRedirect(window.location.pathname);
        }
      }
    };

    initAuth();
  }, []);

  // Listen for route changes to check onboarding
  useEffect(() => {
    const handleRouteChange = () => {
      checkOnboardingRedirect(window.location.pathname);
    };

    // Listen to popstate events
    window.addEventListener('popstate', handleRouteChange);

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [user, isLoading]);

  const clearAuth = () => {
    localStorage.removeItem('auth_tokens');
    localStorage.removeItem('auth_user');
    setTokens(null);
    setUser(null);
  };

  // Check onboarding status after auth is initialized
  const checkOnboardingRedirect = async (pathname: string) => {
    if (!user || isLoading) return;

    // Skip onboarding check for admin users and these paths
    if (user.role === 'admin') return;
    const skipPaths = ['/login', '/register', '/forgot-password', '/verify-email', '/reset-password', '/onboarding', '/r/', '/admin'];
    if (skipPaths.some(p => pathname.startsWith(p))) return;

    try {
      const progress = await onboardingTracker.getProgress();

      // If onboarding not completed and not on onboarding page, redirect
      if (progress && progress.current_step !== 'completed') {
        if (!pathname.startsWith('/onboarding')) {
          window.location.href = '/onboarding';
        }
      }
      // If onboarding completed but on onboarding page, redirect to dashboard
      else if (progress?.current_step === 'completed' && pathname.startsWith('/onboarding')) {
        window.location.href = '/dashboard';
      }
    } catch (error) {
      console.error('Onboarding check failed:', error);
    }
  };

  const saveAuth = (newTokens: AuthTokens, newUser: User) => {
    const tokensWithExpiry: AuthTokens = {
      ...newTokens,
      expires_at: newTokens.expires_at || (Date.now() + ((newTokens as any).expires_in || 900) * 1000),
    };
    localStorage.setItem('auth_tokens', JSON.stringify(tokensWithExpiry));
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    setTokens(tokensWithExpiry);
    setUser(newUser);
  };

  const login = async (email: string, password: string) => {
    const response = await api.post<{ success: boolean; data: { user: User; tokens: AuthTokens } }>('/auth/login', { email, password });
    const { user: newUser, tokens: newTokens } = response.data;
    saveAuth(newTokens, newUser);

    // Check onboarding after login
    if (typeof window !== 'undefined') {
      checkOnboardingRedirect(window.location.pathname);
    }
  };

  const register = async (data: RegisterData) => {
    const response = await api.post<{ success: boolean; data: { user: User; tokens: AuthTokens } }>('/auth/register', data);
    const { user: newUser, tokens: newTokens } = response.data;
    saveAuth(newTokens, newUser);

    // Check onboarding after register
    if (typeof window !== 'undefined') {
      checkOnboardingRedirect(window.location.pathname);
    }
  };

  const logout = async () => {
    try {
      if (tokens?.refresh_token) {
        await api.post('/auth/logout', { refresh_token: tokens.refresh_token });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
    }
  };

  const refreshTokens = async () => {
    if (!tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    const response = await api.post<{ success: boolean; data: AuthTokens }>('/auth/refresh', {
      refresh_token: tokens.refresh_token,
    });
    const newTokens = response.data;
    localStorage.setItem('auth_tokens', JSON.stringify(newTokens));
    setTokens(newTokens);
  };

  const refreshUser = async () => {
    if (!tokens?.access_token) {
      throw new Error('No access token available');
    }
    const response = await api.get<{ success: boolean; data: User }>('/auth/me');
    const newUser = response.data;
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    setUser(newUser);
  };

  const updateUser = (updatedUser: Partial<User>) => {
    if (user) {
      const newUser = { ...user, ...updatedUser };
      localStorage.setItem('auth_user', JSON.stringify(newUser));
      setUser(newUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        isLoading,
        isAuthenticated,
        login,
        register,
        logout,
        refreshTokens,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
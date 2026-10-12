import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '@/lib/auth-provider';
import { safeLocalStorage } from '@/lib/storage';

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // When executing in a browser on any production or deployed domain,
    // always use same-origin relative URL /api/v1. Next.js rewrites in next.config.js
    // proxy this to the backend server-to-server.
    // This completely eliminates:
    // 1. Cross-Origin Resource Sharing (CORS) preflight round-trips
    // 2. Safari / WebKit Cross-Origin-Resource-Policy (CORP) blocking
    // 3. iOS Safari ITP (Intelligent Tracking Prevention) third-party network restrictions
    // 4. Mobile carrier DNS & content-filtering blocks on cloud hosting domains
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return '/api/v1';
    }
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    const envUrl = process.env.NEXT_PUBLIC_API_URL.trim();
    return envUrl.endsWith('/api/v1') ? envUrl : `${envUrl}/api/v1`;
  }
  return 'http://localhost:4000/api/v1';
};

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: getApiBaseUrl(),
      timeout: 12000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: false,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Skip auth tokens for public QR and review routes
        if (
          config.url?.includes('/r/') ||
          config.url?.includes('/review/sessions') ||
          config.url?.includes('/review/submit')
        ) {
          return config;
        }

        try {
          const tokens = safeLocalStorage.getItem('auth_tokens');
          if (tokens) {
            const parsed = JSON.parse(tokens);
            if (parsed.access_token) {
              config.headers.Authorization = `Bearer ${parsed.access_token}`;
            }
          }
        } catch {
          // Safeguard against token parsing errors
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean; _retryCount?: number }) | undefined;
        if (!originalRequest) {
          return Promise.reject(error);
        }

        const isPublicReviewRoute =
          originalRequest.url?.includes('/r/') ||
          originalRequest.url?.includes('/review/');

        // For public customer review routes: handle transient network/5xx drops with one fast retry
        if (isPublicReviewRoute) {
          // Do NOT retry 4xx errors (e.g. 403 SUBSCRIPTION_EXPIRED, 404 BUSINESS_NOT_FOUND)
          if (error.response && error.response.status >= 400 && error.response.status < 500) {
            return Promise.reject(error);
          }

          const retryCount = (originalRequest as any)._retryCount || 0;
          const isTransientNetworkError =
            !error.response ||
            error.response.status >= 500 ||
            error.code === 'ECONNABORTED' ||
            error.message === 'Network Error';

          if (isTransientNetworkError && retryCount < 1) {
            (originalRequest as any)._retryCount = retryCount + 1;
            await new Promise((resolve) => setTimeout(resolve, 600));
            return this.client(originalRequest);
          }

          return Promise.reject(error);
        }

        // Don't retry auth endpoints
        if (originalRequest.url?.includes('/auth/')) {
          return Promise.reject(error);
        }

        // Handle 401 - try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.refreshAccessToken();
            // Retry original request with new token
            const tokens = localStorage.getItem('auth_tokens');
            if (tokens) {
              const parsed = JSON.parse(tokens);
              originalRequest.headers.Authorization = `Bearer ${parsed.access_token}`;
            }
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed, redirect to login (unless on public review page)
            this.clearAuthAndRedirect();
            return Promise.reject(refreshError);
          }
        }

        // Handle 403 ACCOUNT_DEACTIVATED
        if (error.response?.status === 403 && (error.response?.data as any)?.code === 'ACCOUNT_DEACTIVATED') {
          const storedUser = localStorage.getItem('auth_user');
          if (storedUser) {
            try {
              const u = JSON.parse(storedUser);
              u.account_status = 'deactivated';
              localStorage.setItem('auth_user', JSON.stringify(u));
            } catch {}
          }
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin')) {
            window.location.href = '/dashboard';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessToken(): Promise<void> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const tokens = safeLocalStorage.getItem('auth_tokens');
      if (!tokens) {
        throw new Error('No tokens available');
      }

      const parsed = JSON.parse(tokens);
      if (!parsed.refresh_token) {
        throw new Error('No refresh token available');
      }

      const response = await axios.post(`${getApiBaseUrl()}/auth/refresh`, {
        refresh_token: parsed.refresh_token,
      });

      const newTokens = response.data.data;
      safeLocalStorage.setItem('auth_tokens', JSON.stringify(newTokens));
    })();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private clearAuthAndRedirect() {
    safeLocalStorage.removeItem('auth_tokens');
    safeLocalStorage.removeItem('auth_user');
    if (typeof window !== 'undefined') {
      // Public review pages must NEVER redirect customer to login
      if (
        window.location.pathname.startsWith('/r/') ||
        window.location.pathname.startsWith('/review/')
      ) {
        return;
      }
      window.location.href = '/login';
    }
  }

  // HTTP methods
  async get<T>(url: string, config = {}) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data = {}, config = {}) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data = {}, config = {}) {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data = {}, config = {}) {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config = {}) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export const api = new ApiClient();

// React hook for using the API client with auth
export function useApi() {
  const { tokens, refreshTokens } = useAuth();

  return {
    get: api.get.bind(api),
    post: api.post.bind(api),
    patch: api.patch.bind(api),
    put: api.put.bind(api),
    delete: api.delete.bind(api),
  };
}
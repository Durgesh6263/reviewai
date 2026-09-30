/**
 * ReviewAI API Client
 * Type-safe API client for all backend endpoints
 */

import type {
  Business,
  BusinessInsert,
  BusinessUpdate,
  QRCode,
  QRCodeInsert,
  QRCodeUpdate,
  ReviewSession,
  ReviewSessionInsert,
  User,
  UserRole,
  Subscription,
  SubscriptionPlan,
} from '@reviewai/types';

// ============================================================================
// Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface BusinessListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface QRCodeListParams {
  page?: number;
  limit?: number;
  businessId?: string;
  status?: string;
  search?: string;
}

export interface ReviewSessionCreate {
  qrCodeId: string;
  language: string;
}

export interface ReviewSessionRating {
  rating: number;
}

export interface ReviewSessionGenerate {
  tone?: 'professional' | 'casual' | 'enthusiastic' | 'detailed';
  length?: 'short' | 'medium' | 'long';
}

export interface ReviewSessionEdit {
  reviewText: string;
}

export interface AnalyticsParams {
  businessId?: string;
  qrCodeId?: string;
  startDate?: string;
  endDate?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface SubscriptionCreate {
  planId: string;
  paymentMethodId?: string;
}

export interface CheckoutSessionRequest {
  planId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingPortalRequest {
  returnUrl: string;
}

// Admin types
export interface AdminBusinessListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  plan?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AdminQRCodeListParams {
  page?: number;
  limit?: number;
  businessId?: string;
  status?: string;
  search?: string;
}

export interface AdminAnalyticsParams {
  startDate?: string;
  endDate?: string;
  granularity?: 'day' | 'week' | 'month';
  businessId?: string;
}

export interface AdminSubscriptionListParams {
  page?: number;
  limit?: number;
  status?: string;
  plan?: string;
  businessId?: string;
}

export interface AdminSettingsUpdate {
  key: string;
  value: unknown;
  description?: string;
}

export interface AdminJobParams {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: string; latency?: number; error?: string }>;
  timestamp: string;
}

export interface SystemStatsResponse {
  users: { total: number; active: number; newToday: number };
  businesses: { total: number; active: number; trial: number };
  subscriptions: { active: number; pastDue: number; cancelled: number; revenue: number };
  qrCodes: { total: number; active: number; scansToday: number };
  reviews: { total: number; completedToday: number; conversionRate: number };
}

export interface RecentActivityResponse {
  id: string;
  type: string;
  description: string;
  userId?: string;
  businessId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ============================================================================
// API Client Class
// ============================================================================

export class ReviewAIApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl: string = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      // If unauthorized and we have a refresh token, try to refresh
      if (response.status === 401 && this.refreshToken && !endpoint.includes('/auth/refresh')) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Retry the original request
          return this.request(endpoint, options);
        }
      }
      throw new ApiError(data.error || 'Request failed', response.status, data.code, data.details);
    }

    return data;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        this.accessToken = data.data.accessToken;
        this.refreshToken = data.data.refreshToken;
        return true;
      }
    } catch {
      // Ignore refresh errors
    }

    this.clearTokens();
    return false;
  }

  // ========================================================================
  // Auth Endpoints
  // ========================================================================

  async login(credentials: LoginRequest): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(data: RegisterRequest): Promise<ApiResponse<{ user: User; tokens: AuthTokens }>> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async refresh(refreshToken: string): Promise<ApiResponse<AuthTokens>> {
    return this.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout(): Promise<ApiResponse<void>> {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async forgotPassword(data: ForgotPasswordRequest): Promise<ApiResponse<void>> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async resetPassword(data: ResetPasswordRequest): Promise<ApiResponse<void>> {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyEmail(token: string): Promise<ApiResponse<void>> {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async resendVerification(email: string): Promise<ApiResponse<void>> {
    return this.request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async getMe(): Promise<ApiResponse<User>> {
    return this.request('/auth/me');
  }

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    return this.request('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // ========================================================================
  // Business Endpoints
  // ========================================================================

  async getBusinesses(params: BusinessListParams = {}): Promise<ApiResponse<PaginatedResponse<Business>>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/businesses?${searchParams.toString()}`);
  }

  async getBusiness(id: string): Promise<ApiResponse<Business>> {
    return this.request(`/businesses/${id}`);
  }

  async createBusiness(data: BusinessInsert): Promise<ApiResponse<Business>> {
    return this.request('/businesses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBusiness(id: string, data: BusinessUpdate): Promise<ApiResponse<Business>> {
    return this.request(`/businesses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBusiness(id: string): Promise<ApiResponse<void>> {
    return this.request(`/businesses/${id}`, { method: 'DELETE' });
  }

  async getBusinessBySlug(slug: string): Promise<ApiResponse<Business>> {
    return this.request(`/businesses/slug/${slug}`);
  }

  // ========================================================================
  // QR Code Endpoints
  // ========================================================================

  async getQRCodes(params: QRCodeListParams = {}): Promise<ApiResponse<PaginatedResponse<QRCode>>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/qr-codes?${searchParams.toString()}`);
  }

  async getQRCode(id: string): Promise<ApiResponse<QRCode>> {
    return this.request(`/qr-codes/${id}`);
  }

  async createQRCode(data: QRCodeInsert): Promise<ApiResponse<QRCode>> {
    return this.request('/qr-codes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateQRCode(id: string, data: QRCodeUpdate): Promise<ApiResponse<QRCode>> {
    return this.request(`/qr-codes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteQRCode(id: string): Promise<ApiResponse<void>> {
    return this.request(`/qr-codes/${id}`, { method: 'DELETE' });
  }

  async getQRCodeBySlug(slug: string): Promise<ApiResponse<QRCode>> {
    return this.request(`/qr-codes/slug/${slug}`);
  }

  async incrementQRCodeScans(id: string): Promise<ApiResponse<{ scans: number }>> {
    return this.request(`/qr-codes/${id}/increment-scans`, { method: 'POST' });
  }

  // ========================================================================
  // Review Session Endpoints (Customer Flow)
  // ========================================================================

  async createReviewSession(data: ReviewSessionCreate): Promise<ApiResponse<ReviewSession>> {
    return this.request('/review/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getReviewSession(id: string): Promise<ApiResponse<ReviewSession>> {
    return this.request(`/review/sessions/${id}`);
  }

  async submitRating(sessionId: string, rating: number): Promise<ApiResponse<ReviewSession>> {
    return this.request(`/review/sessions/${sessionId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  }

  async generateReview(sessionId: string, options?: ReviewSessionGenerate): Promise<ApiResponse<ReviewSession>> {
    return this.request(`/review/sessions/${sessionId}/generate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  }

  async editReview(sessionId: string, reviewText: string): Promise<ApiResponse<ReviewSession>> {
    return this.request(`/review/sessions/${sessionId}/edit`, {
      method: 'POST',
      body: JSON.stringify({ reviewText }),
    });
  }

  async completeReview(sessionId: string): Promise<ApiResponse<{ redirectUrl: string }>> {
    return this.request(`/review/sessions/${sessionId}/complete`, { method: 'POST' });
  }

  // ========================================================================
  // Analytics Endpoints
  // ========================================================================

  async getBusinessAnalytics(businessId: string, params: AnalyticsParams = {}): Promise<ApiResponse<unknown>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/analytics/business/${businessId}?${searchParams.toString()}`);
  }

  async getQRCodeAnalytics(qrCodeId: string, params: AnalyticsParams = {}): Promise<ApiResponse<unknown>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/analytics/qr-code/${qrCodeId}?${searchParams.toString()}`);
  }

  async getRealtimeMetrics(businessId: string): Promise<ApiResponse<unknown>> {
    return this.request(`/analytics/realtime/${businessId}`);
  }

  async getConversionFunnel(businessId: string, params: AnalyticsParams = {}): Promise<ApiResponse<unknown>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/analytics/funnel/${businessId}?${searchParams.toString()}`);
  }

  // ========================================================================
  // Subscription Endpoints
  // ========================================================================

  async getSubscription(): Promise<ApiResponse<Subscription>> {
    return this.request('/subscriptions/current');
  }

  async createCheckoutSession(data: CheckoutSessionRequest): Promise<ApiResponse<{ url: string; sessionId: string }>> {
    return this.request('/subscriptions/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createBillingPortalSession(data: BillingPortalRequest): Promise<ApiResponse<{ url: string }>> {
    return this.request('/subscriptions/billing-portal', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getInvoices(params: { page?: number; limit?: number } = {}): Promise<ApiResponse<PaginatedResponse<unknown>>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/subscriptions/invoices?${searchParams.toString()}`);
  }

  async cancelSubscription(immediately = false): Promise<ApiResponse<Subscription>> {
    return this.request('/subscriptions/cancel', {
      method: 'POST',
      body: JSON.stringify({ immediately }),
    });
  }

  async reactivateSubscription(): Promise<ApiResponse<Subscription>> {
    return this.request('/subscriptions/reactivate', { method: 'POST' });
  }

  async getPlans(): Promise<ApiResponse<SubscriptionPlan[]>> {
    return this.request('/subscriptions/plans');
  }

  // ========================================================================
  // Admin Endpoints
  // ========================================================================

  async adminGetBusinesses(params: AdminBusinessListParams = {}): Promise<ApiResponse<PaginatedResponse<Business>>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/admin/businesses?${searchParams.toString()}`);
  }

  async adminUpdateBusiness(id: string, data: Partial<Business>): Promise<ApiResponse<Business>> {
    return this.request(`/admin/businesses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async adminDeleteBusiness(id: string): Promise<ApiResponse<void>> {
    return this.request(`/admin/businesses/${id}`, { method: 'DELETE' });
  }

  async adminGetQRCodes(params: AdminQRCodeListParams = {}): Promise<ApiResponse<PaginatedResponse<QRCode>>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/admin/qr-codes?${searchParams.toString()}`);
  }

  async adminUpdateQRCode(id: string, data: Partial<QRCode>): Promise<ApiResponse<QRCode>> {
    return this.request(`/admin/qr-codes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async adminDeleteQRCode(id: string): Promise<ApiResponse<void>> {
    return this.request(`/admin/qr-codes/${id}`, { method: 'DELETE' });
  }

  async adminGetAnalytics(params: AdminAnalyticsParams = {}): Promise<ApiResponse<unknown>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/admin/analytics?${searchParams.toString()}`);
  }

  async adminGetSubscriptions(params: AdminSubscriptionListParams = {}): Promise<ApiResponse<PaginatedResponse<Subscription>>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/admin/subscriptions?${searchParams.toString()}`);
  }

  async adminGetSubscriptionStats(): Promise<ApiResponse<unknown>> {
    return this.request('/admin/subscriptions/stats');
  }

  async adminUpdateSubscription(id: string, data: Partial<Subscription>): Promise<ApiResponse<Subscription>> {
    return this.request(`/admin/subscriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async adminCancelSubscription(id: string, immediately = false): Promise<ApiResponse<Subscription>> {
    return this.request(`/admin/subscriptions/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ immediately }),
    });
  }

  async adminReactivateSubscription(id: string): Promise<ApiResponse<Subscription>> {
    return this.request(`/admin/subscriptions/${id}/reactivate`, { method: 'POST' });
  }

  async adminGetSystemHealth(): Promise<ApiResponse<SystemHealthResponse>> {
    return this.request('/admin/system/health');
  }

  async adminGetSystemStats(): Promise<ApiResponse<SystemStatsResponse>> {
    return this.request('/admin/system/stats');
  }

  async adminGetBackgroundJobs(params: AdminJobParams = {}): Promise<ApiResponse<PaginatedResponse<unknown>>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/admin/system/jobs?${searchParams.toString()}`);
  }

  async adminGetSettings(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request('/admin/settings');
  }

  async adminUpdateSettings(data: AdminSettingsUpdate[]): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings: data }),
    });
  }

  async adminGetStats(): Promise<ApiResponse<unknown>> {
    return this.request('/admin/stats');
  }

  async adminGetRecentActivity(params: { limit?: number; offset?: number } = {}): Promise<ApiResponse<RecentActivityResponse[]>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    return this.request(`/admin/recent-activity?${searchParams.toString()}`);
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let apiClientInstance: ReviewAIApiClient | null = null;

export function createApiClient(baseUrl?: string): ReviewAIApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new ReviewAIApiClient(baseUrl);
  }
  return apiClientInstance;
}

export function getApiClient(): ReviewAIApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new ReviewAIApiClient();
  }
  return apiClientInstance;
}

export function setApiClientTokens(accessToken: string, refreshToken: string): void {
  getApiClient().setTokens(accessToken, refreshToken);
}

export function clearApiClientTokens(): void {
  getApiClient().clearTokens();
}
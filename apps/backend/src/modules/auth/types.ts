/**
 * Authentication Module Types
 * ReviewAI SaaS Platform
 */

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'admin' | 'business_owner' | 'staff';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: 'Bearer';
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
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

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface TokenPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// JWTPayload extends TokenPayload for future extensibility
export type JWTPayload = TokenPayload & Record<string, unknown>;

export const AUTH_CONSTANTS = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  EMAIL_VERIFICATION_EXPIRY: '24h',
  PASSWORD_RESET_EXPIRY: '1h',
  BCRYPT_ROUNDS: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: '15m',
} as const;

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 100,
  business_owner: 50,
  staff: 10,
} as const;

export const PERMISSIONS = {
  // Business permissions
  'business:create': ['admin', 'business_owner'] as UserRole[],
  'business:read': ['admin', 'business_owner', 'staff'] as UserRole[],
  'business:update': ['admin', 'business_owner'] as UserRole[],
  'business:delete': ['admin', 'business_owner'] as UserRole[],

  // QR Code permissions
  'qr:create': ['admin', 'business_owner', 'manager'] as UserRole[],
  'qr:read': ['admin', 'business_owner', 'staff'] as UserRole[],
  'qr:update': ['admin', 'business_owner', 'manager'] as UserRole[],
  'qr:delete': ['admin', 'business_owner'] as UserRole[],

  // Review permissions
  'review:read': ['admin', 'business_owner', 'staff'] as UserRole[],
  'review:export': ['admin', 'business_owner'] as UserRole[],

  // Analytics permissions
  'analytics:read': ['admin', 'business_owner', 'staff'] as UserRole[],
  'analytics:export': ['admin', 'business_owner'] as UserRole[],

  // Subscription permissions
  'subscription:read': ['admin', 'business_owner'] as UserRole[],
  'subscription:manage': ['admin', 'business_owner'] as UserRole[],

  // Staff permissions
  'staff:invite': ['admin', 'business_owner'] as UserRole[],
  'staff:manage': ['admin', 'business_owner'] as UserRole[],
  'staff:remove': ['admin', 'business_owner'] as UserRole[],

  // Admin permissions
  'admin:users': ['admin'] as UserRole[],
  'admin:businesses': ['admin'] as UserRole[],
  'admin:revenue': ['admin'] as UserRole[],
  'admin:audit': ['admin'] as UserRole[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(userRole);
}

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
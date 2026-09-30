/**
 * Authentication Module Service
 * ReviewAI SaaS Platform
 * Core authentication business logic
 */

import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  User,
  UserRole,
  AuthTokens,
  TokenPayload,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  AUTH_CONSTANTS,
  PERMISSIONS,
  hasPermission,
  Permission,
} from './types';
import { AppError, AuthenticationError, ValidationError, NotFoundError, ConflictError } from '../../shared/exceptions';
import { logger } from '../../shared/logger';

export class AuthService {
  private accountStatusCache = new Map<string, { status: 'active' | 'deactivated'; expiresAt: number }>();
  private loginAttemptsMap = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private supabase: SupabaseClient,
    private jwtSecret: string,
    private jwtRefreshSecret: string
  ) {}

  invalidateAccountStatusCache(userId?: string): void {
    if (userId) {
      this.accountStatusCache.delete(userId);
    } else {
      this.accountStatusCache.clear();
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const { email, password, full_name } = data;

    // Check if user already exists
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .is('deleted_at', null)
      .single();

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, AUTH_CONSTANTS.BCRYPT_ROUNDS);

    // Generate email verification token
    const email_verification_token = crypto.randomBytes(32).toString('hex');

    // Create user
    const { data: user, error } = await this.supabase
      .from('users')
      .insert({
        email,
        password_hash,
        full_name,
        role: 'business_owner',
        email_verification_token,
        email_verified: false,
      })
      .select()
      .single();

    if (error || !user) {
      throw new AppError('Failed to create user', 500, 'USER_CREATION_FAILED');
    }

    // TODO: Send verification email
    // await this.emailService.sendVerificationEmail(email, email_verification_token);

    // Generate tokens
    const tokens = this.generateTokens(user as User);

    // Store refresh token hash in database (optional, for revocation)
    await this.storeRefreshToken(user.id, tokens.refresh_token);

    return {
      user: this.sanitizeUser(user as User),
      tokens,
    };
  }

  /**
   * Login user with email and password
   */
  async login(data: LoginRequest, ipAddress?: string): Promise<AuthResponse> {
    const email = data.email.trim().toLowerCase();
    const { password } = data;

    // Check if account is temporarily locked due to excessive failed attempts
    if (this.isAccountLocked(email)) {
      throw new AuthenticationError('Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.');
    }

    // Get user by email with case-insensitive lookup
    const { data: users, error } = await this.supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      logger.error({ err: error.message, code: (error as any).code }, 'Database error during user login query');
      throw new AppError('Authentication service temporarily unavailable. Please verify database connection.', 503, 'SERVICE_UNAVAILABLE');
    }

    const user = users && users.length > 0 ? users[0] : null;
    if (!user) {
      this.incrementLoginAttempts(email);
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if account has been deactivated by administrator
    const isDeactivated = (user as any).account_status === 'deactivated' || user.pilot_cohort === 'status:deactivated';
    if (isDeactivated) {
      throw new AppError('Your account has been deactivated by an administrator. Please contact support.', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      this.incrementLoginAttempts(email);
      throw new AuthenticationError('Invalid email or password');
    }

    // Check if email verification is required (admins bypass requirement)
    if (user.role !== 'admin' && !user.email_verified && process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
      throw new AppError('Please verify your email address before signing in. Check your inbox for the verification link.', 403, 'EMAIL_NOT_VERIFIED');
    }

    // Reset login attempts upon successful password verification
    this.resetLoginAttempts(email);

    // Generate tokens immediately
    const tokens = this.generateTokens(user);

    // Run post-login updates asynchronously without blocking response
    void this.supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Cache active account status
    this.accountStatusCache.set(user.id, { status: 'active', expiresAt: Date.now() + 60_000 });

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    // Verify refresh token
    let payload: TokenPayload;
    try {
      payload = jwt.verify(refreshToken, this.jwtRefreshSecret) as TokenPayload;
    } catch {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    // Check if refresh token exists in database (not revoked)
    const { data: storedToken } = await this.supabase
      .from('refresh_tokens')
      .select('id')
      .eq('user_id', payload.sub)
      .eq('token_hash', this.hashToken(refreshToken))
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!storedToken) {
      throw new AuthenticationError('Refresh token revoked or expired');
    }

    // Get user
    const { data: user } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', payload.sub)
      .is('deleted_at', null)
      .single();

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Generate new tokens
    const tokens = this.generateTokens(user);

    // Rotate refresh token - delete old, store new
    await this.supabase.from('refresh_tokens').delete().eq('id', storedToken.id);
    await this.storeRefreshToken(user.id, tokens.refresh_token);

    return tokens;
  }

  /**
   * Logout user - revoke refresh token
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Revoke specific token
      await this.supabase
        .from('refresh_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token_hash', this.hashToken(refreshToken));
    } else {
      // Revoke all tokens for user
      await this.supabase.from('refresh_tokens').delete().eq('user_id', userId);
    }
  }

  /**
   * Request password reset
   */
  async forgotPassword(email: string): Promise<void> {
    const { data: user } = await this.supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .is('deleted_at', null)
      .single();

    // Always return success to prevent email enumeration
    if (!user) return;

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.supabase
      .from('users')
      .update({
        password_reset_token: resetToken,
        password_reset_expires: expiresAt.toISOString(),
      })
      .eq('id', user.id);

    // TODO: Send password reset email
    // await this.emailService.sendPasswordResetEmail(email, resetToken);
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { data: user } = await this.supabase
      .from('users')
      .select('id')
      .eq('password_reset_token', token)
      .gt('password_reset_expires', new Date().toISOString())
      .is('deleted_at', null)
      .single();

    if (!user) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const password_hash = await bcrypt.hash(newPassword, AUTH_CONSTANTS.BCRYPT_ROUNDS);

    await this.supabase
      .from('users')
      .update({
        password_hash,
        password_reset_token: null,
        password_reset_expires: null,
      })
      .eq('id', user.id);

    // Revoke all refresh tokens on password reset
    await this.supabase.from('refresh_tokens').delete().eq('user_id', user.id);
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<void> {
    const { data: user } = await this.supabase
      .from('users')
      .select('id')
      .eq('email_verification_token', token)
      .is('deleted_at', null)
      .single();

    if (!user) {
      throw new ValidationError('Invalid verification token');
    }

    await this.supabase
      .from('users')
      .update({
        email_verified: true,
        email_verification_token: null,
      })
      .eq('id', user.id);
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const { data: user } = await this.supabase
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .is('deleted_at', null)
      .single();

    if (!user) {
      throw new NotFoundError('User');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    const password_hash = await bcrypt.hash(newPassword, AUTH_CONSTANTS.BCRYPT_ROUNDS);

    await this.supabase
      .from('users')
      .update({ password_hash })
      .eq('id', userId);

    // Revoke all refresh tokens on password change
    await this.supabase.from('refresh_tokens').delete().eq('user_id', userId);
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: { full_name?: string; avatar_url?: string | null }): Promise<User> {
    const { data: user, error } = await this.supabase
      .from('users')
      .update(data)
      .eq('id', userId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !user) {
      throw new NotFoundError('User');
    }

    return this.sanitizeUser(user);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const { data: user } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .is('deleted_at', null)
      .single();

    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Verify access token and return payload
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as TokenPayload;
      if (payload.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
      }
      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Access token expired');
      }
      throw new AuthenticationError('Invalid access token');
    }
  }

  /**
   * Check if user has permission
   */
  async checkPermission(userId: string, permission: Permission): Promise<boolean> {
    const { data: user } = await this.supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .is('deleted_at', null)
      .single();

    if (!user) return false;

    return hasPermission(user.role as UserRole, permission);
  }

  /**
   * Generate JWT tokens
   */
  private generateTokens(user: User): AuthTokens {
    const accessPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    const refreshPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    };

    const access_token = jwt.sign(accessPayload, this.jwtSecret, {
      expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRY,
    });

    const refresh_token = jwt.sign(refreshPayload, this.jwtRefreshSecret, {
      expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY,
    });

    // Calculate expires_in from access token
    const decoded = jwt.decode(access_token) as { exp: number };
    const expires_in = decoded.exp - Math.floor(Date.now() / 1000);
    const expires_at = decoded.exp ? decoded.exp * 1000 : Date.now() + 900 * 1000;

    return {
      access_token,
      refresh_token,
      expires_in: Math.max(expires_in, 0),
      expires_at,
      token_type: 'Bearer',
    };
  }

  /**
   * Store refresh token hash in database
   */
  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.supabase.from('refresh_tokens').insert({
      user_id: userId,
      token_hash: this.hashToken(refreshToken),
      expires_at: expiresAt.toISOString(),
    });
  }

  /**
   * Hash token for storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Sanitize user object (remove sensitive fields)
   */
  private sanitizeUser(user: any): User {
    const { password_hash, email_verification_token, password_reset_token, password_reset_expires, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Track failed login attempt
   */
  private async trackFailedLogin(email: string, ipAddress?: string): Promise<void> {
    this.incrementLoginAttempts(email);
  }

  /**
   * Check if account is locked
   */
  private isAccountLocked(identifier: string): boolean {
    const record = this.loginAttemptsMap.get(identifier);
    if (!record) return false;
    if (Date.now() > record.lockedUntil) {
      this.loginAttemptsMap.delete(identifier);
      return false;
    }
    return record.count >= AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS;
  }

  /**
   * Increment login attempts
   */
  private incrementLoginAttempts(identifier: string): void {
    const record = this.loginAttemptsMap.get(identifier) || { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= AUTH_CONSTANTS.MAX_LOGIN_ATTEMPTS) {
      record.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 minutes lockout
      logger.warn({ identifier }, 'Account temporarily locked due to excessive failed login attempts');
    }
    this.loginAttemptsMap.set(identifier, record);
  }

  /**
   * Check if a user's account is currently active or deactivated (cached in-memory for 60s)
   */
  async getUserAccountStatus(userId: string): Promise<'active' | 'deactivated'> {
    // Return cached status if still fresh
    const cached = this.accountStatusCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.status;
    }

    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .is('deleted_at', null)
        .single();

      if (!user) {
        this.accountStatusCache.set(userId, { status: 'deactivated', expiresAt: Date.now() + 60_000 });
        return 'deactivated';
      }

      const isDeact = (user as any).account_status === 'deactivated' || user.pilot_cohort === 'status:deactivated';
      const status: 'active' | 'deactivated' = isDeact ? 'deactivated' : 'active';
      this.accountStatusCache.set(userId, { status, expiresAt: Date.now() + 60_000 });
      return status;
    } catch {
      return 'active';
    }
  }

  /**
   * Reset login attempts
   */
  private resetLoginAttempts(identifier: string): void {
    this.loginAttemptsMap.delete(identifier);
  }
}
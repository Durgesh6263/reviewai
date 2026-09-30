/**
 * Authentication Module Controller
 * ReviewAI SaaS Platform
 * HTTP request handlers for authentication endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from './service';
import {
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailInput,
  ChangePasswordInput,
  UpdateProfileInput,
} from './validators';
import { ApiResponse } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/exceptions';

export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /auth/register
   * Register a new business owner
   */
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data: RegisterInput = req.body;
      const result = await this.authService.register(data);
      ApiResponse.created(res, result, 'Registration successful. Please verify your email.');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /auth/login
   * Login with email and password
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data: LoginInput = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await this.authService.login(data, ipAddress);
      ApiResponse.ok(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data: RefreshTokenInput = req.body;
      const tokens = await this.authService.refreshToken(data.refresh_token);
      ApiResponse.ok(res, tokens, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /auth/logout
   * Logout and revoke refresh token
   */
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.sub;
      const refreshToken = req.body.refresh_token;

      if (!userId) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      await this.authService.logout(userId, refreshToken);
      ApiResponse.ok(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /auth/forgot-password
   * Request password reset email
   */
  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data: ForgotPasswordInput = req.body;
      await this.authService.forgotPassword(data.email);
      // Always return success to prevent email enumeration
      ApiResponse.ok(res, null, 'If the email exists, a password reset link has been sent');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /auth/reset-password
   * Reset password with token
   */
  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data: ResetPasswordInput = req.body;
      await this.authService.resetPassword(data.token, data.password);
      ApiResponse.ok(res, null, 'Password reset successful');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /auth/verify-email
   * Verify email address
   */
  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data: VerifyEmailInput = req.body;
      await this.authService.verifyEmail(data.token);
      ApiResponse.ok(res, null, 'Email verified successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /auth/change-password
   * Change password (authenticated)
   */
  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.sub;
      const data: ChangePasswordInput = req.body;

      if (!userId) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      await this.authService.changePassword(userId, data.current_password, data.new_password);
      ApiResponse.ok(res, null, 'Password changed successfully. Please login again.');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /auth/me
   * Get current user profile
   */
  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.sub;

      if (!userId) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      const user = await this.authService.getUserById(userId);
      if (!user) {
        throw new AppError('User not found', 404, 'USER_NOT_FOUND');
      }

      ApiResponse.ok(res, { user }, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /auth/me
   * Update current user profile
   */
  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.sub;
      const data: UpdateProfileInput = req.body;

      if (!userId) {
        throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
      }

      const user = await this.authService.updateProfile(userId, data);
      ApiResponse.ok(res, { user }, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  };
}
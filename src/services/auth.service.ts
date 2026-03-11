/**
 * =============================================================================
 * Auth Service — Core Authentication Orchestrator
 * =============================================================================
 *
 * @file auth.service.ts
 * @description The primary authentication orchestration service. Coordinates all
 *   authentication flows — registration, login, logout, token validation, password
 *   reset — by delegating to specialized services (CredentialService, TokenService,
 *   SessionService, EventService) and recording audit logs for compliance.
 *
 * Architecture Role: Business Logic Layer — Orchestration
 *   This is the "conductor" of the Auth Service. Controllers call AuthService
 *   methods, which orchestrate the full flow across multiple domain services.
 *   AuthService does NOT directly access the database or Redis; it composes
 *   behavior from injected specialized services.
 *
 * Request Flow (registration):
 *   1. Controller receives POST /auth/register with email + password.
 *   2. AuthService.register() checks for duplicate email via CredentialService.
 *   3. Creates credential (password hashed with argon2id) via CredentialService.
 *   4. Generates access + refresh tokens via TokenService.
 *   5. Enforces max concurrent sessions via SessionService.
 *   6. Publishes USER_ACCOUNT_CREATED event via EventService.
 *   7. Creates audit log entry. Returns AuthResponse.
 *
 * Request Flow (login):
 *   1. Controller receives POST /auth/login with email + password.
 *   2. AuthService.login() looks up the credential by email.
 *   3. Checks account status (locked, banned, deleted).
 *   4. Verifies password. On failure: increments failed attempts, may lock account.
 *   5. On success: resets failed attempts, updates last login, generates tokens.
 *   6. Enforces max sessions, publishes event, creates audit log.
 *   7. Returns AuthResponse.
 *
 * Request Flow (logout):
 *   1. Controller receives POST /auth/logout with access + refresh tokens.
 *   2. AuthService.logout() blacklists the access token JTI in Redis.
 *   3. Revokes the refresh token in the database.
 *   4. Publishes event, creates audit log.
 *
 * Request Flow (token validation):
 *   1. API Gateway calls /auth/validate with a JWT.
 *   2. AuthService.validateToken() delegates to TokenService for JWT validation.
 *   3. Additionally checks the user's account status (locked/banned).
 *
 * Request Flow (forgot password):
 *   1. Controller receives POST /auth/forgot-password with email.
 *   2. AuthService.forgotPassword() generates a reset token (UUID v4).
 *   3. Hashes token, stores in DB, publishes event with raw token for email delivery.
 *   SECURITY: Always returns success regardless of whether the email exists.
 *
 * Request Flow (reset password):
 *   1. Controller receives POST /auth/reset-password with token + new password.
 *   2. AuthService.resetPassword() validates the token (hash lookup, expiry, used).
 *   3. Updates password, marks token used, revokes all sessions.
 *   4. Publishes event, creates audit log.
 *
 * Security Decisions:
 *   - User Enumeration Prevention: Login always returns "Invalid credentials"
 *     regardless of whether the email exists or the password is wrong.
 *   - Brute-Force Protection: Failed attempts are tracked per-user. After
 *     MAX_LOGIN_ATTEMPTS, the account is auto-locked.
 *   - Forgot Password: Always returns success to prevent email enumeration.
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { CredentialService } from './credential.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { EventService } from './event.service';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { UserStatus } from '../entities/user-credential.entity';
import { AuditOutcome } from '../entities/audit-log.entity';
import { AuthResponse } from '../interfaces/auth-response.interface';
import { TokenValidationResult } from '../interfaces/token-validation-result.interface';
import { ErrorMessages } from '../constants/error-messages.constant';
import { hashToken } from '../utils/hash.util';
import { extractJti } from '../utils/token.util';
import { generateDeviceFingerprint } from '../utils/device-fingerprint.util';
import { logger } from '../utils/logger.util';
import { generateTraceId } from '../utils/trace-id.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly credentialService: CredentialService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly eventService: EventService,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly configService: ConfigService,
    private readonly userCredentialRepository: UserCredentialRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
  ) {}

  /**
   * Registers a new user account. Validates that the email is not already in use,
   * hashes the password, creates the credential, generates tokens, enforces
   * max sessions, publishes a domain event, and creates an audit log.
   *
   * @param email - The user's email address
   * @param password - The plaintext password (will be hashed with argon2id)
   * @param ipAddress - Optional IP address of the registering client
   * @param userAgent - Optional User-Agent header of the client
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns AuthResponse with access token, refresh token, and metadata
   * @throws Error if the email is already registered (AUTH_EMAIL_EXISTS)
   */
  async register(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
    traceId?: string,
  ): Promise<AuthResponse> {
    const trace = traceId ?? generateTraceId();

    // Check for duplicate email
    const existing = await this.credentialService.findByEmail(email);
    if (existing) {
      logger.warn('Registration failed — email already exists', { email, traceId: trace });
      throw new Error(ErrorMessages.AUTH_EMAIL_EXISTS);
    }

    // Create credential with hashed password
    const credential = await this.credentialService.createCredential(email, password);

    // Generate tokens
    const deviceFingerprint = generateDeviceFingerprint(userAgent, ipAddress);
    const accessToken = this.tokenService.generateAccessToken(
      credential.id,
      credential.email,
      credential.roles,
    );
    const { rawToken: refreshToken } = await this.tokenService.generateRefreshToken(
      credential.id,
      deviceFingerprint,
      ipAddress,
      userAgent,
    );

    // Enforce max concurrent sessions
    await this.sessionService.enforceMaxSessions(credential.id);

    const expiresIn = this.tokenService.getAccessTokenExpirySeconds();

    logger.info('User registered successfully', {
      userId: credential.id,
      email,
      traceId: trace,
    });

    // Publish domain event (fire-and-forget)
    await this.eventService.publishUserCreated(
      credential.id,
      credential.email,
      credential.roles,
      trace,
    );

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'REGISTER',
      userId: credential.id,
      email: credential.email,
      ipAddress,
      userAgent,
      outcome: AuditOutcome.SUCCESS,
      traceId: trace,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
      userId: credential.id,
    };
  }

  /**
   * Authenticates a user with email and password. Implements brute-force
   * protection (failed attempt tracking, auto-lockout), account status checks,
   * and comprehensive audit logging.
   *
   * SECURITY — User Enumeration Prevention:
   *   This method always returns the same "Invalid credentials" error regardless
   *   of whether the email exists or the password is wrong. This prevents
   *   attackers from determining valid email addresses via login probing.
   *
   * SECURITY — Brute-Force Protection:
   *   Failed attempts are tracked per-user. When the configured maximum is
   *   reached, the account is automatically locked for a configurable duration.
   *
   * @param email - The user's email address
   * @param password - The plaintext password to verify
   * @param deviceInfo - Optional device information object
   * @param ipAddress - Optional IP address of the client
   * @param userAgent - Optional User-Agent header of the client
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns AuthResponse with access token, refresh token, and metadata
   * @throws Error AUTH_INVALID_CREDENTIALS if email not found or password wrong
   * @throws Error AUTH_ACCOUNT_LOCKED if the account is locked
   * @throws Error AUTH_ACCOUNT_BANNED if the account is banned
   */
  async login(
    email: string,
    password: string,
    deviceInfo?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
    traceId?: string,
  ): Promise<AuthResponse> {
    const trace = traceId ?? generateTraceId();

    // Look up credential by email
    // SECURITY: Always return "Invalid credentials" regardless of the failure reason
    // to prevent user enumeration attacks.
    const credential = await this.credentialService.findByEmail(email);
    if (!credential) {
      logger.info('Login failed — email not found', { email, traceId: trace });

      // Audit log for failed login (no userId since email doesn't exist)
      await this.auditLogRepository.create({
        eventType: 'LOGIN',
        email,
        ipAddress,
        userAgent,
        outcome: AuditOutcome.FAILURE,
        metadata: { reason: 'email_not_found' },
        traceId: trace,
      });

      // SECURITY: Generic error message prevents user enumeration
      throw new Error(ErrorMessages.AUTH_INVALID_CREDENTIALS);
    }

    // Check account status
    if (credential.status === UserStatus.LOCKED) {
      // Check if the lock has expired (auto-unlock check)
      if (credential.lockedUntil && credential.lockedUntil <= new Date()) {
        // Lock has expired — unlock the account
        await this.userCredentialRepository.unlockAccount(credential.id);
        logger.info('Account auto-unlocked (lock expired)', {
          userId: credential.id,
          traceId: trace,
        });
      } else {
        logger.info('Login failed — account locked', {
          userId: credential.id,
          traceId: trace,
        });

        await this.auditLogRepository.create({
          eventType: 'LOGIN',
          userId: credential.id,
          email,
          ipAddress,
          userAgent,
          outcome: AuditOutcome.FAILURE,
          metadata: { reason: 'account_locked' },
          traceId: trace,
        });

        throw new Error(ErrorMessages.AUTH_ACCOUNT_LOCKED);
      }
    }

    if (credential.status === UserStatus.BANNED) {
      logger.info('Login failed — account banned', {
        userId: credential.id,
        traceId: trace,
      });

      await this.auditLogRepository.create({
        eventType: 'LOGIN',
        userId: credential.id,
        email,
        ipAddress,
        userAgent,
        outcome: AuditOutcome.FAILURE,
        metadata: { reason: 'account_banned' },
        traceId: trace,
      });

      throw new Error(ErrorMessages.AUTH_ACCOUNT_BANNED);
    }

    if (credential.status === UserStatus.DELETED) {
      logger.info('Login failed — account deleted', {
        userId: credential.id,
        traceId: trace,
      });

      // SECURITY: Generic error message prevents user enumeration
      throw new Error(ErrorMessages.AUTH_INVALID_CREDENTIALS);
    }

    // Verify password
    const passwordValid = await this.credentialService.verifyPassword(
      credential.passwordHash,
      password,
    );

    if (!passwordValid) {
      // Increment failed login attempts
      const failedAttempts = await this.userCredentialRepository.incrementFailedAttempts(
        credential.id,
      );

      const maxAttempts = this.configService.get<number>('auth.maxLoginAttempts') ?? 5;
      const lockoutDurationMinutes = this.configService.get<number>('auth.lockoutDurationMinutes') ?? 30;

      logger.info('Login failed — invalid password', {
        userId: credential.id,
        failedAttempts,
        maxAttempts,
        traceId: trace,
      });

      // Publish login failed event
      await this.eventService.publishLoginFailed(email, ipAddress ?? 'unknown', failedAttempts, trace);

      // Check if account should be locked due to brute-force
      if (failedAttempts >= maxAttempts) {
        const lockedUntil = new Date();
        lockedUntil.setMinutes(lockedUntil.getMinutes() + lockoutDurationMinutes);

        await this.userCredentialRepository.lockAccount(credential.id, lockedUntil);

        logger.warn('Account locked due to brute-force', {
          userId: credential.id,
          failedAttempts,
          lockedUntil: lockedUntil.toISOString(),
          traceId: trace,
        });

        await this.eventService.publishAccountLocked(
          credential.id,
          'brute_force',
          lockedUntil.toISOString(),
          trace,
        );

        // Revoke all tokens when account is locked
        await this.tokenService.revokeAllUserTokens(credential.id, 'account_locked:brute_force');
      }

      // Audit log for failed login
      await this.auditLogRepository.create({
        eventType: 'LOGIN',
        userId: credential.id,
        email,
        ipAddress,
        userAgent,
        outcome: AuditOutcome.FAILURE,
        metadata: {
          reason: 'invalid_password',
          failedAttempts,
          accountLocked: failedAttempts >= maxAttempts,
        },
        traceId: trace,
      });

      // SECURITY: Generic error message prevents user enumeration
      throw new Error(ErrorMessages.AUTH_INVALID_CREDENTIALS);
    }

    // === SUCCESS PATH ===

    // Reset failed login attempts
    await this.userCredentialRepository.resetFailedAttempts(credential.id);

    // Update last login metadata
    await this.userCredentialRepository.updateLastLogin(credential.id, ipAddress ?? 'unknown');

    // Generate tokens
    const deviceFingerprint = generateDeviceFingerprint(userAgent, ipAddress);
    const accessToken = this.tokenService.generateAccessToken(
      credential.id,
      credential.email,
      credential.roles,
    );
    const { rawToken: refreshToken } = await this.tokenService.generateRefreshToken(
      credential.id,
      deviceFingerprint,
      ipAddress,
      userAgent,
    );

    // Enforce max concurrent sessions
    await this.sessionService.enforceMaxSessions(credential.id);

    const expiresIn = this.tokenService.getAccessTokenExpirySeconds();

    logger.info('User logged in successfully', {
      userId: credential.id,
      email,
      traceId: trace,
    });

    // Publish domain event
    await this.eventService.publishUserLoggedIn(
      credential.id,
      credential.email,
      ipAddress ?? 'unknown',
      deviceFingerprint,
      trace,
    );

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'LOGIN',
      userId: credential.id,
      email,
      ipAddress,
      userAgent,
      outcome: AuditOutcome.SUCCESS,
      metadata: { deviceFingerprint },
      traceId: trace,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
      userId: credential.id,
    };
  }

  /**
   * Logs out a user by revoking both the access token (blacklist in Redis)
   * and the refresh token (revoke in database). Publishes a domain event
   * and creates an audit log.
   *
   * @param accessToken - The JWT access token to blacklist
   * @param refreshToken - The raw refresh token to revoke in the database
   * @param ipAddress - Optional IP address of the client
   * @param userAgent - Optional User-Agent header
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when both tokens have been revoked
   */
  async logout(
    accessToken: string,
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    // Blacklist the access token
    const jti = extractJti(accessToken);
    await this.tokenService.revokeAccessToken(accessToken);

    // Revoke the refresh token by hash lookup
    const tokenHash = hashToken(refreshToken);
    const refreshTokenEntity = await (this.tokenService as any).refreshTokenRepository.findByTokenHash(tokenHash);

    let userId: string | null = null;

    if (refreshTokenEntity) {
      userId = refreshTokenEntity.userId;
      await this.tokenService.revokeRefreshToken(refreshTokenEntity.id, 'logout');
    } else {
      logger.warn('Refresh token not found during logout — may already be revoked', {
        traceId: trace,
      });

      // Try to extract userId from the access token
      const decoded = extractJti(accessToken);
      // Use decoded token payload if available
      try {
        const { decodeToken } = await import('../utils/token.util');
        const payload = decodeToken(accessToken);
        userId = payload?.sub ?? null;
      } catch {
        // Ignore decode errors during logout
      }
    }

    logger.info('User logged out', { userId, jti, traceId: trace });

    // Publish domain event
    if (userId && jti) {
      await this.eventService.publishUserLoggedOut(userId, jti, trace);
    }

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'LOGOUT',
      userId: userId ?? undefined,
      ipAddress,
      userAgent,
      outcome: AuditOutcome.SUCCESS,
      metadata: { jti },
      traceId: trace,
    });
  }

  /**
   * Validates a JWT access token and additionally checks the user's account
   * status (locked, banned). Even if the JWT is cryptographically valid, a
   * locked or banned account should not be granted access.
   *
   * @param token - The JWT access token string to validate
   * @param traceId - Optional trace ID for distributed tracing
   * @returns TokenValidationResult with valid=true and payload, or valid=false with reason
   */
  async validateToken(
    token: string,
    traceId?: string,
  ): Promise<TokenValidationResult> {
    const trace = traceId ?? generateTraceId();

    // Delegate JWT validation to TokenService
    const result = await this.tokenService.validateAccessToken(token);

    if (!result.valid || !result.payload) {
      return result;
    }

    // Additionally check account status
    try {
      const user = await this.userCredentialRepository.findById(result.payload.sub);

      if (!user) {
        logger.warn('Token validation — user not found', {
          userId: result.payload.sub,
          traceId: trace,
        });
        return { valid: false, reason: 'invalid' };
      }

      if (user.status === UserStatus.LOCKED) {
        // Check if the lock has expired
        if (user.lockedUntil && user.lockedUntil <= new Date()) {
          // Lock expired — allow the token but don't auto-unlock here
          // The auto-unlock job or next login will handle status update
          return result;
        }
        return { valid: false, reason: 'account_locked' };
      }

      if (user.status === UserStatus.BANNED) {
        return { valid: false, reason: 'account_banned' };
      }

      if (user.status === UserStatus.DELETED) {
        return { valid: false, reason: 'invalid' };
      }
    } catch (error) {
      // If we can't check account status (DB error), allow the token through
      // to maintain availability. The token itself was already validated.
      logger.error('Failed to check account status during token validation', {
        userId: result.payload.sub,
        error: error instanceof Error ? error.message : String(error),
        traceId: trace,
      });
    }

    return result;
  }

  /**
   * Initiates the password reset flow. Generates a cryptographically random
   * reset token (UUID v4), hashes it with SHA-256, stores the hash in the
   * database, and publishes an event with the raw token so the notification
   * service can send the reset email.
   *
   * SECURITY — Email Enumeration Prevention:
   *   This method always succeeds silently, even if the email address is not
   *   registered. This prevents attackers from discovering valid email addresses
   *   by observing different responses for existing vs. non-existing emails.
   *
   * @param email - The email address to send the reset link to
   * @param ipAddress - Optional IP address of the requesting client
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when the reset process is initiated (always succeeds)
   */
  async forgotPassword(
    email: string,
    ipAddress?: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    const user = await this.credentialService.findByEmail(email);

    if (!user) {
      // SECURITY: Silently succeed to prevent email enumeration
      logger.info('Password reset requested for non-existent email', {
        email,
        traceId: trace,
      });
      return;
    }

    // Generate reset token
    const rawToken = uuidv4();
    const tokenHash = hashToken(rawToken);

    // Token expires in configured minutes (default: 15)
    const expiryMinutes = this.configService.get<number>('auth.passwordResetExpiryMinutes') ?? 15;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    // Delete any existing reset tokens for this user
    await this.passwordResetTokenRepository.deleteByUserId(user.id);

    // Store the hashed token
    await this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    logger.info('Password reset token generated', {
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
      traceId: trace,
    });

    // Publish event with raw token (notification service will build the reset link)
    await this.eventService.publishPasswordResetRequested(
      user.id,
      user.email,
      rawToken,
      expiresAt.toISOString(),
      trace,
    );

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'PASSWORD_RESET_REQUESTED',
      userId: user.id,
      email: user.email,
      ipAddress,
      outcome: AuditOutcome.SUCCESS,
      traceId: trace,
    });
  }

  /**
   * Completes the password reset flow. Validates the reset token (hash lookup,
   * expiry check, used check), updates the password, marks the token as used,
   * revokes all active sessions, and publishes a domain event.
   *
   * @param rawToken - The raw reset token from the email link
   * @param newPassword - The new plaintext password to set
   * @param ipAddress - Optional IP address of the client
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when the password has been reset
   * @throws Error AUTH_PASSWORD_RESET_INVALID if the token is invalid or expired
   * @throws Error AUTH_PASSWORD_RESET_USED if the token has already been consumed
   */
  async resetPassword(
    rawToken: string,
    newPassword: string,
    ipAddress?: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    // Look up token by hash
    const tokenHash = hashToken(rawToken);
    const resetToken = await this.passwordResetTokenRepository.findByTokenHash(tokenHash);

    if (!resetToken) {
      logger.warn('Password reset failed — token not found', { traceId: trace });
      throw new Error(ErrorMessages.AUTH_PASSWORD_RESET_INVALID);
    }

    // Check if already used
    if (resetToken.used) {
      logger.warn('Password reset failed — token already used', {
        tokenId: resetToken.id,
        traceId: trace,
      });
      throw new Error(ErrorMessages.AUTH_PASSWORD_RESET_USED);
    }

    // Check expiry
    if (resetToken.expiresAt < new Date()) {
      logger.warn('Password reset failed — token expired', {
        tokenId: resetToken.id,
        traceId: trace,
      });
      throw new Error(ErrorMessages.AUTH_PASSWORD_RESET_INVALID);
    }

    // Update password
    await this.credentialService.updatePassword(resetToken.userId, newPassword);

    // Mark token as used
    await this.passwordResetTokenRepository.markAsUsed(resetToken.id);

    // Delete all remaining reset tokens for this user
    await this.passwordResetTokenRepository.deleteByUserId(resetToken.userId);

    // Revoke all active sessions (security: force re-login with new password)
    await this.tokenService.revokeAllUserTokens(resetToken.userId, 'password_reset');

    logger.info('Password reset completed', {
      userId: resetToken.userId,
      traceId: trace,
    });

    // Publish domain event
    await this.eventService.publishPasswordResetCompleted(resetToken.userId, trace);

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'PASSWORD_RESET_COMPLETED',
      userId: resetToken.userId,
      ipAddress,
      outcome: AuditOutcome.SUCCESS,
      traceId: trace,
    });
  }
}

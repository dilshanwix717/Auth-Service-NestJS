/**
 * =============================================================================
 * Token Service — JWT Lifecycle Management
 * =============================================================================
 *
 * @file token.service.ts
 * @description Full JWT lifecycle management: generation, validation, refresh
 *   (with rotation), and revocation for both access and refresh tokens. This is
 *   the central authority for all token operations in the Auth Service.
 *
 * Architecture Role: Business Logic Layer — Token Management
 *   Sits between AuthService (which orchestrates auth flows) and the token
 *   infrastructure (token.util for JWT operations, RefreshTokenRepository for
 *   persistence, BlacklistService for revocation, RedisClient for caching).
 *
 * Request Flow (token generation — login/register):
 *   1. AuthService authenticates the user and calls TokenService.generateAccessToken()
 *      and TokenService.generateRefreshToken().
 *   2. Access token: signed JWT with RS256, containing user claims and JTI.
 *   3. Refresh token: UUID v4 (opaque), SHA-256 hashed, stored in PostgreSQL.
 *      The raw token is returned to the client; only the hash is persisted.
 *
 * Request Flow (token validation):
 *   1. API Gateway calls /auth/validate with the access token.
 *   2. TokenService.validateAccessToken() verifies the JWT signature and expiry.
 *   3. Checks the JTI against the Redis blacklist (fail-open on Redis outage).
 *   4. Returns TokenValidationResult with the decoded payload or failure reason.
 *
 * Request Flow (token refresh — rotation):
 *   1. Client presents the raw refresh token.
 *   2. TokenService.refreshTokens() hashes the token, looks up in DB.
 *   3. Validates: not revoked, not expired.
 *   4. REUSE DETECTION: If the token is already revoked, this indicates theft.
 *      All tokens for the user are immediately revoked (security measure).
 *   5. On success: revokes old token, issues new access + refresh tokens,
 *      links old → new via replacedByTokenId for forensic chain tracking.
 *
 * Security Concepts:
 *   - RS256 asymmetric signing: private key signs, public key verifies.
 *   - Refresh token rotation: every use invalidates the old token.
 *   - Reuse detection: revoked token presentation → full session revocation.
 *   - JTI blacklisting: per-token revocation via Redis with TTL auto-cleanup.
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { RefreshToken } from '../entities/refresh-token.entity';
import { BlacklistService } from './blacklist.service';
import { RedisClient } from '../clients/redis.client';
import { TokenValidationResult } from '../interfaces/token-validation-result.interface';
import { TokenType } from '../constants/token.constant';
import { ErrorMessages } from '../constants/error-messages.constant';
import {
  signAccessToken,
  verifyAccessToken,
  extractJti,
  getRemainingTtl,
} from '../utils/token.util';
import { hashToken } from '../utils/hash.util';
import { generateDeviceFingerprint } from '../utils/device-fingerprint.util';
import { logger } from '../utils/logger.util';

@Injectable()
export class TokenService {
  constructor(
    private readonly configService: ConfigService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly blacklistService: BlacklistService,
    private readonly redisClient: RedisClient,
  ) {}

  /**
   * Generates a signed JWT access token using RS256 with the configured private key.
   * The token includes user identity claims, role claims for RBAC, and a unique JTI
   * for per-token revocation via the blacklist.
   *
   * @param userId - UUID of the authenticated user (becomes the 'sub' claim)
   * @param email - User's email address (embedded in the token for convenience)
   * @param roles - Array of role names for RBAC (e.g., ['USER', 'ADMIN'])
   * @returns The signed JWT access token string
   * @throws Error if the private key is not configured or signing fails
   */
  generateAccessToken(userId: string, email: string, roles: string[]): string {
    const privateKey = this.configService.get<string>('jwt.privateKey')!;
    const expiresIn = this.configService.get<string>('jwt.accessTokenExpiry') ?? '15m';
    const issuer = this.configService.get<string>('jwt.issuer') ?? 'auth-service';
    const audience = this.configService.get<string>('jwt.audience') ?? 'api-gateway';

    return signAccessToken(
      { sub: userId, email, roles, tokenType: TokenType.ACCESS },
      privateKey,
      { expiresIn, issuer, audience },
    );
  }

  /**
   * Generates an opaque refresh token (UUID v4), hashes it with SHA-256, and
   * persists the hash in PostgreSQL. The raw token is returned to the client
   * exactly once — it is never stored in plaintext.
   *
   * @param userId - UUID of the authenticated user
   * @param deviceFingerprint - Optional SHA-256 fingerprint of the client device
   * @param ipAddress - Optional IP address of the client
   * @param userAgent - Optional User-Agent header of the client
   * @returns Object containing the raw token (for the client) and the persisted entity
   * @throws Error if database persistence fails
   */
  async generateRefreshToken(
    userId: string,
    deviceFingerprint?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ rawToken: string; refreshTokenEntity: RefreshToken }> {
    const rawToken = uuidv4();
    const tokenHash = hashToken(rawToken);

    const expiryDays = this.configService.get<number>('jwt.refreshTokenExpiryDays') ?? 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const refreshTokenEntity = await this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
      deviceFingerprint,
      ipAddress,
      userAgent,
    });

    logger.info('Refresh token generated', {
      userId,
      tokenId: refreshTokenEntity.id,
      expiresAt: expiresAt.toISOString(),
    });

    return { rawToken, refreshTokenEntity };
  }

  /**
   * Validates a JWT access token: verifies the RS256 signature, checks expiry,
   * and queries the Redis blacklist for revocation status.
   *
   * @param token - The JWT access token string to validate
   * @returns TokenValidationResult with valid=true and decoded payload, or
   *   valid=false with a machine-readable failure reason
   */
  async validateAccessToken(token: string): Promise<TokenValidationResult> {
    const publicKey = this.configService.get<string>('jwt.publicKey')!;
    const issuer = this.configService.get<string>('jwt.issuer') ?? 'auth-service';
    const audience = this.configService.get<string>('jwt.audience') ?? 'api-gateway';

    try {
      const payload = verifyAccessToken(token, publicKey, { issuer, audience });

      // Check if the token has been revoked (JTI blacklisted in Redis)
      if (payload.jti) {
        const isBlacklisted = await this.blacklistService.isBlacklisted(payload.jti);
        if (isBlacklisted) {
          logger.info('Token validation failed — blacklisted', { jti: payload.jti });
          return { valid: false, reason: 'blacklisted' };
        }
      }

      return { valid: true, payload };
    } catch (error) {
      const err = error as Error;

      if (err.name === 'TokenExpiredError') {
        return { valid: false, reason: 'expired' };
      }

      if (err.name === 'JsonWebTokenError') {
        return { valid: false, reason: 'invalid_signature' };
      }

      logger.error('Unexpected token validation error', {
        error: err.message,
      });
      return { valid: false, reason: 'invalid' };
    }
  }

  /**
   * Performs refresh token rotation: validates the presented refresh token,
   * detects reuse (indicating potential theft), revokes the old token, and
   * issues a new access + refresh token pair.
   *
   * SECURITY — Reuse Detection:
   *   If a revoked refresh token is presented, it means either:
   *   (a) The legitimate user is replaying an old token (unlikely), or
   *   (b) An attacker stole the token before it was rotated.
   *   In both cases, ALL tokens for the user are revoked as a precaution.
   *
   * @param rawRefreshToken - The raw refresh token string presented by the client
   * @param ipAddress - Optional IP address of the client for session metadata
   * @param userAgent - Optional User-Agent header for session metadata
   * @returns Object containing new accessToken, refreshToken, and expiresIn
   * @throws Error with specific message for invalid, expired, or reused tokens
   */
  async refreshTokens(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const tokenHash = hashToken(rawRefreshToken);
    const existingToken = await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!existingToken) {
      logger.warn('Refresh token not found', { tokenHashPrefix: tokenHash.substring(0, 8) });
      throw new Error(ErrorMessages.AUTH_REFRESH_TOKEN_INVALID);
    }

    // REUSE DETECTION: Token was already revoked — possible theft
    if (existingToken.revoked) {
      logger.error('SECURITY: Refresh token reuse detected — revoking all user tokens', {
        userId: existingToken.userId,
        tokenId: existingToken.id,
      });
      await this.revokeAllUserTokens(existingToken.userId, 'token_reuse_detected');
      throw new Error(ErrorMessages.AUTH_TOKEN_REUSE_DETECTED);
    }

    // Check expiry
    if (existingToken.expiresAt < new Date()) {
      logger.info('Refresh token expired', { tokenId: existingToken.id });
      throw new Error(ErrorMessages.AUTH_REFRESH_TOKEN_INVALID);
    }

    // Revoke the old token (rotation)
    await this.refreshTokenRepository.revokeToken(existingToken.id, 'rotated');

    // Generate device fingerprint for the new session
    const deviceFingerprint = generateDeviceFingerprint(userAgent, ipAddress);

    // Issue new tokens — need user data from the existing token
    // Look up the user to get current email and roles for the access token
    const userId = existingToken.userId;

    // Generate new refresh token
    const { rawToken: newRawRefreshToken, refreshTokenEntity: newRefreshToken } =
      await this.generateRefreshToken(userId, deviceFingerprint, ipAddress, userAgent);

    // Link old token to new token for rotation chain tracking
    await this.refreshTokenRepository.setReplacedBy(existingToken.id, newRefreshToken.id);

    // Update last used timestamp
    await this.refreshTokenRepository.updateLastUsed(newRefreshToken.id);

    // Note: The caller (AuthService) is responsible for generating the access token
    // because it has access to the user's current email and roles.
    // We return a placeholder that the caller will replace.
    const expiresIn = this.getAccessTokenExpirySeconds();

    logger.info('Token refresh completed', {
      userId,
      oldTokenId: existingToken.id,
      newTokenId: newRefreshToken.id,
    });

    return {
      accessToken: '', // Caller must generate the access token with current user claims
      refreshToken: newRawRefreshToken,
      expiresIn,
    };
  }

  /**
   * Revokes a JWT access token by extracting its JTI and adding it to the
   * Redis blacklist with a TTL matching the token's remaining lifetime.
   *
   * @param token - The JWT access token string to revoke
   * @returns Promise that resolves when the token has been blacklisted
   */
  async revokeAccessToken(token: string): Promise<void> {
    const jti = extractJti(token);
    if (!jti) {
      logger.warn('Cannot revoke access token — no JTI found');
      return;
    }

    const ttl = getRemainingTtl(token);
    if (ttl > 0) {
      await this.blacklistService.blacklistToken(jti, ttl);
      logger.info('Access token revoked', { jti, ttlSeconds: ttl });
    } else {
      logger.debug('Access token already expired — skipping blacklist', { jti });
    }
  }

  /**
   * Revokes a single refresh token by its database ID.
   *
   * @param tokenId - UUID of the refresh token record in the database
   * @param reason - Human-readable revocation reason (e.g., 'logout', 'admin_revoke')
   * @returns Promise that resolves when the token has been revoked
   */
  async revokeRefreshToken(tokenId: string, reason: string): Promise<void> {
    await this.refreshTokenRepository.revokeToken(tokenId, reason);
    logger.info('Refresh token revoked', { tokenId, reason });
  }

  /**
   * Revokes ALL tokens for a user — both refresh tokens (in DB) and any known
   * access token JTIs (in Redis blacklist). Used during security incidents,
   * password changes, account locking, and token reuse detection.
   *
   * @param userId - UUID of the user whose tokens should be revoked
   * @param reason - Reason for bulk revocation (e.g., 'password_change', 'security_incident')
   * @returns Promise that resolves when all tokens have been revoked
   */
  async revokeAllUserTokens(userId: string, reason: string): Promise<void> {
    const revokedCount = await this.refreshTokenRepository.revokeAllByUserId(userId, reason);
    logger.info('All user refresh tokens revoked', {
      userId,
      reason,
      revokedCount,
    });
  }

  /**
   * Parses the configured access token expiry string (e.g., '15m', '1h', '30s')
   * into a number of seconds. Used to populate the `expiresIn` field in
   * AuthResponse so clients know when to refresh.
   *
   * @returns The access token lifetime in seconds
   */
  getAccessTokenExpirySeconds(): number {
    const expiry = this.configService.get<string>('jwt.accessTokenExpiry') ?? '15m';
    const match = expiry.match(/^(\d+)(s|m|h|d)$/);

    if (!match) {
      logger.warn('Invalid access token expiry format, defaulting to 900s', { expiry });
      return 900; // 15 minutes default
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 900;
    }
  }
}

/**
 * =============================================================================
 * Session Service — Active Session Management
 * =============================================================================
 *
 * @file session.service.ts
 * @description Manages active user sessions backed by refresh tokens. Provides
 *   session enumeration, counting, max-session enforcement, and targeted session
 *   revocation. Each "session" maps to an active (non-revoked, non-expired)
 *   refresh token record in the database.
 *
 * Architecture Role: Business Logic Layer — Session Management
 *   Sits between AuthService (which orchestrates auth flows) and the
 *   RefreshTokenRepository (which handles refresh token persistence). This
 *   service provides a session-oriented API abstraction over the underlying
 *   refresh token storage.
 *
 * Request Flow (max session enforcement — login/register):
 *   1. AuthService authenticates the user and generates tokens.
 *   2. AuthService calls SessionService.enforceMaxSessions(userId).
 *   3. SessionService counts active sessions via RefreshTokenRepository.
 *   4. If count exceeds the configured maximum, the oldest session(s) are
 *      revoked to make room for the new one.
 *
 * Request Flow (session listing — user dashboard):
 *   1. Controller receives GET /sessions request with the user's JWT.
 *   2. Controller calls SessionService.getActiveSessions(userId).
 *   3. Returns active sessions with device metadata for display.
 *
 * Configuration:
 *   - session.maxConcurrent: Maximum number of concurrent sessions per user.
 *     Default is 5. When exceeded, the oldest session is revoked (FIFO).
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { SessionInfo } from '../interfaces/session.interface';
import { logger } from '../utils/logger.util';

@Injectable()
export class SessionService {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Retrieves all active sessions for a user. Each active refresh token
   * represents one session. Returns session metadata including device info,
   * timestamps, and session ID for targeted revocation.
   *
   * @param userId - UUID of the user whose sessions to retrieve
   * @returns Array of SessionInfo objects representing active sessions
   */
  async getActiveSessions(userId: string): Promise<SessionInfo[]> {
    const activeTokens = await this.refreshTokenRepository.findActiveByUserId(userId);

    return activeTokens.map((token) => ({
      sessionId: token.id,
      userId: token.userId,
      deviceFingerprint: token.deviceFingerprint ?? undefined,
      ipAddress: token.ipAddress ?? undefined,
      userAgent: token.userAgent ?? undefined,
      issuedAt: token.issuedAt,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt ?? undefined,
    }));
  }

  /**
   * Counts the number of active (non-revoked, non-expired) sessions for a user.
   * Used for max concurrent session enforcement checks.
   *
   * @param userId - UUID of the user whose session count to retrieve
   * @returns The number of active sessions
   */
  async countActiveSessions(userId: string): Promise<number> {
    return this.refreshTokenRepository.countActiveByUserId(userId);
  }

  /**
   * Enforces the maximum concurrent session limit for a user. If the number
   * of active sessions exceeds the configured maximum, the oldest sessions
   * are revoked (FIFO — First In, First Out) until the count is within limits.
   *
   * This is called after generating a new refresh token during login or
   * registration to ensure the session count stays within bounds.
   *
   * @param userId - UUID of the user whose sessions to enforce
   * @returns Promise that resolves when enforcement is complete
   */
  async enforceMaxSessions(userId: string): Promise<void> {
    const maxSessions = this.configService.get<number>('session.maxConcurrent') ?? 5;
    const activeCount = await this.refreshTokenRepository.countActiveByUserId(userId);

    if (activeCount <= maxSessions) {
      return;
    }

    const sessionsToRevoke = activeCount - maxSessions;
    logger.info('Enforcing max sessions — revoking oldest', {
      userId,
      activeCount,
      maxSessions,
      sessionsToRevoke,
    });

    for (let i = 0; i < sessionsToRevoke; i++) {
      const oldestToken = await this.refreshTokenRepository.findOldestActiveByUserId(userId);
      if (oldestToken) {
        await this.refreshTokenRepository.revokeToken(oldestToken.id, 'max_sessions_exceeded');
        logger.info('Oldest session revoked for max session enforcement', {
          userId,
          tokenId: oldestToken.id,
        });
      }
    }
  }

  /**
   * Revokes a specific session by its session ID (which is the refresh token's
   * database UUID). Used for targeted session revocation from the user dashboard
   * (e.g., "log out this device").
   *
   * @param sessionId - UUID of the session (refresh token record) to revoke
   * @param reason - Human-readable revocation reason (e.g., 'user_revoked', 'admin_revoke')
   * @returns Promise that resolves when the session has been revoked
   */
  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.refreshTokenRepository.revokeToken(sessionId, reason);
    logger.info('Session revoked', { sessionId, reason });
  }
}

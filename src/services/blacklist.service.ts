/**
 * =============================================================================
 * Blacklist Service — Redis-Backed JWT Revocation
 * =============================================================================
 *
 * @file blacklist.service.ts
 * @description Manages the JWT blacklist in Redis, enabling per-token revocation
 *   by storing blacklisted JTI (JWT ID) values with TTLs aligned to the token's
 *   remaining lifetime.
 *
 * Architecture Role: Business Logic Layer — Token Revocation
 *   Sits between TokenService (which decides WHEN to blacklist) and RedisClient
 *   (which handles the actual Redis I/O). This service provides a clean domain
 *   API for blacklist operations, abstracting away Redis key formats and TTL
 *   management.
 *
 * Request Flow (token revocation):
 *   1. User logs out or admin revokes a token.
 *   2. AuthService/TokenService extracts the JTI from the access token.
 *   3. TokenService calls BlacklistService.blacklistToken(jti, remainingTtl).
 *   4. BlacklistService delegates to RedisClient.blacklistToken() which stores
 *      the JTI with a TTL matching the token's remaining lifetime.
 *   5. On subsequent validation requests, BlacklistService.isBlacklisted(jti)
 *      checks Redis for the JTI's presence.
 *
 * Request Flow (token validation):
 *   1. API Gateway or internal service calls /auth/validate with a JWT.
 *   2. TokenService verifies the signature and expiry.
 *   3. TokenService calls BlacklistService.isBlacklisted(jti) to check revocation.
 *   4. RedisClient.isTokenBlacklisted() implements fail-open: if Redis is down,
 *      returns false (token is NOT considered blacklisted), prioritizing
 *      availability over perfect revocation enforcement.
 *
 * Security Decisions:
 *   - TTL-based auto-cleanup: Blacklist entries expire when the token would have
 *     expired naturally, preventing unbounded Redis memory growth.
 *   - Fail-open on Redis outage: Delegated to RedisClient (see redis.client.ts
 *     for detailed rationale).
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { RedisClient } from '../clients/redis.client';
import { logger } from '../utils/logger.util';

@Injectable()
export class BlacklistService {
  constructor(private readonly redisClient: RedisClient) {}

  /**
   * Adds a JWT's unique identifier (JTI) to the Redis blacklist.
   *
   * The TTL should match the token's remaining lifetime so the blacklist
   * entry is automatically evicted by Redis when the token would have
   * expired naturally. This eliminates the need for manual cleanup and
   * bounds memory usage proportionally to active token lifetimes.
   *
   * @param jti - The JWT ID (jti claim) to blacklist
   * @param ttlSeconds - Time-to-live in seconds, aligned with the token's
   *   remaining lifetime. Must be positive; already-expired tokens do not
   *   need blacklisting.
   * @returns Promise that resolves when the JTI has been stored in Redis
   * @throws Error if Redis is unreachable and all retries are exhausted
   */
  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      logger.debug('Skipping blacklist — token already expired', { jti });
      return;
    }

    await this.redisClient.blacklistToken(jti, ttlSeconds);
    logger.info('Token blacklisted via BlacklistService', { jti, ttlSeconds });
  }

  /**
   * Checks whether a JWT has been blacklisted (revoked).
   *
   * Delegates to RedisClient.isTokenBlacklisted() which implements a
   * fail-open policy: if Redis is unreachable, returns false, allowing the
   * request to proceed. This is a deliberate availability-over-security
   * tradeoff — see RedisClient for detailed rationale.
   *
   * @param jti - The JWT ID (jti claim) to check
   * @returns true if the JTI is found in the blacklist, false if not found
   *   OR if Redis is unreachable (fail-open)
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    return this.redisClient.isTokenBlacklisted(jti);
  }
}

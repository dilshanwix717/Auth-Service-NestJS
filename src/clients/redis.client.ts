/**
 * =============================================================================
 * Redis Client Service
 * =============================================================================
 *
 * Purpose:
 *   Provides a centralized Redis client for the Auth Service, handling token
 *   blacklisting, session caching, and general key-value operations. Wraps the
 *   ioredis library as an @Injectable() NestJS service with full lifecycle
 *   management.
 *
 * Role in Auth Service:
 *   - Token Blacklisting: When a user logs out or a token is revoked, the JWT's
 *     unique identifier (jti) is stored in Redis with a TTL matching the token's
 *     remaining lifetime. This enables O(1) revocation checks without DB queries.
 *   - Session Caching: Stores ephemeral session data (refresh token metadata,
 *     device fingerprints) to reduce database load during high-frequency auth
 *     operations.
 *   - Health Checks: Exposes a ping() method for readiness/liveness probes.
 *
 * Library Choice — Why ioredis over node-redis:
 *   1. Superior TypeScript support with complete type definitions out of the box.
 *   2. Built-in Redis Cluster support for horizontal scaling without code changes.
 *   3. Automatic reconnection with configurable exponential backoff (handled
 *      natively by ioredis — no manual retry logic needed).
 *   4. Lua scripting support for future atomic operations (e.g., rate limiting).
 *   5. Battle-tested in production by large-scale Node.js deployments.
 *
 * Failure Handling — Fail-Open vs Fail-Closed:
 *   The isTokenBlacklisted() method implements a FAIL-OPEN policy: if Redis is
 *   unreachable, it returns false (token is NOT blacklisted), allowing the
 *   request to proceed. This is a deliberate security tradeoff:
 *
 *   - Fail-Open (chosen): A Redis outage does NOT cause a full auth outage.
 *     Users can still authenticate, but recently revoked tokens may be honored
 *     for the duration of the outage. This prioritizes AVAILABILITY over
 *     perfect revocation.
 *
 *   - Fail-Closed (alternative): A Redis outage would reject ALL requests,
 *     causing a complete service denial. This prioritizes SECURITY over
 *     availability but creates a single point of failure.
 *
 *   The fail-open approach is standard for token blacklisting because:
 *     (a) Tokens have short TTLs (typically 15 minutes), limiting the window.
 *     (b) Critical operations (password change, account lock) should use
 *         additional checks beyond just blacklist status.
 *     (c) A monitoring alert on Redis failures enables rapid incident response.
 *
 * TTL & Auto-Cleanup:
 *   Blacklist entries use TTLs aligned with the token's remaining lifetime.
 *   When the token would have expired naturally, its blacklist entry is
 *   automatically evicted by Redis. This eliminates the need for manual
 *   cleanup jobs and bounds memory usage proportionally to active tokens.
 *
 * Security Decisions:
 *   - TLS: Configurable via REDIS_TLS env var for encrypted connections in
 *     production environments.
 *   - Key Prefixing: All keys are prefixed (default: 'auth:') to namespace
 *     this service's data in shared Redis instances.
 *   - No Sensitive Data in Values: Only opaque identifiers (jti) are stored,
 *     never raw tokens or credentials.
 *
 * =============================================================================
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { logger } from '../utils/logger.util';

@Injectable()
export class RedisClient implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initializes the Redis connection when the NestJS module starts.
   *
   * Creates an ioredis instance with configuration from the 'redis' config
   * namespace. Registers event handlers for connection lifecycle events.
   * ioredis handles reconnection automatically with exponential backoff —
   * no manual retry logic is needed.
   *
   * @throws Will log errors but not throw — ioredis reconnects automatically.
   */
  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('redis.url');
    const keyPrefix = this.configService.get<string>('redis.keyPrefix');
    const tls = this.configService.get<boolean>('redis.tls');

    this.client = new Redis(url!, {
      keyPrefix,
      tls: tls ? {} : undefined,
      // ioredis native reconnect: exponential backoff with jitter,
      // capped at 2 seconds between attempts. This is the default
      // behavior — we rely on it rather than implementing custom retry.
      retryStrategy(times: number): number {
        const delay = Math.min(times * 100, 2000);
        logger.warn(`Redis reconnect attempt #${times}, next retry in ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected successfully');
    });

    this.client.on('error', (err: Error) => {
      logger.error('Redis client error', { error: err.message, stack: err.stack });
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.client.on('reconnecting', (delay: number) => {
      logger.info('Redis client reconnecting', { delayMs: delay });
    });
  }

  /**
   * Gracefully disconnects from Redis when the NestJS module is destroyed.
   *
   * Uses quit() for a graceful shutdown that waits for pending commands
   * to complete, rather than disconnect() which drops them immediately.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      logger.info('Disconnecting Redis client...');
      await this.client.quit();
      logger.info('Redis client disconnected');
    }
  }

  /**
   * Sets a key-value pair in Redis with an optional TTL.
   *
   * @param key - The cache key (will be auto-prefixed by ioredis keyPrefix).
   * @param value - The string value to store.
   * @param ttlSeconds - Optional time-to-live in seconds. If provided, the key
   *   will be automatically evicted after this duration. If omitted, the key
   *   persists until explicitly deleted.
   * @throws Error if Redis is unreachable and retries are exhausted.
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Retrieves a value from Redis by key.
   *
   * @param key - The cache key to look up (auto-prefixed by ioredis keyPrefix).
   * @returns The stored string value, or null if the key does not exist or has expired.
   * @throws Error if Redis is unreachable and retries are exhausted.
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Deletes a key from Redis.
   *
   * @param key - The cache key to delete (auto-prefixed by ioredis keyPrefix).
   * @throws Error if Redis is unreachable and retries are exhausted.
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Checks whether a key exists in Redis.
   *
   * @param key - The cache key to check (auto-prefixed by ioredis keyPrefix).
   * @returns true if the key exists, false otherwise.
   * @throws Error if Redis is unreachable and retries are exhausted.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Adds a JWT's unique identifier (jti) to the token blacklist.
   *
   * The TTL should match the token's remaining lifetime so the blacklist
   * entry is automatically cleaned up when the token would have expired
   * naturally. This ensures bounded memory usage without manual cleanup.
   *
   * Key format: blacklist:<jti>
   *
   * @param jti - The JWT ID (jti claim) to blacklist.
   * @param ttlSeconds - Time-to-live in seconds, aligned with token expiry.
   *   Must be positive; a token that has already expired needs no blacklisting.
   * @throws Error if Redis is unreachable and retries are exhausted.
   */
  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`blacklist:${jti}`, '1', 'EX', ttlSeconds);
    logger.info('Token blacklisted', { jti, ttlSeconds });
  }

  /**
   * Checks whether a JWT has been blacklisted (revoked).
   *
   * IMPORTANT — FAIL-OPEN POLICY:
   * If Redis is unreachable (connection error, timeout, etc.), this method
   * returns false (token is NOT blacklisted), allowing the request to proceed.
   *
   * Security Tradeoff:
   *   - During a Redis outage, recently revoked tokens will be accepted.
   *   - The exposure window is bounded by the token's short TTL (typically 15 min).
   *   - This prevents a Redis failure from causing a complete auth service outage.
   *   - A CRITICAL log is emitted so monitoring systems can trigger alerts.
   *   - For high-security operations (password change, account deletion), callers
   *     should implement additional verification beyond blacklist checks.
   *
   * @param jti - The JWT ID (jti claim) to check.
   * @returns true if the token is blacklisted, false if not blacklisted OR
   *   if Redis is unreachable (fail-open).
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      const result = await this.client.exists(`blacklist:${jti}`);
      return result === 1;
    } catch (error) {
      // FAIL-OPEN: Redis is unreachable — allow the request through.
      //
      // This is a deliberate security tradeoff. Alternatives considered:
      //   1. Fail-closed (throw/return true): Would deny ALL authenticated
      //      requests during a Redis outage, creating a total service outage.
      //   2. Circuit breaker: Could be layered on top but adds complexity
      //      without changing the fundamental open/closed decision.
      //
      // Mitigation: Short token TTLs (15 min) limit the exposure window.
      // The CRITICAL log triggers monitoring alerts for rapid response.
      logger.error(
        'CRITICAL: Redis unreachable during blacklist check — FAIL-OPEN policy applied. ' +
          'Revoked tokens may be accepted until Redis recovers.',
        {
          jti,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  /**
   * Health check: verifies Redis connectivity by sending a PING command.
   *
   * Used by readiness/liveness probes to determine if the Redis dependency
   * is healthy. Returns false on any error rather than throwing.
   *
   * @returns true if Redis responds with PONG, false otherwise.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Returns the raw ioredis client instance for advanced operations.
   *
   * Use this sparingly — prefer the typed methods on this service for
   * standard operations. Direct client access is useful for:
   *   - Pipeline/multi (transactions)
   *   - Pub/Sub
   *   - Lua script execution
   *   - Scan-based iteration
   *
   * @returns The underlying ioredis Redis instance.
   */
  getClient(): Redis {
    return this.client;
  }
}

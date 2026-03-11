/**
 * Redis Configuration Namespace
 *
 * Registers the 'redis' configuration namespace with NestJS ConfigModule.
 * Provides connection settings for the Redis instance used for session
 * storage, token blacklisting, rate limiting, and distributed caching.
 *
 * The application connects to Redis via ioredis using the URL format.
 *
 * Inject via: @Inject(redisConfig.KEY) or configService.get('redis')
 */

import { registerAs } from '@nestjs/config';

const redisConfig = registerAs('redis', () => ({
  /** Full Redis connection URL (e.g. redis://localhost:6379 or rediss://… for TLS) */
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',

  /** Prefix prepended to every Redis key to namespace and avoid collisions */
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'auth:',

  /** Whether to enable TLS when connecting to Redis */
  tls: process.env.REDIS_TLS === 'true',
}));

export default redisConfig;

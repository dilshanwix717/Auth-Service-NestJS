/**
 * Rate Limiting Configuration Namespace
 *
 * Registers the 'rateLimit' configuration namespace with NestJS ConfigModule.
 * Defines per-endpoint rate limiting policies to protect sensitive
 * authentication endpoints from abuse and brute-force attacks.
 *
 * Each policy specifies:
 *   - ttl:   time window in seconds
 *   - limit: maximum requests allowed within that window
 *
 * These values are consumed by a rate-limiting guard or middleware
 * (e.g. @nestjs/throttler) to enforce request quotas.
 *
 * Inject via: @Inject(rateLimitConfig.KEY) or configService.get('rateLimit')
 */

import { registerAs } from '@nestjs/config';

const rateLimitConfig = registerAs('rateLimit', () => ({
  /** Login endpoint – 10 attempts per 60 seconds per IP */
  login: {
    /** Time window in seconds */
    ttl: 60,
    /** Max requests allowed within the window */
    limit: 10,
  },

  /** Registration endpoint – 5 attempts per 60 seconds per IP */
  register: {
    /** Time window in seconds */
    ttl: 60,
    /** Max requests allowed within the window */
    limit: 5,
  },

  /** Forgot-password endpoint – 3 attempts per 300 seconds (5 min) per IP */
  forgotPassword: {
    /** Time window in seconds */
    ttl: 300,
    /** Max requests allowed within the window */
    limit: 3,
  },

  /** Catch-all for all other endpoints – 60 requests per 60 seconds per IP */
  general: {
    /** Time window in seconds */
    ttl: 60,
    /** Max requests allowed within the window */
    limit: 60,
  },
}));

export default rateLimitConfig;

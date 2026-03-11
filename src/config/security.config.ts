/**
 * Security Configuration Namespace
 *
 * Registers the 'security' configuration namespace with NestJS ConfigModule.
 * Centralises all password-hashing parameters and brute-force / account
 * protection policies so they can be tuned per environment without
 * touching application code.
 *
 * Inject via: @Inject(securityConfig.KEY) or configService.get('security')
 */

import { registerAs } from '@nestjs/config';

const securityConfig = registerAs('security', () => ({
  // ─── Password Hashing ──────────────────────────────────────────────
  /** bcrypt cost factor – each increment doubles the hashing time */
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),

  /** Argon2 memory cost in KiB (65536 = 64 MB) – higher resists GPU attacks */
  argon2MemoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '65536', 10),

  /** Argon2 time cost – number of hash iterations */
  argon2TimeCost: parseInt(process.env.ARGON2_TIME_COST ?? '3', 10),

  /** Argon2 parallelism – number of threads used during hashing */
  argon2Parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '4', 10),

  // ─── Brute-Force / Account Protection ──────────────────────────────
  /** Consecutive failed login attempts before the account is temporarily locked */
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS ?? '5', 10),

  /** Minutes the account remains locked after exceeding maxLoginAttempts */
  accountLockoutDurationMinutes: parseInt(
    process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES ?? '15',
    10,
  ),

  /** Maximum active sessions a single user may hold simultaneously */
  maxConcurrentSessions: parseInt(
    process.env.MAX_CONCURRENT_SESSIONS ?? '5',
    10,
  ),

  /** Minutes before an unused password-reset token expires */
  passwordResetTokenExpiryMinutes: parseInt(
    process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES ?? '60',
    10,
  ),
}));

export default securityConfig;

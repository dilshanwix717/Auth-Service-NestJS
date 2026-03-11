/**
 * @file token.constant.ts
 * @description Token-related constants for the Auth Service.
 *
 * `TokenType` distinguishes between short-lived access tokens and long-lived refresh
 * tokens throughout the token lifecycle (issuance, validation, revocation).
 * The key-prefix constants are used when storing blacklisted JTIs and active sessions
 * in Redis, ensuring a consistent and collision-free key namespace.
 */

export enum TokenType {
  ACCESS = 'ACCESS',
  REFRESH = 'REFRESH',
}

/** Redis key prefix for blacklisted JWT IDs (JTI). */
export const BLACKLIST_KEY_PREFIX = 'blacklist:';

/** Redis key prefix for active user sessions. */
export const SESSION_KEY_PREFIX = 'session:';

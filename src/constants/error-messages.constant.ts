/**
 * @file error-messages.constant.ts
 * @description Centralized error messages and machine-readable error codes for the Auth Service.
 *
 * All user-facing and internal error strings are defined here to ensure consistency
 * across controllers, services, and RPC responses. The `ErrorCodes` object provides
 * stable, machine-readable identifiers that consumers (e.g., API Gateway) can rely on
 * for programmatic error handling without coupling to human-readable text.
 */

export const ErrorMessages = {
  AUTH_INVALID_CREDENTIALS: 'Invalid email or password',
  AUTH_EMAIL_EXISTS: 'An account with this email already exists',
  AUTH_ACCOUNT_LOCKED:
    'Account is temporarily locked due to multiple failed login attempts',
  AUTH_ACCOUNT_BANNED: 'Account has been permanently banned',
  AUTH_ACCOUNT_DELETED: 'Account has been deleted',
  AUTH_TOKEN_EXPIRED: 'Token has expired',
  AUTH_TOKEN_INVALID: 'Invalid token',
  AUTH_TOKEN_BLACKLISTED: 'Token has been revoked',
  AUTH_TOKEN_REUSE_DETECTED:
    'Token reuse detected — all sessions have been revoked for security',
  AUTH_REFRESH_TOKEN_INVALID: 'Invalid or expired refresh token',
  AUTH_REFRESH_TOKEN_REVOKED: 'Refresh token has been revoked',
  AUTH_INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
  AUTH_API_KEY_MISSING: 'Missing internal API key',
  AUTH_API_KEY_INVALID: 'Invalid internal API key',
  AUTH_PASSWORD_WEAK: 'Password does not meet strength requirements',
  AUTH_RATE_LIMIT_EXCEEDED: 'Too many requests, please try again later',
  AUTH_MAX_SESSIONS_EXCEEDED: 'Maximum concurrent sessions exceeded',
  AUTH_PASSWORD_RESET_INVALID: 'Invalid or expired password reset token',
  AUTH_PASSWORD_RESET_USED: 'Password reset token has already been used',
  AUTH_EMAIL_CHANGE_INVALID: 'Invalid or expired email change token',
  AUTH_USER_NOT_FOUND: 'User not found',
  INTERNAL_SERVER_ERROR: 'An unexpected error occurred',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
} as const;

export const ErrorCodes = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  EMAIL_EXISTS: 'AUTH_EMAIL_EXISTS',
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  ACCOUNT_BANNED: 'AUTH_ACCOUNT_BANNED',
  ACCOUNT_DELETED: 'AUTH_ACCOUNT_DELETED',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  TOKEN_BLACKLISTED: 'AUTH_TOKEN_BLACKLISTED',
  TOKEN_REUSE_DETECTED: 'AUTH_TOKEN_REUSE_DETECTED',
  REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',
  REFRESH_TOKEN_REVOKED: 'AUTH_REFRESH_TOKEN_REVOKED',
  INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  API_KEY_MISSING: 'AUTH_API_KEY_MISSING',
  API_KEY_INVALID: 'AUTH_API_KEY_INVALID',
  PASSWORD_WEAK: 'AUTH_PASSWORD_WEAK',
  RATE_LIMIT_EXCEEDED: 'AUTH_RATE_LIMIT_EXCEEDED',
  MAX_SESSIONS_EXCEEDED: 'AUTH_MAX_SESSIONS_EXCEEDED',
  PASSWORD_RESET_INVALID: 'AUTH_PASSWORD_RESET_INVALID',
  PASSWORD_RESET_USED: 'AUTH_PASSWORD_RESET_USED',
  EMAIL_CHANGE_INVALID: 'AUTH_EMAIL_CHANGE_INVALID',
  USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

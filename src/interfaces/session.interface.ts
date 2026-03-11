/**
 * @file session.interface.ts
 * @description Session metadata tracked by the Auth Service.
 *
 * Each active refresh token is associated with a `SessionInfo` record stored in
 * Redis. This allows the service to enforce maximum concurrent sessions, display
 * active sessions to the user, and perform targeted or bulk revocation. Device
 * fingerprint and IP data support suspicious-activity detection.
 */

export interface SessionInfo {
  /** Unique session identifier (maps to the refresh token's JTI). */
  sessionId: string;

  /** UUID of the owning user. */
  userId: string;

  /** Optional device fingerprint for session binding. */
  deviceFingerprint?: string;

  /** IP address from which the session was created. */
  ipAddress?: string;

  /** User-Agent header captured at session creation. */
  userAgent?: string;

  /** Timestamp when the session (refresh token) was issued. */
  issuedAt: Date;

  /** Timestamp when the session (refresh token) expires. */
  expiresAt: Date;

  /** Timestamp of the most recent token refresh or API call. */
  lastUsedAt?: Date;
}

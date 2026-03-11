/**
 * @file auth-response.interface.ts
 * @description Shape of the authentication response returned after login or token refresh.
 *
 * This interface defines the token payload sent back to the client (via the API Gateway)
 * upon successful authentication. It includes both the access and refresh tokens along
 * with metadata the client needs to manage token lifecycle (expiry, type, user identity).
 */

export interface AuthResponse {
  /** Short-lived JWT access token. */
  accessToken: string;

  /** Long-lived opaque or JWT refresh token. */
  refreshToken: string;

  /** Access token lifetime in seconds. */
  expiresIn: number;

  /** Token scheme — always 'Bearer'. */
  tokenType: string;

  /** UUID of the authenticated user. */
  userId: string;
}

/**
 * @file jwt-payload.interface.ts
 * @description Shape of the decoded JWT payload used throughout the Auth Service.
 *
 * Both access and refresh tokens are signed with this structure. The `jti` field
 * enables per-token revocation via the Redis blacklist, while `sub` carries the
 * user's UUID so downstream services can identify the caller without a database
 * lookup. Standard registered claims (`iat`, `exp`, `iss`, `aud`) follow RFC 7519.
 */

export interface JwtPayload {
  /** User UUID (subject claim). */
  sub: string;

  /** User's email address at the time of token issuance. */
  email: string;

  /** Roles assigned to the user (e.g., ['USER', 'ADMIN']). */
  roles: string[];

  /** Unique JWT ID used for blacklisting individual tokens. */
  jti: string;

  /** Issued-at timestamp (Unix epoch seconds). */
  iat: number;

  /** Expiration timestamp (Unix epoch seconds). */
  exp: number;

  /** Issuer — always 'auth-service'. */
  iss: string;

  /** Audience — the intended consumer, typically 'api-gateway'. */
  aud: string;

  /** Discriminator for access vs. refresh tokens (e.g., 'ACCESS'). */
  tokenType: string;
}

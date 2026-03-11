/**
 * @file token.util.ts
 * @description Helper functions for JWT signing, verification, decoding, and JTI extraction.
 * Uses RS256 (asymmetric RSA) for signing: the Auth Service holds the private key,
 * while the API Gateway and other services use the public key for local verification.
 *
 * Architecture Role: Cross-Cutting Utility — used by TokenService for all JWT operations.
 *
 * Key Concepts:
 * - RS256 (RSA + SHA-256): Asymmetric algorithm where signing and verification use different keys
 *   - Private key (auth-service only): Signs tokens — kept secret, never shared
 *   - Public key (shared): Verifies tokens — API Gateway can verify without calling auth-service
 *   - Advantage over HS256: public key can be freely distributed; compromising it doesn't enable forgery
 * - JTI (JWT ID): Unique identifier (UUID v4) embedded in each token for blacklisting
 *   - When a token is revoked, its JTI is added to the Redis blacklist
 *   - Checked on every token validation to detect revoked tokens
 */

import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Sign a JWT access token using the RS256 private key.
 *
 * @param payload - The claims to embed in the token (sub, email, roles, etc.)
 * @param privateKey - RSA private key (PEM format) for signing
 * @param options - Signing options (expiresIn, issuer, audience)
 * @returns The signed JWT string
 *
 * @example
 * const token = signAccessToken(
 *   { sub: userId, email, roles: ['USER'], tokenType: 'ACCESS' },
 *   privateKey,
 *   { expiresIn: '15m', issuer: 'auth-service', audience: 'api-gateway' }
 * );
 */
export function signAccessToken(
  payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti' | 'iss' | 'aud'>,
  privateKey: string,
  options: { expiresIn: string; issuer: string; audience: string },
): string {
  const jti = uuidv4();

  return jwt.sign(
    { ...payload, jti },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: options.expiresIn,
      issuer: options.issuer,
      audience: options.audience,
    } as jwt.SignOptions,
  );
}

/**
 * Verify and decode a JWT access token using the RS256 public key.
 * Checks signature validity, expiration, issuer, and audience.
 *
 * @param token - The JWT string to verify
 * @param publicKey - RSA public key (PEM format) for verification
 * @param options - Verification options (issuer, audience)
 * @returns The decoded JWT payload if valid
 *
 * @throws JsonWebTokenError if signature is invalid
 * @throws TokenExpiredError if token has expired
 * @throws NotBeforeError if token is not yet valid
 */
export function verifyAccessToken(
  token: string,
  publicKey: string,
  options: { issuer: string; audience: string },
): JwtPayload {
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: options.issuer,
    audience: options.audience,
  }) as JwtPayload;
}

/**
 * Decode a JWT without verification (for inspection/logging only).
 *
 * WARNING: This does NOT verify the signature or expiration.
 * Only use for extracting claims from tokens that have already been verified,
 * or for logging/debugging purposes.
 *
 * @param token - The JWT string to decode
 * @returns The decoded payload, or null if the token is malformed
 */
export function decodeToken(token: string): JwtPayload | null {
  const decoded = jwt.decode(token);
  return decoded as JwtPayload | null;
}

/**
 * Extract the JTI (JWT ID) from a token without full verification.
 * Used for blacklist lookups where we need the JTI even if the token is expired.
 *
 * @param token - The JWT string
 * @returns The JTI string, or null if not present
 */
export function extractJti(token: string): string | null {
  const decoded = decodeToken(token);
  return decoded?.jti || null;
}

/**
 * Calculate the remaining TTL (in seconds) of a JWT based on its expiry claim.
 * Used to set Redis blacklist TTL so it auto-expires when the token would have expired.
 *
 * @param token - The JWT string
 * @returns Remaining seconds until expiry, or 0 if already expired
 */
export function getRemainingTtl(token: string): number {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return 0;

  const now = Math.floor(Date.now() / 1000);
  const remaining = decoded.exp - now;
  return remaining > 0 ? remaining : 0;
}

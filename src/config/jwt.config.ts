/**
 * JWT Configuration Namespace
 *
 * Registers the 'jwt' configuration namespace with NestJS ConfigModule.
 * Handles RS256 asymmetric key pair decoding (base64 → PEM), token
 * lifetimes, and standard JWT claims (issuer, audience).
 *
 * The private key is used to SIGN tokens; the public key is used to
 * VERIFY them. Both are stored as base64-encoded PEM strings in env
 * vars to avoid multi-line value issues.
 *
 * Inject via: @Inject(jwtConfig.KEY) or configService.get('jwt')
 */

import { registerAs } from '@nestjs/config';

const jwtConfig = registerAs('jwt', () => ({
  /** RSA private key decoded from base64 – used to sign JWTs */
  privateKey: Buffer.from(
    process.env.JWT_PRIVATE_KEY ?? '',
    'base64',
  ).toString('utf-8'),

  /** RSA public key decoded from base64 – used to verify JWT signatures */
  publicKey: Buffer.from(
    process.env.JWT_PUBLIC_KEY ?? '',
    'base64',
  ).toString('utf-8'),

  /** Signing algorithm – RS256 for asymmetric RSA signatures */
  algorithm: process.env.JWT_ALGORITHM ?? 'RS256',

  /** Lifetime of short-lived access tokens (e.g. "15m", "1h") */
  accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY ?? '15m',

  /** Lifetime of long-lived refresh tokens (e.g. "7d", "30d") */
  refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY ?? '7d',

  /** Value written to the `iss` (issuer) claim in every JWT */
  issuer: process.env.JWT_ISSUER ?? 'auth-service',

  /** Value written to the `aud` (audience) claim in every JWT */
  audience: process.env.JWT_AUDIENCE ?? 'omi-services',
}));

export default jwtConfig;

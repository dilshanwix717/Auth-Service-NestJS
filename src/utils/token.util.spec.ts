/**
 * @file token.util.spec.ts
 * @description Unit tests for JWT token utilities. Tests signing, verification,
 * decoding, JTI extraction, and TTL calculation with RS256 keys.
 */

import * as crypto from 'crypto';
import {
  signAccessToken,
  verifyAccessToken,
  decodeToken,
  extractJti,
  getRemainingTtl,
} from './token.util';

// Generate a test RSA key pair for RS256
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const testPayload = {
  sub: 'user-123',
  email: 'test@example.com',
  roles: ['USER'],
  tokenType: 'ACCESS',
};

const signOptions = {
  expiresIn: '15m',
  issuer: 'auth-service',
  audience: 'api-gateway',
};

const verifyOptions = {
  issuer: 'auth-service',
  audience: 'api-gateway',
};

describe('TokenUtil', () => {
  describe('signAccessToken', () => {
    it('should sign a JWT with RS256', () => {
      const token = signAccessToken(testPayload, privateKey, signOptions);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // JWT has 3 parts separated by dots
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include a unique JTI in each token', () => {
      const token1 = signAccessToken(testPayload, privateKey, signOptions);
      const token2 = signAccessToken(testPayload, privateKey, signOptions);
      const jti1 = extractJti(token1);
      const jti2 = extractJti(token2);
      expect(jti1).not.toBe(jti2);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify a valid token and return the payload', () => {
      const token = signAccessToken(testPayload, privateKey, signOptions);
      const payload = verifyAccessToken(token, publicKey, verifyOptions);

      expect(payload.sub).toBe('user-123');
      expect(payload.email).toBe('test@example.com');
      expect(payload.roles).toEqual(['USER']);
      expect(payload.tokenType).toBe('ACCESS');
      expect(payload.jti).toBeDefined();
      expect(payload.iss).toBe('auth-service');
      expect(payload.aud).toBe('api-gateway');
    });

    it('should throw on invalid signature', () => {
      const { privateKey: otherKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const token = signAccessToken(testPayload, otherKey, signOptions);
      expect(() => verifyAccessToken(token, publicKey, verifyOptions)).toThrow();
    });

    it('should throw on expired token', () => {
      const token = signAccessToken(testPayload, privateKey, {
        ...signOptions,
        expiresIn: '0s',
      });

      // Wait a moment for the token to expire
      expect(() => verifyAccessToken(token, publicKey, verifyOptions)).toThrow();
    });
  });

  describe('decodeToken', () => {
    it('should decode a token without verification', () => {
      const token = signAccessToken(testPayload, privateKey, signOptions);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded!.sub).toBe('user-123');
      expect(decoded!.email).toBe('test@example.com');
    });

    it('should return null for malformed tokens', () => {
      const decoded = decodeToken('not-a-jwt');
      expect(decoded).toBeNull();
    });
  });

  describe('extractJti', () => {
    it('should extract JTI from a valid token', () => {
      const token = signAccessToken(testPayload, privateKey, signOptions);
      const jti = extractJti(token);

      expect(jti).toBeDefined();
      expect(typeof jti).toBe('string');
      // UUID v4 format
      expect(jti).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should return null for malformed tokens', () => {
      const jti = extractJti('invalid');
      expect(jti).toBeNull();
    });
  });

  describe('getRemainingTtl', () => {
    it('should return positive TTL for a non-expired token', () => {
      const token = signAccessToken(testPayload, privateKey, signOptions);
      const ttl = getRemainingTtl(token);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(15 * 60); // 15 minutes max
    });

    it('should return 0 for an expired token', () => {
      const token = signAccessToken(testPayload, privateKey, {
        ...signOptions,
        expiresIn: '0s',
      });

      const ttl = getRemainingTtl(token);
      expect(ttl).toBe(0);
    });

    it('should return 0 for a malformed token', () => {
      const ttl = getRemainingTtl('invalid-token');
      expect(ttl).toBe(0);
    });
  });
});

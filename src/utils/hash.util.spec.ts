/**
 * @file hash.util.spec.ts
 * @description Unit tests for password hashing and token hashing utilities.
 * Tests argon2id hashing, bcrypt hashing, SHA-256 token hashing, and
 * verification for both algorithms.
 */

import {
  hashPasswordArgon2,
  verifyPasswordArgon2,
  hashPasswordBcrypt,
  verifyPasswordBcrypt,
  hashToken,
} from './hash.util';

describe('HashUtil', () => {
  const testPassword = 'MySecureP@ssw0rd!';
  const argon2Options = { memoryCost: 4096, timeCost: 2, parallelism: 1 };

  describe('hashPasswordArgon2', () => {
    it('should hash a password with argon2id', async () => {
      const hash = await hashPasswordArgon2(testPassword, argon2Options);
      expect(hash).toBeDefined();
      expect(hash).toContain('$argon2id$');
      expect(hash).not.toBe(testPassword);
    });

    it('should produce different hashes for the same password (unique salts)', async () => {
      const hash1 = await hashPasswordArgon2(testPassword, argon2Options);
      const hash2 = await hashPasswordArgon2(testPassword, argon2Options);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyPasswordArgon2', () => {
    it('should verify a correct password', async () => {
      const hash = await hashPasswordArgon2(testPassword, argon2Options);
      const isValid = await verifyPasswordArgon2(hash, testPassword);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const hash = await hashPasswordArgon2(testPassword, argon2Options);
      const isValid = await verifyPasswordArgon2(hash, 'WrongPassword!');
      expect(isValid).toBe(false);
    });
  });

  describe('hashPasswordBcrypt', () => {
    it('should hash a password with bcrypt', async () => {
      const hash = await hashPasswordBcrypt(testPassword, 4);
      expect(hash).toBeDefined();
      expect(hash).toContain('$2');
      expect(hash).not.toBe(testPassword);
    });
  });

  describe('verifyPasswordBcrypt', () => {
    it('should verify a correct password', async () => {
      const hash = await hashPasswordBcrypt(testPassword, 4);
      const isValid = await verifyPasswordBcrypt(hash, testPassword);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const hash = await hashPasswordBcrypt(testPassword, 4);
      const isValid = await verifyPasswordBcrypt(hash, 'WrongPassword!');
      expect(isValid).toBe(false);
    });
  });

  describe('hashToken', () => {
    it('should produce a 64-char hex SHA-256 hash', () => {
      const hash = hashToken('my-refresh-token-uuid');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce the same hash for the same input (deterministic)', () => {
      const hash1 = hashToken('test-token');
      const hash2 = hashToken('test-token');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });
});

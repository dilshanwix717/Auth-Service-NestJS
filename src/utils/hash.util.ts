/**
 * @file hash.util.ts
 * @description Utility wrappers for password hashing and comparison using argon2id
 * (primary) and bcrypt (fallback). Centralizes all password hashing logic to ensure
 * consistent security parameters across the application.
 *
 * Architecture Role: Cross-Cutting Utility — used by CredentialService for password
 * hashing during registration and password verification during login.
 *
 * Key Concepts:
 * - argon2id is the primary hashing algorithm (winner of the Password Hashing Competition)
 *   - Resistant to GPU, ASIC, and side-channel attacks
 *   - Memory-hard: requires significant RAM, making parallel attacks expensive
 *   - Type: argon2id = hybrid of argon2i (side-channel resistant) + argon2d (GPU resistant)
 * - bcrypt is the fallback for environments where argon2 native bindings are unavailable
 * - SHA-256 is used for hashing refresh tokens and reset tokens (not passwords)
 *   - Appropriate because these tokens are already cryptographically random (high entropy)
 *   - Unlike passwords, tokens don't need slow hashing since they can't be guessed
 */

import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

/**
 * Hash a password using argon2id with the specified security parameters.
 *
 * @param password - The plaintext password to hash
 * @param options - argon2 configuration (memoryCost, timeCost, parallelism)
 * @returns The argon2id hash string (includes algorithm, salt, and parameters)
 *
 * @throws Error if argon2 native bindings are unavailable
 *
 * @example
 * const hash = await hashPasswordArgon2('MyP@ssw0rd!', {
 *   memoryCost: 65536,  // 64 MB — makes GPU attacks memory-prohibitive
 *   timeCost: 3,        // 3 iterations — balances security vs. latency
 *   parallelism: 4,     // 4 threads — utilizes multi-core CPUs
 * });
 */
export async function hashPasswordArgon2(
  password: string,
  options: { memoryCost: number; timeCost: number; parallelism: number },
): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: options.memoryCost,
    timeCost: options.timeCost,
    parallelism: options.parallelism,
  });
}

/**
 * Verify a password against an argon2id hash.
 *
 * @param hash - The stored argon2id hash
 * @param password - The plaintext password to verify
 * @returns true if the password matches the hash, false otherwise
 *
 * Security Note: argon2.verify uses constant-time comparison internally,
 * preventing timing attacks that could leak information about the hash.
 */
export async function verifyPasswordArgon2(
  hash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Hash a password using bcrypt (fallback when argon2 is unavailable).
 *
 * @param password - The plaintext password to hash
 * @param rounds - bcrypt cost factor (default: 12). Each increment doubles computation time.
 *                 12 rounds ≈ ~250ms on modern hardware, providing good security/performance balance.
 * @returns The bcrypt hash string
 */
export async function hashPasswordBcrypt(
  password: string,
  rounds: number = 12,
): Promise<string> {
  return bcrypt.hash(password, rounds);
}

/**
 * Verify a password against a bcrypt hash.
 *
 * @param hash - The stored bcrypt hash
 * @param password - The plaintext password to verify
 * @returns true if the password matches, false otherwise
 */
export async function verifyPasswordBcrypt(
  hash: string,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash a token (refresh token or reset token) using SHA-256.
 *
 * Why SHA-256 instead of argon2/bcrypt for tokens?
 * - Refresh tokens and reset tokens are already high-entropy (UUID v4 = 122 bits of randomness)
 * - They cannot be guessed or brute-forced, unlike user-chosen passwords
 * - SHA-256 is fast and deterministic, enabling efficient database lookups
 * - argon2/bcrypt would add ~250ms per lookup with no security benefit for random tokens
 *
 * @param token - The raw token string to hash
 * @returns The SHA-256 hex digest (64 characters)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

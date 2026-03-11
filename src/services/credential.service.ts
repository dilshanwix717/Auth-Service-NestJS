/**
 * =============================================================================
 * Credential Service — Password Hashing & Credential Management
 * =============================================================================
 *
 * @file credential.service.ts
 * @description Manages user credential lifecycle: password hashing, verification,
 *   credential creation, lookup, update, and deletion. Encapsulates the dual-algorithm
 *   hashing strategy (argon2id primary, bcrypt fallback) and provides a clean domain
 *   API for other services to interact with user credentials.
 *
 * Architecture Role: Business Logic Layer — Credential Management
 *   Sits between AuthService (which orchestrates authentication flows) and
 *   UserCredentialRepository (which handles raw database access). This service
 *   owns all password hashing logic and credential CRUD operations.
 *
 * Request Flow (registration):
 *   1. AuthService receives a registration request with email + password.
 *   2. AuthService calls CredentialService.createCredential(email, password).
 *   3. CredentialService hashes the password using argon2id (fallback: bcrypt).
 *   4. CredentialService calls UserCredentialRepository.createCredential() to persist.
 *   5. Returns the created UserCredential entity.
 *
 * Request Flow (login):
 *   1. AuthService calls CredentialService.findByEmail(email) to look up the user.
 *   2. AuthService calls CredentialService.verifyPassword(storedHash, inputPassword).
 *   3. CredentialService detects the algorithm from the hash prefix and uses the
 *      appropriate verification function (argon2 or bcrypt).
 *
 * Password Hashing Strategy:
 *   - Primary: argon2id — winner of the Password Hashing Competition, resistant to
 *     GPU/ASIC/side-channel attacks. Memory-hard (64 MB default).
 *   - Fallback: bcrypt — used only if argon2 native bindings fail (e.g., missing
 *     system libraries in certain environments). Logged as a warning.
 *   - Detection: On verification, the stored hash prefix ($argon2 vs $2b) determines
 *     which algorithm to use, enabling transparent migration from bcrypt to argon2.
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { UserCredential } from '../entities/user-credential.entity';
import {
  hashPasswordArgon2,
  verifyPasswordArgon2,
  hashPasswordBcrypt,
  verifyPasswordBcrypt,
} from '../utils/hash.util';
import { logger } from '../utils/logger.util';

@Injectable()
export class CredentialService {
  constructor(
    private readonly userCredentialRepository: UserCredentialRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Hashes a plaintext password using argon2id with configuration parameters
   * from the application config. Falls back to bcrypt if argon2 native bindings
   * are unavailable or encounter an error.
   *
   * @param password - The plaintext password to hash
   * @returns The hashed password string (argon2id or bcrypt format)
   * @throws Error only if both argon2 AND bcrypt hashing fail (extremely unlikely)
   */
  async hashPassword(password: string): Promise<string> {
    try {
      const memoryCost = this.configService.get<number>('hashing.argon2.memoryCost') ?? 65536;
      const timeCost = this.configService.get<number>('hashing.argon2.timeCost') ?? 3;
      const parallelism = this.configService.get<number>('hashing.argon2.parallelism') ?? 4;

      return await hashPasswordArgon2(password, { memoryCost, timeCost, parallelism });
    } catch (error) {
      logger.warn('argon2id hashing failed, falling back to bcrypt', {
        error: error instanceof Error ? error.message : String(error),
      });

      return await hashPasswordBcrypt(password);
    }
  }

  /**
   * Verifies a plaintext password against a stored hash. Automatically detects
   * the hashing algorithm from the hash prefix:
   *   - `$argon2` → argon2id verification
   *   - `$2b` or `$2a` → bcrypt verification
   *
   * This detection enables transparent migration: users with legacy bcrypt hashes
   * can still authenticate, and their hash can be upgraded to argon2 on next
   * password change.
   *
   * @param storedHash - The stored password hash from the database
   * @param password - The plaintext password to verify
   * @returns true if the password matches the hash, false otherwise
   * @throws Error if the hash format is unrecognized
   */
  async verifyPassword(storedHash: string, password: string): Promise<boolean> {
    if (storedHash.startsWith('$argon2')) {
      return verifyPasswordArgon2(storedHash, password);
    }

    if (storedHash.startsWith('$2b') || storedHash.startsWith('$2a')) {
      return verifyPasswordBcrypt(storedHash, password);
    }

    logger.error('Unrecognized password hash format', {
      hashPrefix: storedHash.substring(0, 6),
    });
    return false;
  }

  /**
   * Creates a new user credential by hashing the password and persisting via
   * the repository. The default role ('USER') is assigned by the repository.
   *
   * @param email - The user's email address (must be unique)
   * @param password - The plaintext password to hash and store
   * @returns The newly created UserCredential entity with generated UUID
   * @throws Error if the email already exists (database unique constraint)
   */
  async createCredential(email: string, password: string): Promise<UserCredential> {
    const passwordHash = await this.hashPassword(password);
    return this.userCredentialRepository.createCredential({
      email,
      passwordHash,
    });
  }

  /**
   * Finds a user credential by email address (case-insensitive).
   *
   * @param email - The email address to search for
   * @returns The matching UserCredential or null if not found
   */
  async findByEmail(email: string): Promise<UserCredential | null> {
    return this.userCredentialRepository.findByEmail(email);
  }

  /**
   * Finds a user credential by its unique UUID.
   *
   * @param id - The UUID of the user credential record
   * @returns The matching UserCredential or null if not found
   */
  async findById(id: string): Promise<UserCredential | null> {
    return this.userCredentialRepository.findById(id);
  }

  /**
   * Updates a user's password by hashing the new password and persisting via
   * the repository. Also updates the passwordChangedAt timestamp.
   *
   * @param userId - UUID of the user whose password is being changed
   * @param newPassword - The new plaintext password to hash and store
   * @returns Promise that resolves when the password has been updated
   * @throws Error if the user is not found or the update fails
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await this.hashPassword(newPassword);
    await this.userCredentialRepository.updatePassword(userId, passwordHash);
  }

  /**
   * Hard-deletes a user credential record from the database. This operation is
   * idempotent — deleting a non-existent credential returns false without error.
   *
   * @param userId - UUID of the user credential to delete
   * @returns true if the record was found and deleted, false if not found
   */
  async deleteCredential(userId: string): Promise<boolean> {
    return this.userCredentialRepository.deleteCredential(userId);
  }
}

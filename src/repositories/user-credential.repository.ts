/**
 * @file user-credential.repository.ts
 * @description Repository layer for the UserCredential entity. Abstracts all database
 * access for user credential operations including CRUD, account locking/unlocking,
 * brute-force protection (failed attempt tracking), and login metadata updates.
 *
 * Architecture Role: Data Access Layer — Injectable NestJS service that wraps a
 * TypeORM Repository<UserCredential>. Contains no business logic; only data access patterns.
 *
 * Consumed by: AuthService, AccountService, scheduled lockout-expiry job.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { UserCredential, UserStatus } from '../entities/user-credential.entity';

@Injectable()
export class UserCredentialRepository {
  constructor(
    @InjectRepository(UserCredential)
    private readonly repo: Repository<UserCredential>,
  ) {}

  /**
   * Find a user credential by its unique UUID.
   * @param id - UUID of the user credential record
   * @returns The matching UserCredential or null if not found
   */
  async findById(id: string): Promise<UserCredential | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Find a user credential by email address (case-insensitive).
   * Uses LOWER() for case-insensitive comparison to ensure consistent
   * lookup regardless of how the email was originally stored.
   * @param email - Email address to search for
   * @returns The matching UserCredential or null if not found
   */
  async findByEmail(email: string): Promise<UserCredential | null> {
    return this.repo
      .createQueryBuilder('uc')
      .where('LOWER(uc.email) = LOWER(:email)', { email })
      .getOne();
  }

  /**
   * Create a new user credential record.
   * Defaults roles to ['USER'] if not provided.
   * @param data - Object containing email, passwordHash, and optional roles array
   * @returns The newly created UserCredential entity with generated UUID
   */
  async createCredential(data: {
    email: string;
    passwordHash: string;
    roles?: string[];
  }): Promise<UserCredential> {
    const credential = this.repo.create({
      email: data.email,
      passwordHash: data.passwordHash,
      roles: data.roles ?? ['USER'],
    });
    return this.repo.save(credential);
  }

  /**
   * Update the account status of a user credential.
   * @param id - UUID of the user credential
   * @param status - New UserStatus value (ACTIVE, LOCKED, BANNED, or DELETED)
   */
  async updateStatus(id: string, status: UserStatus): Promise<void> {
    await this.repo.update(id, { status });
  }

  /**
   * Atomically increment the failed login attempt counter and return the new count.
   * Uses a raw query with RETURNING to ensure atomicity under concurrent access.
   * @param id - UUID of the user credential
   * @returns The updated failedLoginAttempts count after incrementing
   */
  async incrementFailedAttempts(id: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(UserCredential)
      .set({ failedLoginAttempts: () => '"failed_login_attempts" + 1' })
      .where('id = :id', { id })
      .returning('failed_login_attempts')
      .execute();

    return result.raw[0].failed_login_attempts;
  }

  /**
   * Reset the failed login attempt counter to zero.
   * Called after a successful login to clear brute-force tracking.
   * @param id - UUID of the user credential
   */
  async resetFailedAttempts(id: string): Promise<void> {
    await this.repo.update(id, { failedLoginAttempts: 0 });
  }

  /**
   * Lock a user account by setting status to LOCKED and the lockedUntil timestamp.
   * Pass null for lockedUntil to lock indefinitely (requires manual unlock).
   * @param id - UUID of the user credential
   * @param lockedUntil - Timestamp when the lock expires, or null for indefinite lock
   */
  async lockAccount(id: string, lockedUntil: Date | null): Promise<void> {
    await this.repo.update(id, {
      status: UserStatus.LOCKED,
      lockedUntil,
    });
  }

  /**
   * Unlock a user account by restoring ACTIVE status, resetting the failed
   * login attempt counter to zero, and clearing the lockedUntil timestamp.
   * @param id - UUID of the user credential
   */
  async unlockAccount(id: string): Promise<void> {
    await this.repo.update(id, {
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  /**
   * Record a successful login by updating the last login timestamp and IP address.
   * @param id - UUID of the user credential
   * @param ip - IP address of the client performing the login
   */
  async updateLastLogin(id: string, ip: string): Promise<void> {
    await this.repo.update(id, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    });
  }

  /**
   * Update the user's password hash and record the password change timestamp.
   * @param id - UUID of the user credential
   * @param passwordHash - New argon2id/bcrypt password hash
   */
  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.repo.update(id, {
      passwordHash,
      passwordChangedAt: new Date(),
    });
  }

  /**
   * Replace the roles array for a user credential.
   * After updating roles, active tokens should be revoked to force re-authentication
   * with updated role claims.
   * @param id - UUID of the user credential
   * @param roles - New array of role name strings (e.g., ['USER', 'ADMIN'])
   */
  async updateRoles(id: string, roles: string[]): Promise<void> {
    await this.repo.update(id, { roles });
  }

  /**
   * Hard-delete a user credential record from the database.
   * @param id - UUID of the user credential to delete
   * @returns true if the record was found and deleted, false if not found
   */
  async deleteCredential(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  /**
   * Find all locked accounts whose lock period has expired and are eligible
   * for automatic unlocking. Used by the scheduled lockout-expiry job.
   * @returns Array of UserCredential entities with expired locks
   */
  async findLockedAccountsToUnlock(): Promise<UserCredential[]> {
    return this.repo.find({
      where: {
        status: UserStatus.LOCKED,
        lockedUntil: LessThan(new Date()),
      },
    });
  }
}

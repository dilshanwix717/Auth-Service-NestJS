/**
 * @file password-reset-token.repository.ts
 * @description Repository layer for the PasswordResetToken entity. Abstracts all
 * database access for password reset token operations including creation, lookup,
 * consumption (mark as used), and cleanup of expired/used tokens.
 *
 * Architecture Role: Data Access Layer — Injectable NestJS service that wraps a
 * TypeORM Repository<PasswordResetToken>. Contains no business logic; only data access patterns.
 *
 * Consumed by: PasswordResetService, scheduled token-cleanup job.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordResetToken } from '../entities/password-reset-token.entity';

@Injectable()
export class PasswordResetTokenRepository {
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly repo: Repository<PasswordResetToken>,
  ) {}

  /**
   * Create and persist a new password reset token record.
   * @param data - Token creation payload containing userId, tokenHash, and expiresAt
   * @returns The newly created PasswordResetToken entity with generated UUID
   */
  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken> {
    const token = this.repo.create({
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    });
    return this.repo.save(token);
  }

  /**
   * Find a password reset token by its SHA-256 hash.
   * Used to validate a reset token presented by the user.
   * @param tokenHash - SHA-256 hash of the raw reset token
   * @returns The matching PasswordResetToken or null if not found
   */
  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  /**
   * Mark a password reset token as consumed by setting used=true and recording
   * the usedAt timestamp. Once marked, the token cannot be used again.
   * @param id - UUID of the password reset token to mark as used
   */
  async markAsUsed(id: string): Promise<void> {
    await this.repo.update(id, {
      used: true,
      usedAt: new Date(),
    });
  }

  /**
   * Delete expired or already-used password reset tokens from the database.
   * Cleanup criteria:
   * - Tokens whose expiresAt is in the past (expired)
   * - Tokens that have already been used (used=true)
   *
   * Used by the scheduled token-cleanup job to prevent unbounded table growth.
   * @returns The number of deleted token records
   */
  async deleteExpiredOrUsed(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(PasswordResetToken)
      .where('expires_at < :now', { now: new Date() })
      .orWhere('used = true')
      .execute();

    return result.affected ?? 0;
  }

  /**
   * Delete all password reset tokens belonging to a specific user.
   * Called after a successful password reset to invalidate any remaining
   * unused reset tokens for the same user.
   * @param userId - UUID of the user whose reset tokens should be deleted
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }
}

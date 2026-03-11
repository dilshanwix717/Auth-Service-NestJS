/**
 * @file refresh-token.repository.ts
 * @description Repository layer for the RefreshToken entity. Abstracts all database
 * access for refresh token operations including creation, revocation, rotation tracking,
 * active session counting, and expired/revoked token cleanup.
 *
 * Architecture Role: Data Access Layer — Injectable NestJS service that wraps a
 * TypeORM Repository<RefreshToken>. Contains no business logic; only data access patterns.
 *
 * Consumed by: TokenService, SessionService, scheduled token-cleanup job.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  /**
   * Create and persist a new refresh token record.
   * The issuedAt field is automatically set to the current timestamp.
   * @param data - Token creation payload including userId, tokenHash, expiresAt,
   *               and optional device metadata (deviceFingerprint, ipAddress, userAgent)
   * @returns The newly created RefreshToken entity with generated UUID
   */
  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    deviceFingerprint?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RefreshToken> {
    const token = this.repo.create({
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      issuedAt: new Date(),
      deviceFingerprint: data.deviceFingerprint ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
    });
    return this.repo.save(token);
  }

  /**
   * Find a refresh token by its SHA-256 hash.
   * Used during token refresh to locate the stored token record.
   * @param tokenHash - SHA-256 hash of the raw refresh token
   * @returns The matching RefreshToken or null if not found
   */
  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  /**
   * Find a refresh token by its unique UUID.
   * @param id - UUID of the refresh token record
   * @returns The matching RefreshToken or null if not found
   */
  async findById(id: string): Promise<RefreshToken | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Find all active (non-revoked, non-expired) refresh tokens for a user.
   * @param userId - UUID of the user
   * @returns Array of active RefreshToken entities for the user
   */
  async findActiveByUserId(userId: string): Promise<RefreshToken[]> {
    return this.repo.find({
      where: {
        userId,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  /**
   * Revoke a single refresh token by marking it as revoked with a timestamp and reason.
   * @param id - UUID of the refresh token to revoke
   * @param reason - Human-readable revocation reason (e.g., 'rotated', 'logout', 'security_incident')
   */
  async revokeToken(id: string, reason: string): Promise<void> {
    await this.repo.update(id, {
      revoked: true,
      revokedAt: new Date(),
      revocationReason: reason,
    });
  }

  /**
   * Revoke all active (non-revoked) refresh tokens belonging to a user.
   * Used during logout-all, password change, or security incident response.
   * @param userId - UUID of the user whose tokens should be revoked
   * @param reason - Human-readable revocation reason
   * @returns The number of tokens that were revoked
   */
  async revokeAllByUserId(userId: string, reason: string): Promise<number> {
    const result = await this.repo.update(
      { userId, revoked: false },
      {
        revoked: true,
        revokedAt: new Date(),
        revocationReason: reason,
      },
    );
    return result.affected ?? 0;
  }

  /**
   * Set the replacedByTokenId field to track the token rotation chain.
   * Used during token refresh to link the old token to its replacement.
   * @param id - UUID of the token being replaced
   * @param replacedByTokenId - UUID of the new token that replaces this one
   */
  async setReplacedBy(id: string, replacedByTokenId: string): Promise<void> {
    await this.repo.update(id, { replacedByTokenId });
  }

  /**
   * Update the lastUsedAt timestamp to the current time.
   * Called each time the token is successfully used for a refresh operation.
   * @param id - UUID of the refresh token
   */
  async updateLastUsed(id: string): Promise<void> {
    await this.repo.update(id, { lastUsedAt: new Date() });
  }

  /**
   * Count the number of active (non-revoked, non-expired) sessions for a user.
   * Used for max concurrent session enforcement.
   * @param userId - UUID of the user
   * @returns The count of active refresh tokens
   */
  async countActiveByUserId(userId: string): Promise<number> {
    return this.repo.count({
      where: {
        userId,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  /**
   * Find the oldest active (non-revoked, non-expired) refresh token for a user.
   * Used for max session enforcement — the oldest session can be revoked to make
   * room for a new one.
   * @param userId - UUID of the user
   * @returns The oldest active RefreshToken or null if none exist
   */
  async findOldestActiveByUserId(userId: string): Promise<RefreshToken | null> {
    return this.repo.findOne({
      where: {
        userId,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { issuedAt: 'ASC' },
    });
  }

  /**
   * Delete expired and old revoked tokens from the database.
   * Cleanup criteria:
   * - Tokens whose expiresAt is in the past (expired)
   * - Tokens that were revoked more than 7 days ago (retention period for forensics)
   *
   * Used by the scheduled token-cleanup job to prevent unbounded table growth.
   * @returns The total number of deleted token records
   */
  async deleteExpiredAndRevoked(): Promise<number> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(RefreshToken)
      .where('expires_at < :now', { now })
      .orWhere('revoked = true AND revoked_at < :sevenDaysAgo', { sevenDaysAgo })
      .execute();

    return result.affected ?? 0;
  }
}

/**
 * @file expired-refresh-token-cleanup.job.ts
 * @description Scheduled job that cleans up expired and revoked refresh tokens
 * from the database. Runs daily at 2 AM to keep the refresh_tokens table lean
 * and prevent unbounded growth.
 *
 * Architecture Role: Background Job — runs on a cron schedule via @nestjs/schedule.
 *
 * Key Concepts:
 * - Removes tokens where expires_at < NOW() (naturally expired)
 * - Removes tokens where revoked = true and revoked_at is older than 7 days
 * - Keeps recently revoked tokens for a grace period (reuse detection forensics)
 * - Logs the number of cleaned records for monitoring
 */

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { logger } from '../utils/logger.util';

@Injectable()
export class ExpiredRefreshTokenCleanupJob {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  /**
   * Runs daily at 2:00 AM to clean up expired and revoked refresh tokens.
   * Removes tokens that are naturally expired or have been revoked for over 7 days.
   *
   * We keep recently revoked tokens for forensic purposes — if a reuse detection
   * event occurs, we need the rotation chain intact for investigation.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'expired-refresh-token-cleanup',
    timeZone: 'UTC',
  })
  async handleCleanup(): Promise<void> {
    logger.info('Starting expired refresh token cleanup job');

    try {
      const deletedCount = await this.refreshTokenRepository.deleteExpiredAndRevoked();
      logger.info('Expired refresh token cleanup completed', { deletedCount });
    } catch (error) {
      logger.error('Expired refresh token cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

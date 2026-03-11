/**
 * @file expired-password-reset-cleanup.job.ts
 * @description Scheduled job that cleans up expired and used password reset tokens.
 * Runs daily at 3 AM to keep the password_reset_tokens table lean.
 *
 * Architecture Role: Background Job — runs on a cron schedule via @nestjs/schedule.
 *
 * Key Concepts:
 * - Removes tokens where expires_at < NOW() (expired)
 * - Removes tokens where used = true (already consumed)
 * - No grace period needed — reset tokens have no forensic value after use/expiry
 */

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { logger } from '../utils/logger.util';

@Injectable()
export class ExpiredPasswordResetCleanupJob {
  constructor(
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
  ) {}

  /**
   * Runs daily at 3:00 AM to clean up expired and used password reset tokens.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'expired-password-reset-cleanup',
    timeZone: 'UTC',
  })
  async handleCleanup(): Promise<void> {
    logger.info('Starting expired password reset token cleanup job');

    try {
      const deletedCount = await this.passwordResetTokenRepository.deleteExpiredOrUsed();
      logger.info('Expired password reset token cleanup completed', { deletedCount });
    } catch (error) {
      logger.error('Expired password reset token cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

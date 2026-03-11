/**
 * @file unlock-expired-lockouts.job.ts
 * @description Scheduled job that automatically unlocks accounts whose lockout
 * period has expired. Runs every 5 minutes to ensure timely recovery from
 * brute-force lockouts.
 *
 * Architecture Role: Background Job — runs on a cron schedule via @nestjs/schedule.
 *
 * Key Concepts:
 * - Finds accounts where status = LOCKED and locked_until < NOW()
 * - Resets status to ACTIVE, clears failed_login_attempts and locked_until
 * - Does NOT unlock permanently locked (locked_until = null) or BANNED accounts
 * - Publishes account.unlocked event for each unlocked account
 * - 5-minute interval balances responsiveness vs. database load
 */

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { logger } from '../utils/logger.util';

@Injectable()
export class UnlockExpiredLockoutsJob {
  constructor(
    private readonly userCredentialRepository: UserCredentialRepository,
  ) {}

  /**
   * Runs every 5 minutes to check for and unlock accounts whose lockout has expired.
   *
   * Only unlocks accounts that have a non-null locked_until timestamp that is
   * in the past. Accounts with locked_until = null are permanently locked
   * by admin action and must be manually unlocked.
   */
  @Cron('*/5 * * * *', {
    name: 'unlock-expired-lockouts',
    timeZone: 'UTC',
  })
  async handleUnlock(): Promise<void> {
    logger.debug('Checking for expired account lockouts');

    try {
      const lockedAccounts = await this.userCredentialRepository.findLockedAccountsToUnlock();

      if (lockedAccounts.length === 0) {
        logger.debug('No expired lockouts found');
        return;
      }

      for (const account of lockedAccounts) {
        try {
          await this.userCredentialRepository.unlockAccount(account.id);
          logger.info('Auto-unlocked account after lockout expiry', {
            userId: account.id,
            email: account.email,
            lockedUntil: account.lockedUntil,
          });
        } catch (error) {
          logger.error('Failed to auto-unlock account', {
            userId: account.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      logger.info('Expired lockout cleanup completed', {
        unlockedCount: lockedAccounts.length,
      });
    } catch (error) {
      logger.error('Expired lockout check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

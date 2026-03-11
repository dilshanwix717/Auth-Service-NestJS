/**
 * =============================================================================
 * Account Service — Account Lifecycle Management
 * =============================================================================
 *
 * @file account.service.ts
 * @description Manages account lifecycle operations: locking, unlocking, banning,
 *   and credential deletion. Each operation includes token revocation, domain event
 *   publishing, and audit logging for compliance and forensic traceability.
 *
 * Architecture Role: Business Logic Layer — Account Management
 *   Typically invoked by admin endpoints (AdminController) or automated security
 *   systems (e.g., after brute-force detection). Coordinates with TokenService
 *   for session invalidation, EventService for downstream notifications, and
 *   AuditLogRepository for compliance logging.
 *
 * Request Flow (account lock):
 *   1. Admin endpoint or brute-force detection calls AccountService.lockAccount().
 *   2. AccountService updates the user's status to LOCKED via the repository.
 *   3. All active tokens (refresh + cached access) are revoked via TokenService.
 *   4. An ACCOUNT_LOCKED domain event is published via EventService.
 *   5. An audit log entry is created for compliance.
 *
 * Request Flow (account ban):
 *   1. Admin calls AccountService.banUser().
 *   2. User status is set to BANNED (permanent, requires admin intervention to reverse).
 *   3. All tokens are revoked.
 *   4. ACCOUNT_BANNED event published + audit log created.
 *
 * Request Flow (credential deletion — compensating transaction):
 *   1. External service (e.g., user-service) requests credential deletion.
 *   2. AccountService.deleteCredentials() hard-deletes the credential record.
 *   3. CASCADE delete removes associated refresh tokens and reset tokens.
 *   4. Operation is idempotent: deleting non-existent credentials succeeds silently.
 *   5. CREDENTIALS_DELETED event published + audit log created.
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { UserStatus } from '../entities/user-credential.entity';
import { AuditOutcome } from '../entities/audit-log.entity';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { TokenService } from './token.service';
import { EventService } from './event.service';
import { ErrorMessages } from '../constants/error-messages.constant';
import { logger } from '../utils/logger.util';
import { generateTraceId } from '../utils/trace-id.util';

@Injectable()
export class AccountService {
  constructor(
    private readonly userCredentialRepository: UserCredentialRepository,
    private readonly tokenService: TokenService,
    private readonly eventService: EventService,
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  /**
   * Locks a user account, preventing authentication for a specified duration.
   * Revokes all active tokens, publishes a domain event, and creates an audit log.
   *
   * If durationMinutes is provided, the account will be automatically unlocked
   * after that period by the scheduled lockout-expiry job. If omitted, the
   * lock is indefinite and requires manual admin intervention.
   *
   * @param userId - UUID of the user to lock
   * @param reason - Reason for locking (e.g., 'brute_force', 'admin_action', 'suspicious_activity')
   * @param durationMinutes - Optional lock duration in minutes; null for indefinite lock
   * @param adminUserId - Optional UUID of the admin performing the lock
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when the account has been locked
   * @throws Error if the user is not found
   */
  async lockAccount(
    userId: string,
    reason: string,
    durationMinutes?: number,
    adminUserId?: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    const user = await this.userCredentialRepository.findById(userId);
    if (!user) {
      throw new Error(ErrorMessages.AUTH_USER_NOT_FOUND);
    }

    // Calculate lock expiry
    let lockedUntil: Date | null = null;
    if (durationMinutes) {
      lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + durationMinutes);
    }

    await this.userCredentialRepository.lockAccount(userId, lockedUntil);

    // Revoke all active tokens to force immediate session invalidation
    await this.tokenService.revokeAllUserTokens(userId, `account_locked:${reason}`);

    logger.info('Account locked', {
      userId,
      reason,
      lockedUntil: lockedUntil?.toISOString() ?? 'indefinite',
      adminUserId,
      traceId: trace,
    });

    // Publish domain event
    await this.eventService.publishAccountLocked(
      userId,
      reason,
      lockedUntil?.toISOString() ?? null,
      trace,
    );

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'ACCOUNT_LOCKED',
      userId,
      outcome: AuditOutcome.SUCCESS,
      metadata: {
        reason,
        lockedUntil: lockedUntil?.toISOString() ?? 'indefinite',
        adminUserId: adminUserId ?? null,
      },
      traceId: trace,
    });
  }

  /**
   * Unlocks a previously locked user account, restoring ACTIVE status and
   * resetting the failed login attempt counter. Publishes a domain event
   * and creates an audit log.
   *
   * @param userId - UUID of the user to unlock
   * @param adminUserId - Optional UUID of the admin performing the unlock, or 'system' for auto-unlock
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when the account has been unlocked
   * @throws Error if the user is not found
   */
  async unlockAccount(
    userId: string,
    adminUserId?: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    const user = await this.userCredentialRepository.findById(userId);
    if (!user) {
      throw new Error(ErrorMessages.AUTH_USER_NOT_FOUND);
    }

    await this.userCredentialRepository.unlockAccount(userId);

    const unlockedBy = adminUserId ?? 'system';

    logger.info('Account unlocked', { userId, unlockedBy, traceId: trace });

    // Publish domain event
    await this.eventService.publishAccountUnlocked(userId, unlockedBy, trace);

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'ACCOUNT_UNLOCKED',
      userId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { unlockedBy },
      traceId: trace,
    });
  }

  /**
   * Permanently bans a user account. Sets status to BANNED, revokes all tokens,
   * publishes a domain event, and creates an audit log. Banned accounts require
   * explicit admin action to unban (no auto-unlock).
   *
   * @param userId - UUID of the user to ban
   * @param reason - Reason for the ban (e.g., 'terms_violation', 'fraud')
   * @param adminUserId - Optional UUID of the admin issuing the ban
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when the account has been banned
   * @throws Error if the user is not found
   */
  async banUser(
    userId: string,
    reason: string,
    adminUserId?: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    const user = await this.userCredentialRepository.findById(userId);
    if (!user) {
      throw new Error(ErrorMessages.AUTH_USER_NOT_FOUND);
    }

    await this.userCredentialRepository.updateStatus(userId, UserStatus.BANNED);

    // Revoke all active tokens immediately
    await this.tokenService.revokeAllUserTokens(userId, `account_banned:${reason}`);

    const bannedBy = adminUserId ?? 'system';

    logger.info('Account banned', { userId, reason, bannedBy, traceId: trace });

    // Publish domain event
    await this.eventService.publishAccountBanned(userId, reason, bannedBy, trace);

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'ACCOUNT_BANNED',
      userId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { reason, bannedBy },
      traceId: trace,
    });
  }

  /**
   * Hard-deletes a user's credential record from the database. This is an
   * idempotent compensating transaction — calling it for a non-existent
   * user succeeds without error.
   *
   * CASCADE deletes will automatically remove associated refresh tokens and
   * password reset tokens. Publishes a domain event and creates an audit log.
   *
   * @param userId - UUID of the user whose credentials to delete
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when the credentials have been deleted
   */
  async deleteCredentials(
    userId: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    const deleted = await this.userCredentialRepository.deleteCredential(userId);

    if (deleted) {
      logger.info('Credentials deleted', { userId, traceId: trace });
    } else {
      // Idempotent: credential didn't exist — not an error
      logger.info('Credential deletion no-op — record not found', { userId, traceId: trace });
    }

    // Publish event regardless (downstream services may need to clean up their data)
    await this.eventService.publishCredentialsDeleted(userId, trace);

    // Audit log
    await this.auditLogRepository.create({
      eventType: 'CREDENTIALS_DELETED',
      userId,
      outcome: AuditOutcome.SUCCESS,
      metadata: { deleted, idempotent: !deleted },
      traceId: trace,
    });
  }
}

/**
 * =============================================================================
 * Event Service — Domain Event Publisher
 * =============================================================================
 *
 * @file event.service.ts
 * @description Publishes all authentication domain events to RabbitMQ via the
 *   RabbitMQClient. Acts as the single gateway for event emission, ensuring
 *   consistent event payloads, routing keys, and error handling across the
 *   entire Auth Service.
 *
 * Architecture Role: Business Logic Layer — Event Publishing
 *   Sits between the application services (AuthService, AccountService, etc.)
 *   and the infrastructure layer (RabbitMQClient). Services call EventService
 *   methods with domain-specific parameters; EventService constructs the
 *   standardized payload and delegates to RabbitMQClient.publish().
 *
 * Request Flow:
 *   1. A service method completes a domain action (e.g., user registration).
 *   2. The service calls the appropriate EventService.publish*() method with
 *      relevant domain data and a traceId for distributed tracing.
 *   3. EventService builds a structured payload and calls
 *      RabbitMQClient.publish(eventType, payload, traceId).
 *   4. RabbitMQClient publishes to the 'auth.events' topic exchange with the
 *      event type as the routing key.
 *   5. Downstream consumers (notification-service, analytics, etc.) receive
 *      events via their bound queues.
 *
 * Design Decisions:
 *   - Fire-and-forget: Events are published asynchronously. Publishing failures
 *     are logged but do NOT cause the originating operation to fail. The
 *     RabbitMQClient handles buffering during outages.
 *   - Every method includes a traceId parameter to enable cross-service
 *     correlation in log aggregation and monitoring systems.
 *   - Timestamps are included in every event payload for consumer-side ordering
 *     and deduplication.
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { RabbitMQClient } from '../clients/rabbitmq.client';
import { RabbitMQEvents } from '../constants/rabbitmq-events.constant';
import { logger } from '../utils/logger.util';

@Injectable()
export class EventService {
  constructor(private readonly rabbitMQClient: RabbitMQClient) {}

  /**
   * Publishes a USER_ACCOUNT_CREATED event after successful registration.
   *
   * @param userId - UUID of the newly created user
   * @param email - Email address of the new user
   * @param roles - Array of role names assigned to the user (e.g., ['USER'])
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishUserCreated(
    userId: string,
    email: string,
    roles: string[],
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.USER_ACCOUNT_CREATED, {
      userId,
      email,
      roles,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a USER_LOGGED_IN event after successful authentication.
   *
   * @param userId - UUID of the authenticated user
   * @param email - Email address of the authenticated user
   * @param ip - IP address of the client
   * @param deviceFingerprint - SHA-256 device fingerprint derived from UA + IP
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishUserLoggedIn(
    userId: string,
    email: string,
    ip: string,
    deviceFingerprint: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.USER_LOGGED_IN, {
      userId,
      email,
      ip,
      deviceFingerprint,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a USER_LOGGED_OUT event when a user explicitly logs out.
   *
   * @param userId - UUID of the user logging out
   * @param jti - JWT ID of the access token being revoked
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishUserLoggedOut(
    userId: string,
    jti: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.USER_LOGGED_OUT, {
      userId,
      jti,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a TOKEN_REVOKED event when a single token is revoked.
   *
   * @param userId - UUID of the token owner
   * @param jti - JWT ID or refresh token ID being revoked
   * @param reason - Human-readable revocation reason
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishTokenRevoked(
    userId: string,
    jti: string,
    reason: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.TOKEN_REVOKED, {
      userId,
      jti,
      reason,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes an ALL_TOKENS_REVOKED event when all tokens for a user are revoked.
   *
   * @param userId - UUID of the affected user
   * @param reason - Reason for bulk revocation (e.g., 'password_change', 'security_incident')
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishAllTokensRevoked(
    userId: string,
    reason: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.ALL_TOKENS_REVOKED, {
      userId,
      reason,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes an ACCOUNT_LOCKED event when an account is locked.
   *
   * @param userId - UUID of the locked user
   * @param reason - Reason for locking (e.g., 'brute_force', 'admin_action')
   * @param lockedUntil - ISO-8601 timestamp when the lock expires, or null for indefinite
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishAccountLocked(
    userId: string,
    reason: string,
    lockedUntil: string | null,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.ACCOUNT_LOCKED, {
      userId,
      reason,
      lockedUntil,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes an ACCOUNT_UNLOCKED event when an account lock is lifted.
   *
   * @param userId - UUID of the unlocked user
   * @param unlockedBy - UUID of the admin who unlocked, or 'system' for auto-unlock
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishAccountUnlocked(
    userId: string,
    unlockedBy: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.ACCOUNT_UNLOCKED, {
      userId,
      unlockedBy,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes an ACCOUNT_BANNED event when a user is permanently banned.
   *
   * @param userId - UUID of the banned user
   * @param reason - Reason for the ban
   * @param bannedBy - UUID of the admin who issued the ban
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishAccountBanned(
    userId: string,
    reason: string,
    bannedBy: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.ACCOUNT_BANNED, {
      userId,
      reason,
      bannedBy,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a CREDENTIALS_DELETED event after credential hard-delete.
   *
   * @param userId - UUID of the user whose credentials were deleted
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishCredentialsDeleted(
    userId: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.CREDENTIALS_DELETED, {
      userId,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a PASSWORD_RESET_REQUESTED event to trigger the email notification.
   * The raw reset token is included so the notification service can build the reset link.
   *
   * @param userId - UUID of the user requesting the reset
   * @param email - Email address to send the reset link to
   * @param resetToken - Raw (unhashed) reset token for the email link
   * @param expiresAt - ISO-8601 timestamp when the reset token expires
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishPasswordResetRequested(
    userId: string,
    email: string,
    resetToken: string,
    expiresAt: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.PASSWORD_RESET_REQUESTED, {
      userId,
      email,
      resetToken,
      expiresAt,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a PASSWORD_RESET_COMPLETED event after a successful password reset.
   *
   * @param userId - UUID of the user whose password was reset
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishPasswordResetCompleted(
    userId: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.PASSWORD_RESET_COMPLETED, {
      userId,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a ROLE_ASSIGNED event when a role is added to a user.
   *
   * @param userId - UUID of the user receiving the role
   * @param role - Name of the role being assigned (e.g., 'ADMIN')
   * @param assignedBy - UUID of the admin who assigned the role
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishRoleAssigned(
    userId: string,
    role: string,
    assignedBy: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.ROLE_ASSIGNED, {
      userId,
      role,
      assignedBy,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a ROLE_REVOKED event when a role is removed from a user.
   *
   * @param userId - UUID of the user losing the role
   * @param role - Name of the role being revoked
   * @param revokedBy - UUID of the admin who revoked the role
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishRoleRevoked(
    userId: string,
    role: string,
    revokedBy: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.ROLE_REVOKED, {
      userId,
      role,
      revokedBy,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a LOGIN_FAILED event after a failed authentication attempt.
   * Used by downstream analytics and security monitoring services.
   *
   * @param email - Email address used in the failed attempt
   * @param ip - IP address of the client
   * @param attemptCount - Current consecutive failed attempt count for this account
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishLoginFailed(
    email: string,
    ip: string,
    attemptCount: number,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.LOGIN_FAILED, {
      email,
      ip,
      attemptCount,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Publishes a SUSPICIOUS_ACTIVITY_DETECTED event for anomaly detection.
   * Triggered when unusual patterns are detected (e.g., login from new device
   * after multiple failures, token reuse detection).
   *
   * @param userId - UUID of the affected user
   * @param ip - IP address of the suspicious client
   * @param deviceFingerprint - Device fingerprint of the suspicious client
   * @param traceId - Distributed trace ID for cross-service correlation
   * @returns Promise that resolves when the event is published (or buffered)
   */
  async publishSuspiciousActivity(
    userId: string,
    ip: string,
    deviceFingerprint: string,
    traceId: string,
  ): Promise<void> {
    await this.safePublish(RabbitMQEvents.SUSPICIOUS_ACTIVITY_DETECTED, {
      userId,
      ip,
      deviceFingerprint,
      timestamp: new Date().toISOString(),
    }, traceId);
  }

  /**
   * Internal helper that wraps RabbitMQClient.publish() with error handling.
   * Publishing failures are logged but never propagated — domain operations
   * must not fail because an event could not be emitted.
   *
   * @param eventType - RabbitMQ event routing key from RabbitMQEvents enum
   * @param payload - Structured event payload
   * @param traceId - Correlation ID forwarded to the message envelope
   */
  private async safePublish(
    eventType: string,
    payload: Record<string, unknown>,
    traceId: string,
  ): Promise<void> {
    try {
      await this.rabbitMQClient.publish(eventType, payload, traceId);
      logger.debug('Domain event published', { eventType, traceId });
    } catch (error) {
      logger.error('Failed to publish domain event', {
        eventType,
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

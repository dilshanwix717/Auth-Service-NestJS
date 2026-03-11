/**
 * @file audit-event.interface.ts
 * @description Audit event payload published to RabbitMQ for security logging.
 *
 * Every security-relevant action (login, logout, password change, role mutation, etc.)
 * produces an `AuditEvent` that is published to the message broker and optionally
 * persisted to a dedicated audit log store. The `metadata` bag allows each event type
 * to carry additional context without expanding the core interface.
 */

export interface AuditEvent {
  /** Event type identifier (e.g., a value from `RabbitMQEvents`). */
  eventType: string;

  /** UUID of the user who triggered the event (if applicable). */
  userId?: string;

  /** Email of the user involved in the event. */
  email?: string;

  /** Source IP address of the request. */
  ipAddress?: string;

  /** User-Agent header of the originating request. */
  userAgent?: string;

  /** Whether the action succeeded or failed. */
  outcome: 'SUCCESS' | 'FAILURE';

  /** Arbitrary key-value pairs with event-specific details. */
  metadata?: Record<string, any>;

  /** Distributed tracing identifier for cross-service correlation. */
  traceId?: string;
}

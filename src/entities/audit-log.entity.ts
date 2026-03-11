/**
 * @file audit-log.entity.ts
 * @description TypeORM entity for the audit_logs table. This is an append-only table
 * used for compliance, security forensics, and incident response. Records all significant
 * authentication events (login, logout, registration, token revocation, role changes,
 * account lock/ban, etc.).
 *
 * Architecture Role: Data Layer — maps to the audit_logs PostgreSQL table.
 * Used by AuditLogRepository (append-only writes, never update or delete).
 *
 * Key Concepts:
 * - APPEND-ONLY: Rows are never updated or deleted (compliance requirement)
 * - Captures IP address, user agent, and trace ID for cross-service correlation
 * - JSONB metadata field allows flexible storage of event-specific context
 * - Composite indexes on (user_id, created_at) and (event_type, created_at) for efficient querying
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** Outcome of the audited operation */
export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

@Entity('audit_logs')
@Index('IDX_audit_logs_user_id_created_at', ['userId', 'createdAt'])
@Index('IDX_audit_logs_event_type_created_at', ['eventType', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Type of authentication event being recorded.
   * Examples: LOGIN, LOGOUT, REGISTER, TOKEN_REVOKED, ACCOUNT_LOCKED, ROLE_ASSIGNED
   */
  @Column({ type: 'varchar', length: 100, nullable: false, name: 'event_type' })
  eventType!: string;

  /**
   * ID of the user involved in the event.
   * Nullable because some events (e.g., failed login for non-existent email)
   * may not have an associated user.
   */
  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId!: string | null;

  /** Email associated with the event (for failed login tracking) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  /** IP address of the client that triggered the event */
  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
  ipAddress!: string | null;

  /** User-Agent header of the client */
  @Column({ type: 'text', nullable: true, name: 'user_agent' })
  userAgent!: string | null;

  /** Whether the operation succeeded or failed */
  @Column({ type: 'enum', enum: AuditOutcome, nullable: false })
  outcome!: AuditOutcome;

  /**
   * Flexible JSONB field for event-specific context.
   * Examples: { reason: 'brute_force', jti: 'xxx', deviceFingerprint: 'yyy' }
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  /**
   * Distributed trace ID for cross-service correlation.
   * Propagated from X-Request-ID header or generated if not present.
   */
  @Column({ type: 'varchar', length: 36, nullable: true, name: 'trace_id' })
  traceId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  @Index('IDX_audit_logs_created_at')
  createdAt!: Date;
}

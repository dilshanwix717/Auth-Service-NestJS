/**
 * @file audit-log.repository.ts
 * @description Repository layer for the AuditLog entity. Provides APPEND-ONLY database
 * access for audit log entries. This repository intentionally omits update and delete
 * operations to enforce the immutability compliance requirement.
 *
 * Architecture Role: Data Access Layer — Injectable NestJS service that wraps a
 * TypeORM Repository<AuditLog>. Contains no business logic; only data access patterns.
 *
 * Consumed by: AuditService for recording authentication events and querying audit history.
 *
 * IMPORTANT: This is an APPEND-ONLY repository. Rows are never updated or deleted
 * to satisfy compliance and forensic investigation requirements.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditOutcome } from '../entities/audit-log.entity';

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * Insert a new audit log entry. This is the only write operation permitted
   * on the audit_logs table (append-only).
   * @param data - Audit event payload containing eventType, outcome, and optional
   *               context fields (userId, email, ipAddress, userAgent, metadata, traceId)
   * @returns The newly created AuditLog entity with generated UUID and timestamp
   */
  async create(data: {
    eventType: string;
    userId?: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
    outcome: AuditOutcome;
    metadata?: Record<string, unknown>;
    traceId?: string;
  }): Promise<AuditLog> {
    const entry = this.repo.create({
      eventType: data.eventType,
      userId: data.userId ?? null,
      email: data.email ?? null,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      outcome: data.outcome,
      metadata: data.metadata ?? null,
      traceId: data.traceId ?? null,
    });
    return this.repo.save(entry);
  }

  /**
   * Retrieve paginated audit log entries for a specific user, ordered by
   * most recent first.
   * @param userId - UUID of the user whose audit history to retrieve
   * @param options - Optional pagination parameters (limit defaults to 50, offset defaults to 0)
   * @returns Array of AuditLog entries for the specified user
   */
  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<AuditLog[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Retrieve paginated audit log entries filtered by event type, ordered by
   * most recent first. Optionally filter entries created after a specific date.
   * @param eventType - The event type to filter by (e.g., 'LOGIN', 'ACCOUNT_LOCKED')
   * @param options - Optional pagination and date-range parameters
   *                  (limit defaults to 50, offset defaults to 0, since filters by createdAt)
   * @returns Array of AuditLog entries matching the specified event type
   */
  async findByEventType(
    eventType: string,
    options?: { limit?: number; offset?: number; since?: Date },
  ): Promise<AuditLog[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const qb = this.repo
      .createQueryBuilder('log')
      .where('log.eventType = :eventType', { eventType })
      .orderBy('log.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (options?.since) {
      qb.andWhere('log.createdAt >= :since', { since: options.since });
    }

    return qb.getMany();
  }
}

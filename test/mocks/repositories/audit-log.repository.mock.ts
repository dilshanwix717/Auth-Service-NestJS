/**
 * @file audit-log.repository.mock.ts
 * @description Mock AuditLogRepository for standalone testing. Captures audit log
 * entries in an array for assertion. Append-only, matching the real repository.
 *
 * Architecture Role: Test Infrastructure — replaces the real repository in unit tests.
 */

export interface MockAuditLog {
  id: string;
  eventType: string;
  userId: string | null;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  metadata: Record<string, unknown> | null;
  traceId: string | null;
  createdAt: Date;
}

let logCounter = 0;

export class MockAuditLogRepository {
  private logs: MockAuditLog[] = [];

  async create(data: {
    eventType: string;
    userId?: string;
    email?: string;
    ipAddress?: string;
    userAgent?: string;
    outcome: 'SUCCESS' | 'FAILURE';
    metadata?: Record<string, unknown>;
    traceId?: string;
  }): Promise<MockAuditLog> {
    logCounter++;
    const log: MockAuditLog = {
      id: `mock-audit-${logCounter}`,
      eventType: data.eventType,
      userId: data.userId || null,
      email: data.email || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      outcome: data.outcome,
      metadata: data.metadata || null,
      traceId: data.traceId || null,
      createdAt: new Date(),
    };
    this.logs.push(log);
    return log;
  }

  async findByUserId(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<MockAuditLog[]> {
    const filtered = this.logs.filter((l) => l.userId === userId);
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;
    return filtered.slice(offset, offset + limit);
  }

  async findByEventType(
    eventType: string,
    options?: { limit?: number; offset?: number; since?: Date },
  ): Promise<MockAuditLog[]> {
    let filtered = this.logs.filter((l) => l.eventType === eventType);
    if (options?.since) {
      filtered = filtered.filter((l) => l.createdAt >= options.since!);
    }
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;
    return filtered.slice(offset, offset + limit);
  }

  /** Get all logs for test assertions */
  getAllLogs(): MockAuditLog[] {
    return [...this.logs];
  }

  /** Get logs filtered by event type */
  getLogsByType(eventType: string): MockAuditLog[] {
    return this.logs.filter((l) => l.eventType === eventType);
  }

  /** Reset mock state between tests */
  reset(): void {
    this.logs = [];
    logCounter = 0;
  }
}

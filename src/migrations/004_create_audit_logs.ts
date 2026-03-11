/**
 * @file 004_create_audit_logs.ts
 * @description TypeORM migration to create the audit_logs table.
 * Append-only table for recording all significant authentication events
 * for compliance, security forensics, and incident response.
 *
 * Table: audit_logs
 * - Never updated or deleted (compliance requirement)
 * - JSONB metadata column for flexible event-specific context
 * - Composite indexes for efficient querying by user and event type
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1700000000004 implements MigrationInterface {
  name = 'CreateAuditLogs1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create audit outcome enum
    await queryRunner.query(`
      CREATE TYPE "audit_outcome_enum" AS ENUM ('SUCCESS', 'FAILURE')
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "event_type" VARCHAR(100) NOT NULL,
        "user_id" UUID,
        "email" VARCHAR(255),
        "ip_address" VARCHAR(45),
        "user_agent" TEXT,
        "outcome" "audit_outcome_enum" NOT NULL,
        "metadata" JSONB,
        "trace_id" VARCHAR(36),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    // Composite index for querying a specific user's audit history
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_user_id_created_at"
        ON "audit_logs" ("user_id", "created_at" DESC)
    `);

    // Composite index for querying events of a specific type
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_event_type_created_at"
        ON "audit_logs" ("event_type", "created_at" DESC)
    `);

    // Index on created_at for time-range queries
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_created_at"
        ON "audit_logs" ("created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_event_type_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_user_id_created_at"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "audit_outcome_enum"`);
  }
}

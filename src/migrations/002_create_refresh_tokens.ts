/**
 * @file 002_create_refresh_tokens.ts
 * @description TypeORM migration to create the refresh_tokens table.
 * Stores hashed refresh tokens for user sessions with rotation tracking.
 *
 * Table: refresh_tokens
 * - Foreign key to user_credentials with CASCADE delete
 * - Indexes on token_hash (unique), user_id, and expires_at
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokens1700000000002 implements MigrationInterface {
  name = 'CreateRefreshTokens1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "token_hash" VARCHAR(64) NOT NULL,
        "issued_at" TIMESTAMP NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP NOT NULL,
        "revoked" BOOLEAN NOT NULL DEFAULT false,
        "revoked_at" TIMESTAMP,
        "revocation_reason" VARCHAR(255),
        "device_fingerprint" VARCHAR(255),
        "ip_address" VARCHAR(45),
        "user_agent" TEXT,
        "last_used_at" TIMESTAMP,
        "replaced_by_token_id" UUID,
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user_id" FOREIGN KEY ("user_id")
          REFERENCES "user_credentials"("id") ON DELETE CASCADE
      )
    `);

    // Unique index on token_hash for O(1) token lookup during refresh
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash")
    `);

    // Index on user_id for querying all sessions belonging to a user
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")
    `);

    // Index on expires_at for the cleanup job that removes expired tokens
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_expires_at"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_token_hash"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}

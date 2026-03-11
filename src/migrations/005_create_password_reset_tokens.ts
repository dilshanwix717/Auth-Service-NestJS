/**
 * @file 005_create_password_reset_tokens.ts
 * @description TypeORM migration to create the password_reset_tokens table.
 * Stores hashed password reset tokens that are single-use and time-limited.
 *
 * Table: password_reset_tokens
 * - Foreign key to user_credentials with CASCADE delete
 * - Unique index on token_hash for O(1) lookup
 * - Tokens are cleaned up by a scheduled job after expiry or use
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasswordResetTokens1700000000005 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "token_hash" VARCHAR(64) NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "used" BOOLEAN NOT NULL DEFAULT false,
        "used_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_password_reset_tokens_user_id" FOREIGN KEY ("user_id")
          REFERENCES "user_credentials"("id") ON DELETE CASCADE
      )
    `);

    // Unique index on token_hash for fast reset token validation
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_password_reset_tokens_token_hash"
        ON "password_reset_tokens" ("token_hash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_password_reset_tokens_token_hash"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}

/**
 * @file 001_create_user_credentials.ts
 * @description TypeORM migration to create the user_credentials table.
 * This is the primary table for storing user authentication credentials.
 *
 * Table: user_credentials
 * - Stores email (unique), password hash, account status, roles, brute-force tracking fields
 * - Indexes on email (unique) and status for fast lookups
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserCredentials1700000000001 implements MigrationInterface {
  name = 'CreateUserCredentials1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the account status enum type
    await queryRunner.query(`
      CREATE TYPE "user_status_enum" AS ENUM ('ACTIVE', 'LOCKED', 'BANNED', 'DELETED')
    `);

    await queryRunner.query(`
      CREATE TABLE "user_credentials" (
        "id" UUID NOT NULL DEFAULT uuid_generate_in_ossp() DEFAULT gen_random_uuid(),
        "email" VARCHAR(255) NOT NULL,
        "password_hash" VARCHAR(512) NOT NULL,
        "status" "user_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "roles" TEXT[] NOT NULL DEFAULT ARRAY['USER'],
        "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
        "locked_until" TIMESTAMP,
        "last_login_at" TIMESTAMP,
        "last_login_ip" VARCHAR(45),
        "password_changed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_credentials" PRIMARY KEY ("id")
      )
    `);

    // Unique index on email for fast login lookups and duplicate detection
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_user_credentials_email" ON "user_credentials" ("email")
    `);

    // Index on status for filtering active/locked/banned accounts
    await queryRunner.query(`
      CREATE INDEX "IDX_user_credentials_status" ON "user_credentials" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_user_credentials_status"`);
    await queryRunner.query(`DROP INDEX "IDX_user_credentials_email"`);
    await queryRunner.query(`DROP TABLE "user_credentials"`);
    await queryRunner.query(`DROP TYPE "user_status_enum"`);
  }
}

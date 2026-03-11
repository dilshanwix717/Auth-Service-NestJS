/**
 * @file 003_create_roles.ts
 * @description TypeORM migration to create the roles table and seed default roles.
 * Seeds three default roles: USER, ADMIN, MODERATOR.
 *
 * Table: roles
 * - Defines role names, descriptions, and permissions arrays
 * - Default roles are seeded as part of the migration
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoles1700000000003 implements MigrationInterface {
  name = 'CreateRoles1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "name" VARCHAR(50) NOT NULL,
        "description" TEXT,
        "permissions" TEXT[],
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roles_name" UNIQUE ("name")
      )
    `);

    // Seed default roles
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "description", "permissions") VALUES
        (gen_random_uuid(), 'USER', 'Default user role with basic access permissions', ARRAY['profile:read', 'profile:update', 'content:read']),
        (gen_random_uuid(), 'ADMIN', 'Administrator role with full system access', ARRAY['profile:read', 'profile:update', 'content:read', 'content:write', 'content:delete', 'users:read', 'users:write', 'users:delete', 'roles:manage', 'tokens:revoke', 'accounts:manage']),
        (gen_random_uuid(), 'MODERATOR', 'Moderator role with content management access', ARRAY['profile:read', 'profile:update', 'content:read', 'content:write', 'content:delete', 'users:read'])
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "roles"`);
  }
}

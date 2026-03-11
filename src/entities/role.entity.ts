/**
 * @file role.entity.ts
 * @description TypeORM entity for the roles table. Defines role definitions used
 * for Role-Based Access Control (RBAC). Default roles are USER, ADMIN, and MODERATOR,
 * seeded via database migration.
 *
 * Architecture Role: Data Layer — maps to the roles PostgreSQL table.
 * Referenced by RoleService for role management operations.
 *
 * Key Concepts:
 * - Roles are stored as standalone entities for extensibility (future permissions system)
 * - Users reference roles by name (string) in their roles[] array on UserCredential
 * - Permissions array allows fine-grained permission control per role
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Unique role name (e.g., USER, ADMIN, MODERATOR).
   * Used as the reference value in UserCredential.roles[] and JWT claims.
   */
  @Column({ type: 'varchar', length: 50, unique: true, nullable: false })
  name!: string;

  /** Human-readable description of the role's purpose */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Array of specific permissions granted by this role.
   * Enables fine-grained access control beyond role-level checks.
   * Example: ['users:read', 'users:write', 'tokens:revoke']
   */
  @Column({ type: 'text', array: true, nullable: true })
  permissions!: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

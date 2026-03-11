/**
 * @file user-credential.entity.ts
 * @description TypeORM entity for the user_credentials table. This is the primary entity
 * in the Auth Service, storing user authentication credentials including email, hashed
 * password, account status, roles, and brute-force protection fields.
 *
 * Architecture Role: Data Layer — maps directly to the user_credentials PostgreSQL table.
 * Used by UserCredentialRepository for all credential CRUD operations.
 *
 * Key Concepts:
 * - Password is stored as an argon2id hash (never plaintext)
 * - Account status controls whether a user can authenticate (ACTIVE, LOCKED, BANNED, DELETED)
 * - Failed login tracking enables automatic account lockout (brute-force protection)
 * - Roles array determines RBAC permissions embedded in JWT access tokens
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';

/**
 * Account status enum values matching the AccountStatus constant.
 * - ACTIVE: Normal operating state, user can authenticate
 * - LOCKED: Temporarily locked due to brute-force or admin action
 * - BANNED: Permanently banned, cannot authenticate
 * - DELETED: Soft-deleted via compensating transaction
 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  BANNED = 'BANNED',
  DELETED = 'DELETED',
}

@Entity('user_credentials')
export class UserCredential {
  /** Unique identifier for the user credential record (UUID v4, auto-generated) */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * User's email address — unique across all credentials.
   * Indexed for fast lookup during login and duplicate detection during registration.
   */
  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  @Index('IDX_user_credentials_email', { unique: true })
  email!: string;

  /**
   * Hashed password using argon2id (primary) or bcrypt (fallback).
   * SECURITY: Never store plaintext passwords. This field contains only the hash output.
   * argon2id is resistant to GPU/ASIC attacks (winner of Password Hashing Competition).
   */
  @Column({ type: 'varchar', length: 512, nullable: false, name: 'password_hash' })
  passwordHash!: string;

  /**
   * Account status controlling authentication eligibility.
   * - ACTIVE: Can authenticate normally
   * - LOCKED: Temporarily locked (brute-force or admin). Check lockedUntil for auto-unlock.
   * - BANNED: Permanently blocked. Requires admin intervention.
   * - DELETED: Credentials removed via compensating transaction.
   */
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  @Index('IDX_user_credentials_status')
  status!: UserStatus;

  /**
   * User roles for RBAC. Stored as a text array in PostgreSQL.
   * Default role is ['USER']. Roles are embedded in JWT access tokens.
   * When roles change, active tokens must be revoked to force re-authentication
   * with updated role claims.
   */
  @Column({ type: 'text', array: true, default: () => "ARRAY['USER']" })
  roles!: string[];

  /**
   * Counter for consecutive failed login attempts.
   * Incremented on each failed login, reset to 0 on successful login.
   * When this reaches MAX_LOGIN_ATTEMPTS, account status is set to LOCKED.
   * This is the primary brute-force protection mechanism.
   */
  @Column({ type: 'integer', default: 0, name: 'failed_login_attempts' })
  failedLoginAttempts!: number;

  /**
   * Timestamp until which the account remains locked.
   * null = not locked (or permanently locked if status is BANNED).
   * Used by the unlock-expired-lockouts scheduled job to auto-unlock accounts.
   */
  @Column({ type: 'timestamp', nullable: true, name: 'locked_until' })
  lockedUntil!: Date | null;

  /** Timestamp of the user's last successful login */
  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
  lastLoginAt!: Date | null;

  /** IP address of the user's last successful login */
  @Column({ type: 'varchar', length: 45, nullable: true, name: 'last_login_ip' })
  lastLoginIp!: string | null;

  /** Timestamp of the last password change (used for security auditing) */
  @Column({ type: 'timestamp', nullable: true, name: 'password_changed_at' })
  passwordChangedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

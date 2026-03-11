/**
 * @file password-reset-token.entity.ts
 * @description TypeORM entity for the password_reset_tokens table. Stores hashed
 * password reset tokens used in the secure password reset flow.
 *
 * Architecture Role: Data Layer — maps to the password_reset_tokens PostgreSQL table.
 *
 * Key Concepts:
 * - Reset tokens are cryptographically random (UUID v4), short-lived (15 min default)
 * - Only the SHA-256 hash is stored; raw token is sent to the user via email
 * - Tokens are single-use: once consumed, marked as used and cannot be reused
 * - After password reset, all active sessions (refresh tokens) are revoked
 * - Expired/used tokens are cleaned up by a scheduled job
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserCredential } from './user-credential.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Foreign key to the user requesting the password reset */
  @Column({ type: 'uuid', nullable: false, name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserCredential, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserCredential;

  /**
   * SHA-256 hash of the raw reset token (UUID v4).
   * SECURITY: Never store raw reset tokens. The raw token is sent to the user
   * (via notification-service email) and hashed here for comparison.
   */
  @Column({ type: 'varchar', length: 64, unique: true, nullable: false, name: 'token_hash' })
  @Index('IDX_password_reset_tokens_token_hash', { unique: true })
  tokenHash!: string;

  /** Token expiration timestamp (default: 15 minutes from creation) */
  @Column({ type: 'timestamp', nullable: false, name: 'expires_at' })
  expiresAt!: Date;

  /**
   * Whether the token has been consumed (used to reset the password).
   * Single-use only: once true, the token cannot be used again.
   */
  @Column({ type: 'boolean', default: false })
  used!: boolean;

  /** When the token was consumed (null if not yet used) */
  @Column({ type: 'timestamp', nullable: true, name: 'used_at' })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

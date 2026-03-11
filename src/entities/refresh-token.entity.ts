/**
 * @file refresh-token.entity.ts
 * @description TypeORM entity for the refresh_tokens table. Stores hashed refresh tokens
 * associated with user sessions. Refresh tokens are opaque (UUID v4, NOT JWTs) and are
 * stored as SHA-256 hashes — the raw token is returned to the client only once at issuance.
 *
 * Architecture Role: Data Layer — maps to the refresh_tokens PostgreSQL table.
 *
 * Key Concepts:
 * - Refresh tokens are opaque UUIDs, not JWTs (prevents token inspection by clients)
 * - Only the SHA-256 hash is stored; raw token is never persisted
 * - Token rotation: each use invalidates the old token and issues a new one
 * - Reuse detection: if a revoked token is presented, it indicates theft —
 *   all tokens for that user are immediately revoked (rotation anomaly detection)
 * - replaced_by_token_id tracks the rotation chain for forensic analysis
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserCredential } from './user-credential.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Foreign key to the user who owns this refresh token session.
   * Indexed for efficient lookup of all sessions belonging to a user.
   */
  @Column({ type: 'uuid', nullable: false, name: 'user_id' })
  @Index('IDX_refresh_tokens_user_id')
  userId!: string;

  @ManyToOne(() => UserCredential, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserCredential;

  /**
   * SHA-256 hash of the raw refresh token (UUID v4).
   * SECURITY: Never store raw refresh tokens. The raw token is returned
   * to the client only once at issuance. On subsequent requests, the client
   * presents the raw token, which is hashed and compared against this field.
   */
  @Column({ type: 'varchar', length: 64, unique: true, nullable: false, name: 'token_hash' })
  @Index('IDX_refresh_tokens_token_hash', { unique: true })
  tokenHash!: string;

  /** When the token was issued */
  @Column({ type: 'timestamp', nullable: false, name: 'issued_at' })
  issuedAt!: Date;

  /**
   * Token expiration timestamp. Default is 7 days from issuance.
   * Indexed for the expired-token cleanup scheduled job.
   */
  @Column({ type: 'timestamp', nullable: false, name: 'expires_at' })
  @Index('IDX_refresh_tokens_expires_at')
  expiresAt!: Date;

  /**
   * Whether this token has been revoked (used, rotated, or explicitly revoked).
   * Once revoked, the token cannot be used again.
   * If a revoked token is presented, it triggers reuse detection (possible theft).
   */
  @Column({ type: 'boolean', default: false })
  revoked!: boolean;

  /** When the token was revoked (null if still active) */
  @Column({ type: 'timestamp', nullable: true, name: 'revoked_at' })
  revokedAt!: Date | null;

  /** Reason for revocation (e.g., 'rotated', 'logout', 'admin_revoke', 'security_incident') */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'revocation_reason' })
  revocationReason!: string | null;

  /**
   * Normalized device fingerprint derived from User-Agent and IP.
   * Used for device-aware session management (e.g., "revoke session on device X").
   */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'device_fingerprint' })
  deviceFingerprint!: string | null;

  /** IP address of the client when the token was issued */
  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
  ipAddress!: string | null;

  /** User-Agent header of the client when the token was issued */
  @Column({ type: 'text', nullable: true, name: 'user_agent' })
  userAgent!: string | null;

  /** When the token was last used for a refresh operation */
  @Column({ type: 'timestamp', nullable: true, name: 'last_used_at' })
  lastUsedAt!: Date | null;

  /**
   * ID of the token that replaced this one during rotation.
   * Forms a chain: token A → token B → token C.
   * Used for reuse detection: if token A is presented after rotation to B,
   * we can trace the entire chain and revoke all tokens in the family.
   */
  @Column({ type: 'uuid', nullable: true, name: 'replaced_by_token_id' })
  replacedByTokenId!: string | null;
}

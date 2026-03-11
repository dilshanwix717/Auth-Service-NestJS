/**
 * @file user-credential.repository.mock.ts
 * @description Mock UserCredentialRepository for standalone testing. Uses an in-memory
 * Map to simulate CRUD operations, unique constraint violations, and not-found scenarios.
 *
 * Architecture Role: Test Infrastructure — replaces the real repository in unit tests.
 *
 * Features:
 * - Simulates unique email constraint (throws on duplicate)
 * - Tracks failed login attempts with lockout
 * - Supports all repository methods with in-memory storage
 */

import { UserStatus } from '../../src/entities/user-credential.entity';

export interface MockUserCredential {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  roles: string[];
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

let idCounter = 0;

export class MockUserCredentialRepository {
  private store = new Map<string, MockUserCredential>();

  async findById(id: string): Promise<MockUserCredential | null> {
    return this.store.get(id) || null;
  }

  async findByEmail(email: string): Promise<MockUserCredential | null> {
    const normalized = email.toLowerCase();
    for (const cred of this.store.values()) {
      if (cred.email.toLowerCase() === normalized) return cred;
    }
    return null;
  }

  async createCredential(data: {
    email: string;
    passwordHash: string;
    roles?: string[];
  }): Promise<MockUserCredential> {
    // Simulate unique constraint
    const existing = await this.findByEmail(data.email);
    if (existing) {
      const error = new Error('duplicate key value violates unique constraint');
      (error as any).code = '23505';
      throw error;
    }

    idCounter++;
    const credential: MockUserCredential = {
      id: `mock-user-${idCounter}`,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      status: UserStatus.ACTIVE,
      roles: data.roles || ['USER'],
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIp: null,
      passwordChangedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.store.set(credential.id, credential);
    return credential;
  }

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    const cred = this.store.get(id);
    if (cred) {
      cred.status = status;
      cred.updatedAt = new Date();
    }
  }

  async incrementFailedAttempts(id: string): Promise<number> {
    const cred = this.store.get(id);
    if (!cred) return 0;
    cred.failedLoginAttempts++;
    cred.updatedAt = new Date();
    return cred.failedLoginAttempts;
  }

  async resetFailedAttempts(id: string): Promise<void> {
    const cred = this.store.get(id);
    if (cred) {
      cred.failedLoginAttempts = 0;
      cred.updatedAt = new Date();
    }
  }

  async lockAccount(id: string, lockedUntil: Date | null): Promise<void> {
    const cred = this.store.get(id);
    if (cred) {
      cred.status = UserStatus.LOCKED;
      cred.lockedUntil = lockedUntil;
      cred.updatedAt = new Date();
    }
  }

  async unlockAccount(id: string): Promise<void> {
    const cred = this.store.get(id);
    if (cred) {
      cred.status = UserStatus.ACTIVE;
      cred.failedLoginAttempts = 0;
      cred.lockedUntil = null;
      cred.updatedAt = new Date();
    }
  }

  async updateLastLogin(id: string, ip: string): Promise<void> {
    const cred = this.store.get(id);
    if (cred) {
      cred.lastLoginAt = new Date();
      cred.lastLoginIp = ip;
      cred.updatedAt = new Date();
    }
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    const cred = this.store.get(id);
    if (cred) {
      cred.passwordHash = passwordHash;
      cred.passwordChangedAt = new Date();
      cred.updatedAt = new Date();
    }
  }

  async updateRoles(id: string, roles: string[]): Promise<void> {
    const cred = this.store.get(id);
    if (cred) {
      cred.roles = roles;
      cred.updatedAt = new Date();
    }
  }

  async deleteCredential(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async findLockedAccountsToUnlock(): Promise<MockUserCredential[]> {
    const now = new Date();
    const result: MockUserCredential[] = [];
    for (const cred of this.store.values()) {
      if (cred.status === UserStatus.LOCKED && cred.lockedUntil && cred.lockedUntil < now) {
        result.push(cred);
      }
    }
    return result;
  }

  /** Reset mock state between tests */
  reset(): void {
    this.store.clear();
    idCounter = 0;
  }

  /** Seed a credential directly for test setup */
  seed(credential: MockUserCredential): void {
    this.store.set(credential.id, credential);
  }
}

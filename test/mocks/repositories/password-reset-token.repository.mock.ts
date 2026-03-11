/**
 * @file password-reset-token.repository.mock.ts
 * @description Mock PasswordResetTokenRepository for standalone testing. Uses an
 * in-memory Map to simulate password reset token CRUD and cleanup operations.
 *
 * Architecture Role: Test Infrastructure — replaces the real repository in unit tests.
 */

export interface MockPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  usedAt: Date | null;
  createdAt: Date;
}

let resetTokenCounter = 0;

export class MockPasswordResetTokenRepository {
  private store = new Map<string, MockPasswordResetToken>();

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<MockPasswordResetToken> {
    resetTokenCounter++;
    const token: MockPasswordResetToken = {
      id: `mock-prt-${resetTokenCounter}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      used: false,
      usedAt: null,
      createdAt: new Date(),
    };
    this.store.set(token.id, token);
    return token;
  }

  async findByTokenHash(tokenHash: string): Promise<MockPasswordResetToken | null> {
    for (const token of this.store.values()) {
      if (token.tokenHash === tokenHash) return token;
    }
    return null;
  }

  async markAsUsed(id: string): Promise<void> {
    const token = this.store.get(id);
    if (token) {
      token.used = true;
      token.usedAt = new Date();
    }
  }

  async deleteExpiredOrUsed(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [id, token] of this.store.entries()) {
      if (token.expiresAt < now || token.used) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }

  async deleteByUserId(userId: string): Promise<void> {
    for (const [id, token] of this.store.entries()) {
      if (token.userId === userId) {
        this.store.delete(id);
      }
    }
  }

  /** Reset mock state between tests */
  reset(): void {
    this.store.clear();
    resetTokenCounter = 0;
  }

  /** Seed a token directly for test setup */
  seed(token: MockPasswordResetToken): void {
    this.store.set(token.id, token);
  }
}

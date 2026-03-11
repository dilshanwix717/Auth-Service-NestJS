/**
 * @file refresh-token.repository.mock.ts
 * @description Mock RefreshTokenRepository for standalone testing. Uses an in-memory
 * Map to simulate refresh token CRUD, revocation, and rotation chain tracking.
 *
 * Architecture Role: Test Infrastructure — replaces the real repository in unit tests.
 */

export interface MockRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  revoked: boolean;
  revokedAt: Date | null;
  revocationReason: string | null;
  deviceFingerprint: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastUsedAt: Date | null;
  replacedByTokenId: string | null;
}

let tokenCounter = 0;

export class MockRefreshTokenRepository {
  private store = new Map<string, MockRefreshToken>();

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    deviceFingerprint?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<MockRefreshToken> {
    tokenCounter++;
    const token: MockRefreshToken = {
      id: `mock-rt-${tokenCounter}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      issuedAt: new Date(),
      expiresAt: data.expiresAt,
      revoked: false,
      revokedAt: null,
      revocationReason: null,
      deviceFingerprint: data.deviceFingerprint || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      lastUsedAt: null,
      replacedByTokenId: null,
    };
    this.store.set(token.id, token);
    return token;
  }

  async findByTokenHash(tokenHash: string): Promise<MockRefreshToken | null> {
    for (const token of this.store.values()) {
      if (token.tokenHash === tokenHash) return token;
    }
    return null;
  }

  async findById(id: string): Promise<MockRefreshToken | null> {
    return this.store.get(id) || null;
  }

  async findActiveByUserId(userId: string): Promise<MockRefreshToken[]> {
    const now = new Date();
    return Array.from(this.store.values()).filter(
      (t) => t.userId === userId && !t.revoked && t.expiresAt > now,
    );
  }

  async revokeToken(id: string, reason: string): Promise<void> {
    const token = this.store.get(id);
    if (token) {
      token.revoked = true;
      token.revokedAt = new Date();
      token.revocationReason = reason;
    }
  }

  async revokeAllByUserId(userId: string, reason: string): Promise<number> {
    let count = 0;
    for (const token of this.store.values()) {
      if (token.userId === userId && !token.revoked) {
        token.revoked = true;
        token.revokedAt = new Date();
        token.revocationReason = reason;
        count++;
      }
    }
    return count;
  }

  async setReplacedBy(id: string, replacedByTokenId: string): Promise<void> {
    const token = this.store.get(id);
    if (token) {
      token.replacedByTokenId = replacedByTokenId;
    }
  }

  async updateLastUsed(id: string): Promise<void> {
    const token = this.store.get(id);
    if (token) {
      token.lastUsedAt = new Date();
    }
  }

  async countActiveByUserId(userId: string): Promise<number> {
    return (await this.findActiveByUserId(userId)).length;
  }

  async findOldestActiveByUserId(userId: string): Promise<MockRefreshToken | null> {
    const active = await this.findActiveByUserId(userId);
    if (active.length === 0) return null;
    return active.sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())[0];
  }

  async deleteExpiredAndRevoked(): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [id, token] of this.store.entries()) {
      if (token.expiresAt < now || token.revoked) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }

  /** Reset mock state between tests */
  reset(): void {
    this.store.clear();
    tokenCounter = 0;
  }

  /** Seed a token directly for test setup */
  seed(token: MockRefreshToken): void {
    this.store.set(token.id, token);
  }
}

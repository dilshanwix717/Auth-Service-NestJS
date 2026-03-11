/**
 * @file redis.mock.ts
 * @description Mock Redis client for standalone testing. Uses an in-memory Map
 * to simulate Redis SET/GET/DEL operations with TTL support.
 *
 * Architecture Role: Test Infrastructure — replaces the real RedisClient in unit
 * and integration tests to eliminate external Redis dependency.
 *
 * How it works:
 * - Stores key-value pairs in a Map<string, { value: string; expiresAt?: number }>
 * - TTL is tracked via expiresAt timestamp; expired keys are lazily cleaned on access
 * - blacklistToken/isTokenBlacklisted use the same Map with 'blacklist:' prefix
 * - All methods are async to match the real client interface
 *
 * Usage in tests:
 * ```ts
 * const mockRedis = new MockRedisClient();
 * // Inject mockRedis where RedisClient is expected
 * ```
 */

interface StoredValue {
  value: string;
  expiresAt?: number; // Unix timestamp in ms
}

export class MockRedisClient {
  private store = new Map<string, StoredValue>();
  private connected = true;

  /**
   * Simulate SET with optional TTL.
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const entry: StoredValue = { value };
    if (ttlSeconds) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
    this.store.set(key, entry);
  }

  /**
   * Simulate GET — returns null if key doesn't exist or is expired.
   */
  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check TTL expiry
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Simulate DEL.
   */
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Simulate EXISTS.
   */
  async exists(key: string): Promise<boolean> {
    const value = await this.get(key); // Handles TTL check
    return value !== null;
  }

  /**
   * Simulate blacklistToken — stores JTI with TTL in blacklist: namespace.
   */
  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.set(`blacklist:${jti}`, '1', ttlSeconds);
  }

  /**
   * Simulate isTokenBlacklisted — checks blacklist: namespace.
   * In mock, never fails (no fail-open needed), just checks the store.
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    return this.exists(`blacklist:${jti}`);
  }

  /**
   * Simulate ping — always returns true unless manually set to disconnected.
   */
  async ping(): Promise<boolean> {
    return this.connected;
  }

  /** Get raw store for test assertions */
  getStore(): Map<string, StoredValue> {
    return this.store;
  }

  /** Reset mock state between tests */
  reset(): void {
    this.store.clear();
    this.connected = true;
  }

  /** Simulate connection failure for testing fail-open behavior */
  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  /** Simulate getClient (returns null in mock) */
  getClient(): null {
    return null;
  }
}

# Patterns

Security and architectural patterns used in the Auth Service, with implementation details and attack scenarios they defend against.

---

## Token Rotation and Reuse Detection

### Pattern

Every time a refresh token is used, it is **invalidated** and a new token pair (access + refresh) is issued. If a previously invalidated refresh token is presented, all tokens for that user are revoked immediately.

### Implementation

```
Database: refresh_tokens table
Fields:
  - token_hash (SHA-256 of raw UUID)
  - revoked (boolean)
  - revoked_at (timestamp)
  - revocation_reason ('rotated' | 'logout' | 'admin_revoke' | 'reuse_detected')
  - replaced_by_token_id (UUID → points to the next token in the chain)
```

**Normal rotation flow:**

```
1. Client sends refresh token R1
2. Server hashes R1 → looks up in DB
3. R1 found, not revoked, not expired → valid
4. Server revokes R1 (reason: 'rotated')
5. Server creates R2, sets R1.replaced_by_token_id = R2.id
6. Server returns new access token + R2
```

**Reuse detection flow:**

```
1. Attacker sends stolen token R1 (already rotated to R2)
2. Server hashes R1 → looks up in DB
3. R1 found, revoked = true → REUSE DETECTED
4. Server follows the rotation chain: R1 → R2 → R3 (current)
5. Server revokes ALL tokens for the user (R2, R3, any others)
6. Server publishes suspicious.activity.detected event
7. Server returns 401 Unauthorized
```

### Attack Scenario: Token Theft

**Without rotation:** An attacker who steals a refresh token can use it indefinitely (until it expires in 7 days). The legitimate user has no way to detect the theft.

**With rotation + reuse detection:** If the attacker steals token R1 and the legitimate user uses R1 first (rotating to R2), the attacker's later attempt to use R1 triggers reuse detection. All tokens are revoked, and the user must re-login. The attacker is locked out.

**Edge case:** If the attacker uses R1 first, the legitimate user's attempt to use R1 triggers reuse detection, revoking the attacker's new token.

---

## JTI-Based Token Blacklisting

### Pattern

Each JWT access token contains a unique identifier (`jti` — JWT ID). When a token must be revoked before its natural expiry, the `jti` is stored in Redis with a TTL matching the token's remaining lifetime.

### Implementation

```
Redis key:   auth:blacklist:{jti}
Redis value: "1"
Redis TTL:   token.exp - now()  (seconds remaining)
```

**Validation check (every request):**

```
1. Verify JWT signature and expiry
2. Extract jti from payload
3. Redis GET auth:blacklist:{jti}
4. If key exists → token is revoked → reject
5. If key absent → token is valid → accept
```

**Blacklist a token (on logout/revoke):**

```
1. Decode the access token
2. Calculate remaining TTL: token.exp - now()
3. Redis SETEX auth:blacklist:{jti} {ttl} "1"
```

### Why TTL Alignment?

Without TTL alignment, the blacklist would grow indefinitely. By setting the TTL to the token's remaining lifetime, the blacklist entry auto-deletes when the token would have expired anyway. This keeps Redis memory bounded.

### Attack Scenario: Stolen Access Token After Logout

**Without blacklisting:** User logs out, but the stolen access token remains valid for up to 15 minutes. The attacker can make requests as the user.

**With JTI blacklisting:** When the user logs out, the token's JTI is blacklisted in Redis. Any subsequent use of that token (by the attacker) is immediately rejected.

---

## Compensating Transactions (Credential Deletion)

### Pattern

When a user is deleted in another microservice, the auth service must also delete the user's credentials. If the deletion partially fails, a compensating transaction ensures consistency.

### Implementation

```
DELETE /v1/accounts/:userId/credentials

Flow:
1. Begin database transaction
2. Revoke all refresh tokens for the user (cascade)
3. Blacklist all active JWTs (iterate JTIs → Redis SETEX)
4. Delete password reset tokens
5. Mark user credentials as DELETED (soft delete) or hard delete
6. Commit transaction
7. Publish credentials.deleted event

If step 5 fails:
  - Transaction rolls back (steps 2-4 are reverted in DB)
  - Event is NOT published
  - Caller receives 500, can retry safely (idempotent)

If event publishing fails (step 7):
  - Credentials are deleted (committed)
  - Event is buffered in memory for retry
  - Eventually consistent with other services
```

### Why Compensating Transactions?

In a distributed system, there's no distributed transaction coordinator. Each service manages its own data. If the auth service deletes credentials but the event is not received by other services, the user's data in those services becomes orphaned. The compensating transaction pattern ensures that either the deletion is fully complete (including event) or can be retried safely.

### Idempotency

The `DELETE /v1/accounts/:userId/credentials` endpoint is **idempotent**: calling it multiple times with the same `userId` produces the same result. If credentials are already deleted, the endpoint returns success without error.

---

## Fail-Open Redis Fallback

### Pattern

When Redis is unavailable, the token blacklist check **skips** (returns "not blacklisted") rather than failing the entire request. This prioritizes availability over strict consistency.

### Implementation

```typescript
// Simplified BlacklistService logic
async isBlacklisted(jti: string): Promise<boolean> {
  try {
    const result = await this.redis.get(`auth:blacklist:${jti}`);
    return result !== null;
  } catch (error) {
    // Redis is down — fail open
    this.logger.warn('Redis unavailable, skipping blacklist check', { jti });
    return false; // token is NOT blacklisted (fail-open)
  }
}
```

### Tradeoff Documentation

| Aspect              | Fail-Open (current)                           | Fail-Closed (alternative)                  |
| ------------------- | ---------------------------------------------- | ------------------------------------------ |
| **Availability**    | ✅ Service stays functional                    | ❌ Service rejects all token validations   |
| **Security**        | ⚠️ Revoked tokens accepted (up to 15 min)     | ✅ No revoked tokens accepted              |
| **Impact**          | Limited exposure window (token expiry)         | Complete service outage                    |
| **Detection**       | Health check reports Redis down                | Same                                       |
| **Recovery**        | Automatic when Redis recovers                  | Same                                       |

### Attack Scenario: Redis DDoS + Stolen Token

**Attack:** Attacker steals a token, then DDoS attacks Redis to make it unavailable. With fail-open, the stolen token (even if blacklisted) is accepted.

**Mitigation:** Access tokens expire in 15 minutes. Even in the worst case, the exposure window is bounded. The health check alerts operators to the Redis outage. The attacker would need sustained access to the token AND the ability to keep Redis down.

---

## Brute Force Lockout with Auto-Recovery

### Pattern

Track failed login attempts per user account. After exceeding a threshold, lock the account for a configurable duration. Automatically unlock when the lockout expires.

### Implementation

```
Database fields on user_credentials:
  - failed_login_attempts (INTEGER, default 0)
  - locked_until (TIMESTAMP, nullable)
  - status (ENUM: ACTIVE, LOCKED, BANNED, DELETED)

Login flow:
1. Find user by email
2. If status = LOCKED:
   a. If locked_until IS NOT NULL AND locked_until < NOW():
      → Auto-unlock (set status = ACTIVE, reset counter)
   b. Else:
      → Return 423 Locked
3. Verify password
4. If password wrong:
   a. Increment failed_login_attempts
   b. If failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
      → Set status = LOCKED
      → Set locked_until = NOW() + LOCKOUT_DURATION
      → Publish account.locked event
   c. Return 401 Unauthorized
5. If password correct:
   → Reset failed_login_attempts = 0
   → Issue tokens
   → Return 200

Scheduled job (every 5 minutes):
  Find all accounts where status = LOCKED AND locked_until < NOW()
  For each: set status = ACTIVE, reset counter, publish event
```

### Attack Scenario: Credential Stuffing

**Attack:** Attacker has a list of email/password combinations from a data breach. They attempt to log in with each one.

**Defense layers:**
1. **Rate limiting** (IP): 10 login attempts per minute per IP — slows automated attacks
2. **Account lockout** (per account): After 5 failures, 15-minute lockout — prevents password guessing
3. **Auto-recovery**: Account unlocks after timeout — legitimate user is not permanently locked out
4. **Audit logging**: Every failed attempt is logged with IP and User-Agent for forensic analysis
5. **Event publishing**: `login.failed` and `account.locked` events trigger alerts in monitoring systems

---

## Device Fingerprinting for Session Management

### Pattern

Each login session is associated with a device fingerprint derived from the client's User-Agent and IP address. This enables per-device session listing and revocation.

### Implementation

```
Fingerprint calculation:
  fingerprint = SHA-256(User-Agent + ":" + IP Address)

Stored on:
  refresh_tokens.device_fingerprint
  refresh_tokens.ip_address
  refresh_tokens.user_agent

Session listing:
  GET /v1/tokens/sessions/:userId
  Returns: [
    {
      sessionId: "uuid",
      deviceFingerprint: "sha256-hash",
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0...",
      createdAt: "2024-01-15T10:00:00Z",
      lastUsedAt: "2024-01-15T14:30:00Z"
    }
  ]

Session revocation:
  DELETE /v1/tokens/sessions/:sessionId
  → Revokes the refresh token
  → Blacklists associated access token JTI
```

### Concurrent Session Enforcement

```
MAX_CONCURRENT_SESSIONS = 5

On new login:
1. Count active (non-revoked, non-expired) sessions for user
2. If count >= MAX_CONCURRENT_SESSIONS:
   → Find the oldest session (by created_at)
   → Revoke it (reason: 'max_sessions_exceeded')
3. Create new session
```

### Attack Scenario: Session Hijacking

**Without fingerprinting:** Attacker steals a refresh token via XSS or network interception. They can use it from any device. The legitimate user cannot see or revoke the attacker's session.

**With fingerprinting:** The session listing shows device information. The legitimate user sees an unfamiliar device/IP and can revoke that specific session. While the fingerprint isn't a security control (it's User-Agent + IP which can be spoofed), it provides visibility.

---

## Standardized Event Envelope for RabbitMQ

### Pattern

Every domain event published to RabbitMQ follows a standardized envelope format. This ensures consumers can reliably parse, trace, and deduplicate events.

### Implementation

```json
{
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "correlationId": "trace-id-from-request",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "source": "auth-service",
  "eventType": "user.logged.in",
  "version": "1.0",
  "payload": {
    "userId": "user-uuid",
    "email": "user@example.com",
    "ipAddress": "192.168.1.1",
    "deviceFingerprint": "sha256-hash"
  }
}
```

| Field           | Type    | Purpose                                        |
| --------------- | ------- | ---------------------------------------------- |
| `messageId`     | UUID v4 | Unique event ID for consumer deduplication      |
| `correlationId` | String  | Trace ID for cross-service correlation          |
| `timestamp`     | ISO 8601| When the event occurred                         |
| `source`        | String  | Originating service name                        |
| `eventType`     | String  | Routing key / event classification              |
| `version`       | String  | Schema version for backward compatibility       |
| `payload`       | Object  | Event-specific data                             |

### Consumer Responsibilities

1. **Deduplication:** Track processed `messageId` values (last 10,000 recommended)
2. **Ordering:** Events are published in order per routing key, but RabbitMQ does not guarantee cross-queue ordering
3. **Dead Letter Queue:** Configure `x-dead-letter-exchange` on consumer queues for failed message handling
4. **Idempotency:** Handle duplicate delivery gracefully (at-least-once delivery)

### Resilience

```
Publisher (Auth Service) ──► RabbitMQ Exchange ──► Consumer Queues

If RabbitMQ is DOWN:
  1. Event is buffered in memory (EventService internal buffer)
  2. Buffer cap: 1000 messages (FIFO)
  3. Auto-reconnect with exponential backoff (1s, 2s, 4s, ... 30s max)
  4. On reconnect: flush buffer in order
  5. If service restarts while disconnected: buffered events are LOST

Mitigation:
  - Health check reports RabbitMQ as unhealthy → alerts
  - Audit logs capture all events (database) → recovery source
  - Critical events (account deletion) use database transaction
    to ensure local state is always consistent
```

### Attack Scenario: Event Replay

**Attack:** An attacker with access to RabbitMQ replays old events (e.g., `account.unlocked`) to bypass security controls.

**Defense:** Event consumers should validate the event's `timestamp` and check the current state in the database before acting. Events are informational — the auth service's database is the source of truth. Replaying an `account.unlocked` event does not actually unlock the account in the auth service's database.

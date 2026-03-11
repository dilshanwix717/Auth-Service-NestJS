# Security

Comprehensive security documentation for the Auth Service.

---

## Token Design

### Access Tokens (JWT, RS256)

| Property        | Value                              |
| --------------- | ---------------------------------- |
| **Format**      | JSON Web Token (RFC 7519)          |
| **Algorithm**   | RS256 (RSA + SHA-256)              |
| **Key Type**    | 2048-bit RSA asymmetric key pair   |
| **Lifetime**    | 15 minutes                         |
| **Revocation**  | JTI-based blacklist in Redis       |

**Why RS256 (asymmetric)?**

- The private key is only needed by the auth service (for signing).
- Other microservices verify tokens with the public key — they never need the private key.
- If a public key leaks, attackers still cannot forge tokens.
- Contrast with HS256: every verifying service would need the same shared secret.

**JWT Claims:**

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "roles": ["USER"],
  "jti": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "iat": 1705312200,
  "exp": 1705313100,
  "iss": "auth-service",
  "aud": "omi-services",
  "tokenType": "ACCESS"
}
```

### Refresh Tokens (Opaque)

| Property        | Value                                      |
| --------------- | ------------------------------------------ |
| **Format**      | UUID v4 (opaque string)                    |
| **Entropy**     | 122 bits (UUID v4)                         |
| **Storage**     | SHA-256 hash only (raw value never stored) |
| **Lifetime**    | 7 days                                     |
| **Rotation**    | Single-use: each use invalidates old token |

**Why opaque (not JWT)?**

- Clients cannot decode or inspect the token — reduces information leakage.
- Server-side lookup required — enables immediate revocation.
- SHA-256 hashing at rest — even if the database is compromised, tokens cannot be used.

---

## Password Hashing

### Primary: Argon2id

| Parameter       | Value    | Rationale                                    |
| --------------- | -------- | -------------------------------------------- |
| **Variant**     | argon2id | Hybrid: resists both side-channel and GPU    |
| **Memory**      | 64 MB    | Makes GPU/ASIC attacks prohibitively costly  |
| **Iterations**  | 3        | Balances security vs. login latency (~300ms) |
| **Parallelism** | 4        | Utilizes multi-core CPUs                     |
| **Salt**        | 16 bytes | Auto-generated, unique per hash              |

**Why Argon2id?**

- Winner of the [Password Hashing Competition](https://password-hashing.net/) (2015)
- Memory-hard: GPU/ASIC attacks require proportional memory (64 MB per attempt)
- Argon2id variant combines Argon2i (side-channel resistance) and Argon2d (GPU resistance)
- Recommended by OWASP for new applications

### Fallback: bcrypt

| Parameter       | Value    | Rationale                                 |
| --------------- | -------- | ----------------------------------------- |
| **Cost Factor** | 12       | ~250ms per hash (2^12 = 4096 iterations)  |
| **Salt**        | 16 bytes | Built-in salt generation                  |

**When is bcrypt used?**

- If `argon2` native bindings fail to compile (e.g., missing build tools)
- For verifying legacy hashes during migration from bcrypt → argon2

**Hash Detection:**

The system auto-detects the algorithm by hash prefix:
- `$argon2id$` → Use argon2 verification
- `$2b$` → Use bcrypt verification

New passwords are always hashed with argon2id, enabling transparent migration.

---

## Token Blacklisting

### Redis-Based JTI Blacklist

When a JWT access token is revoked (logout, admin action, or token refresh), its unique identifier (`jti`) is stored in Redis:

```
Key:    auth:blacklist:{jti}
Value:  "1"
TTL:    Remaining lifetime of the token (aligned to exp claim)
```

**How validation works:**

1. Verify JWT signature and expiry (`jwt.verify`)
2. Extract `jti` from the token payload
3. Check Redis: `GET auth:blacklist:{jti}`
4. If key exists → token is revoked → reject
5. If key does not exist → token is valid → accept

**TTL Alignment:**

The Redis TTL is set to `token.exp - now()`. When the token would have expired naturally, the blacklist entry auto-deletes. This prevents unbounded growth of the blacklist.

**Performance:**

- Single Redis `GET` per validation (~0.1ms local, ~1ms network)
- No database query needed for token validation (stateless JWT + Redis check)

---

## Refresh Token Rotation

### How It Works

Each time a refresh token is used to obtain a new access token, the old refresh token is invalidated and a new one is issued. This creates a **rotation chain**:

```
Token A (issued at login)
  │ used at T+5min
  │ → revoked, reason: "rotated"
  │ → replaced_by_token_id = Token B
  │
  └─► Token B (issued at T+5min)
        │ used at T+20min
        │ → revoked, reason: "rotated"
        │ → replaced_by_token_id = Token C
        │
        └─► Token C (active, expires at T+7d)
```

### Reuse Detection

If a **previously revoked** refresh token is presented:

1. The token is found in the database with `revoked = true`
2. This indicates the token was stolen and replayed (or a client bug)
3. **All refresh tokens for that user are immediately revoked**
4. A `suspicious.activity.detected` event is published to RabbitMQ
5. The request returns `401 Unauthorized`

```
Attacker steals Token A (already rotated to Token B)
  │
  │ Attacker tries to use Token A
  │ ─────────────────────────────►  Auth Service
  │                                    │
  │                                    ├─► Token A found, but revoked = true
  │                                    ├─► REUSE DETECTED
  │                                    ├─► Revoke Token B (and all user tokens)
  │                                    ├─► Publish suspicious.activity.detected
  │                                    └─► Return 401
  │
  │ Legitimate user tries Token B
  │ ─────────────────────────────►  Auth Service
  │                                    │
  │                                    └─► Token B revoked → user must re-login
```

### Why This Matters

- **Single-use tokens** limit the window of exposure if a token is stolen
- **Reuse detection** alerts the system to potential token theft
- **Family revocation** ensures that even if the attacker has the latest token, it's invalidated

---

## Brute Force Protection

### Failed Attempt Tracking

| Parameter                | Default | Configurable Via                       |
| ------------------------ | ------- | -------------------------------------- |
| Max attempts before lock | 5       | `MAX_LOGIN_ATTEMPTS`                   |
| Lockout duration         | 15 min  | `ACCOUNT_LOCKOUT_DURATION_MINUTES`     |

### Flow

```
Login attempt #1: Wrong password → failedLoginAttempts = 1
Login attempt #2: Wrong password → failedLoginAttempts = 2
Login attempt #3: Wrong password → failedLoginAttempts = 3
Login attempt #4: Wrong password → failedLoginAttempts = 4
Login attempt #5: Wrong password → failedLoginAttempts = 5
  │
  └─► ACCOUNT LOCKED
      status = 'LOCKED'
      lockedUntil = NOW() + 15 minutes
      Publish account.locked event
      Return 423 Locked

Login attempt #6 (within 15 min):
  └─► Return 423 Locked (no password check performed)

After 15 minutes (auto-unlock job):
  └─► status = 'ACTIVE'
      failedLoginAttempts = 0
      Publish account.unlocked event

Successful login:
  └─► failedLoginAttempts = 0 (reset counter)
```

### Automatic Unlock

A scheduled job runs every 5 minutes to unlock accounts whose `lockedUntil` has passed:

```sql
-- Pseudo-query executed by UnlockExpiredLockoutsJob
UPDATE user_credentials
SET status = 'ACTIVE', failed_login_attempts = 0
WHERE status = 'LOCKED' AND locked_until IS NOT NULL AND locked_until < NOW();
```

Accounts with `locked_until = NULL` are permanently locked (admin intervention required).

### Rate Limiting (IP-Based)

In addition to account-level lockout, per-IP rate limiting is enforced via `@nestjs/throttler`:

| Endpoint             | Limit            | Window   |
| -------------------- | ---------------- | -------- |
| `/v1/auth/login`     | 10 requests      | 60 sec   |
| `/v1/auth/register`  | 5 requests       | 60 sec   |
| `/v1/auth/forgot-password` | 3 requests | 300 sec  |
| All other endpoints  | 60 requests      | 60 sec   |

---

## Fail-Open Redis Policy

### The Tradeoff

If Redis is unavailable, the blacklist service **cannot check** if a token's JTI has been revoked. The service uses a **fail-open** policy:

| Redis Status | Behavior                              | Risk                            |
| ------------ | ------------------------------------- | ------------------------------- |
| **UP**       | Normal blacklist check                | None                            |
| **DOWN**     | Skip blacklist check → allow request  | Revoked tokens accepted briefly |

### Why Fail-Open?

- **Availability over consistency:** In a streaming platform, blocking all token validations when Redis is down would cause a complete service outage.
- **Mitigating factor:** Access tokens expire in 15 minutes. Even if a revoked token is accepted during a Redis outage, the exposure window is limited.
- **Detection:** Health checks will report Redis as unhealthy, triggering alerts.

### Alternative: Fail-Closed

If your threat model requires fail-closed (reject all tokens when Redis is down), this can be changed in `BlacklistService` by throwing an error instead of returning `false` on Redis connection failure. The tradeoff is total service unavailability during Redis outages.

---

## Session Management

### Concurrent Session Limits

| Parameter                | Default | Configurable Via            |
| ------------------------ | ------- | --------------------------- |
| Max concurrent sessions  | 5       | `MAX_CONCURRENT_SESSIONS`   |

When a user exceeds the limit, the **oldest session** is automatically revoked.

### Device Fingerprinting

Each session is associated with a device fingerprint:

```
fingerprint = SHA-256(User-Agent + IP Address)
```

This enables:
- Listing active sessions with device information
- Revoking a specific device's session ("log out from my phone")
- Detecting suspicious login patterns (new device alert)

### Session Revocation

| Action                    | Effect                                           |
| ------------------------- | ------------------------------------------------ |
| Logout                    | Revoke the specific refresh token + blacklist JWT |
| Revoke session            | Revoke a specific session by session ID           |
| Revoke all tokens         | Revoke all refresh tokens + blacklist all JWTs    |
| Account ban               | Revoke all sessions + blacklist all JWTs          |
| Token reuse detected      | Revoke all sessions (suspicious activity)         |

---

## Internal API Key

### Service-to-Service Authentication

All requests to the auth service must include the `X-Internal-API-Key` header (or `Authorization: Bearer <key>`). This authenticates that the request comes from a trusted internal service (typically an API Gateway).

```
X-Internal-API-Key: <INTERNAL_API_KEY from env>
```

**Exceptions:** Health endpoints (`/health/live`, `/health/ready`) bypass API key validation.

**Guard:** `InternalApiKeyGuard` is registered globally and compares the header value against the `INTERNAL_API_KEY` environment variable using a constant-time comparison.

---

## No User Enumeration

The service prevents attackers from discovering which email addresses have accounts:

| Endpoint              | Behavior                                                     |
| --------------------- | ------------------------------------------------------------ |
| `POST /forgot-password` | Always returns `200 OK` with "If the email exists, a reset link has been sent" |
| `POST /login`          | Returns generic "Invalid credentials" for both wrong email and wrong password |
| `POST /register`       | Returns `409 Conflict` on duplicate email (necessary for UX, mitigated by rate limiting) |

---

## Security Headers

Helmet middleware sets the following HTTP security headers:

| Header                    | Value                           | Purpose                          |
| ------------------------- | ------------------------------- | -------------------------------- |
| `X-Content-Type-Options`  | `nosniff`                       | Prevent MIME-type sniffing       |
| `X-Frame-Options`         | `DENY`                          | Prevent clickjacking             |
| `X-XSS-Protection`        | `0`                             | Disable legacy XSS filter        |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` | Enforce HTTPS            |
| `Content-Security-Policy` | `default-src 'self'`            | Restrict resource loading        |
| `Referrer-Policy`         | `no-referrer`                   | Prevent referrer leakage         |

---

## Audit Logging

Every security-relevant action is logged to the `audit_logs` table (append-only):

| Event Type              | Outcome         | Metadata                                |
| ----------------------- | --------------- | --------------------------------------- |
| `USER_REGISTERED`       | SUCCESS/FAILURE | email, roles                            |
| `LOGIN`                 | SUCCESS/FAILURE | email, ip, user-agent, failure reason   |
| `LOGOUT`                | SUCCESS         | userId                                  |
| `TOKEN_REVOKED`         | SUCCESS         | jti, reason                             |
| `ACCOUNT_LOCKED`        | SUCCESS         | userId, reason, duration                |
| `ACCOUNT_UNLOCKED`      | SUCCESS         | userId                                  |
| `ACCOUNT_BANNED`        | SUCCESS         | userId, reason                          |
| `PASSWORD_RESET`        | SUCCESS/FAILURE | userId                                  |
| `ROLE_ASSIGNED`         | SUCCESS         | userId, role                            |
| `ROLE_REVOKED`          | SUCCESS         | userId, role                            |
| `SUSPICIOUS_ACTIVITY`   | —               | userId, reason (token reuse)            |

Audit logs include a `trace_id` for correlation with distributed traces across services.

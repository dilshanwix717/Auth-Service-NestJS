# API Flow

Step-by-step request flows for every major operation in the Auth Service.

---

## Registration

**Endpoint:** `POST /v1/auth/register`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client sends POST /v1/auth/register              Client
      Body: { email, password, confirmPassword }
      Header: X-Internal-API-Key

 2    ApiKeyMiddleware extracts API key from header     Middleware

 3    InternalApiKeyGuard validates API key             Guard
      → 401 if invalid/missing

 4    ThrottlerGuard checks rate limit (5 req/60s)     Guard
      → 429 if exceeded

 5    ValidationPipe validates RegisterDto              Pipe
      → 400 if email invalid, password too weak,
        or password ≠ confirmPassword

 6    AuthController.register() delegates               Controller
      to AuthService

 7    CredentialService.findByEmail(email)              Service
      → 409 Conflict if email already exists

 8    CredentialService.hashPassword(password)          Service
      → argon2id hash (64MB memory, 3 iterations)
      → Falls back to bcrypt if argon2 fails

 9    UserCredentialRepository.save({                   Repository
        email, passwordHash,
        status: 'ACTIVE', roles: ['USER']
      })

10    EventService.publish('user.account.created', {   Service → RabbitMQ
        userId, email, roles, timestamp
      })
      AuditLogRepository.save({ eventType:             Repository
        'USER_REGISTERED', outcome: 'SUCCESS' })

      → Return 201 Created
        { userId, email, roles }
```

---

## Login

**Endpoint:** `POST /v1/auth/login`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client sends POST /v1/auth/login                 Client
      Body: { email, password }
      Headers: X-Internal-API-Key, User-Agent

 2    ApiKeyMiddleware + InternalApiKeyGuard            Middleware/Guard

 3    ThrottlerGuard checks rate limit (10 req/60s)    Guard
      → 429 if exceeded

 4    ValidationPipe validates LoginDto                 Pipe
      → 400 if email or password missing

 5    AuthController.login() delegates                  Controller
      to AuthService

 6    CredentialService.findByEmail(email)              Service
      → 401 "Invalid credentials" if not found
        (no user enumeration)

 7    Check account status                             Service
      → 423 Locked if status = LOCKED
        and lockedUntil > NOW()
      → 403 Forbidden if status = BANNED
      → 401 if status = DELETED

 8    Check brute-force lockout                        Service
      If lockedUntil IS NOT NULL
        and lockedUntil < NOW():
        → Auto-unlock (status = ACTIVE,
          failedLoginAttempts = 0)

 9    CredentialService.verifyPassword(                 Service
        password, passwordHash)
      → Detect algorithm from hash prefix
      → argon2.verify() or bcrypt.compare()

10    If password WRONG:                               Service
      → Increment failedLoginAttempts
      → If failedLoginAttempts >= 5:
        Lock account (status = LOCKED,
        lockedUntil = NOW() + 15min)
        Publish account.locked event
      → Audit log: LOGIN / FAILURE
      → 401 "Invalid credentials"

11    If password CORRECT:                             Service
      → Reset failedLoginAttempts = 0
      → TokenService.generateTokenPair():
        a. Sign JWT access token (RS256, 15min,
           claims: sub, email, roles, jti)
        b. Generate refresh token (UUID v4)
        c. SHA-256 hash the refresh token
        d. Store in refresh_tokens table
           (with device fingerprint, IP, UA)
      → SessionService.createSession():
        Check concurrent sessions ≤ 5
        Revoke oldest if exceeded

12    EventService.publish('user.logged.in')           Service → RabbitMQ
      AuditLogRepository.save(LOGIN / SUCCESS)         Repository
      Update lastLoginAt, lastLoginIp                  Repository

      → Return 200 OK
        { accessToken, refreshToken, expiresIn }
```

---

## Token Validation

**Endpoint:** `POST /v1/auth/validate-token`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client (other microservice) sends POST           Client
      /v1/auth/validate-token
      Body: { token }
      Header: X-Internal-API-Key

 2    Guard validation (API key, rate limit)            Guard

 3    AuthController.validateToken() delegates          Controller
      to TokenService

 4    TokenService.verifyAccessToken(token):            Service
      → jwt.verify(token, publicKey, {
          algorithms: ['RS256'],
          issuer: 'auth-service',
          audience: 'omi-services'
        })
      → 200 { valid: false } if signature/
        expiry/issuer/audience invalid

 5    BlacklistService.isBlacklisted(jti):              Service → Redis
      → Redis GET auth:blacklist:{jti}
      → If found: 200 { valid: false,
          reason: 'revoked' }
      → If Redis down: fail-open (skip check)

 6    CredentialService.findById(sub):                  Service → DB
      → Check account status
      → If BANNED/DELETED: { valid: false }
      → If ACTIVE/LOCKED: { valid: true }

      → Return 200 OK
        { valid, userId, email, roles, exp }
```

---

## Token Refresh with Rotation

**Endpoint:** `POST /v1/auth/refresh-token`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client sends POST /v1/auth/refresh-token         Client
      Body: { refreshToken }
      Header: X-Internal-API-Key

 2    Guard validation (API key, rate limit)            Guard

 3    AuthController.refreshToken() delegates           Controller
      to TokenService

 4    Hash the incoming refresh token:                  Service
      tokenHash = SHA-256(refreshToken)

 5    Look up by hash in database:                      Repository
      RefreshTokenRepository.findByHash(tokenHash)
      → 401 if not found

 6    Check if token was already revoked:               Service
      If revoked = true:
        → REUSE DETECTED!
        → Revoke ALL user refresh tokens
        → Blacklist ALL active JWTs for user
        → Publish suspicious.activity.detected
        → Audit log: SUSPICIOUS_ACTIVITY
        → 401 Unauthorized

 7    Check if token is expired:                        Service
      If expiresAt < NOW():
        → 401 "Refresh token expired"

 8    Rotate tokens:                                   Service
      a. Revoke old token (reason: 'rotated')
      b. Generate new access token (JWT, RS256)
      c. Generate new refresh token (UUID v4)
      d. Store new token with:
         - SHA-256 hash
         - device fingerprint (from old token)
         - ip, user-agent
      e. Set old.replacedByTokenId = new.id
      f. Update old.lastUsedAt

      → Return 200 OK
        { accessToken, refreshToken, expiresIn }
```

---

## Logout

**Endpoint:** `POST /v1/auth/logout`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client sends POST /v1/auth/logout                Client
      Body: { accessToken, refreshToken }
      Header: X-Internal-API-Key

 2    Guard validation (API key)                        Guard

 3    AuthController.logout() delegates                 Controller
      to AuthService

 4    TokenService.revokeRefreshToken():                Service → DB
      → Hash the refresh token
      → Find in database
      → Set revoked = true, revokedAt = NOW(),
        revocationReason = 'logout'

 5    TokenService.blacklistAccessToken():              Service → Redis
      → Decode the access token (extract jti, exp)
      → Calculate remaining TTL: exp - now()
      → Redis SETEX auth:blacklist:{jti} {ttl} "1"

      EventService.publish('user.logged.out')          Service → RabbitMQ
      AuditLogRepository.save(LOGOUT / SUCCESS)        Repository

      → Return 200 OK
```

---

## Password Reset

### Request Reset

**Endpoint:** `POST /v1/auth/forgot-password`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client sends POST /v1/auth/forgot-password       Client
      Body: { email }

 2    Guard validation + rate limit (3 req/300s)       Guard

 3    CredentialService.findByEmail(email)              Service
      → If NOT found: still return 200 (no enumeration)

 4    Generate reset token: UUID v4                    Service

 5    Hash and store:                                  Repository
      PasswordResetTokenRepository.save({
        userId, tokenHash: SHA-256(token),
        expiresAt: NOW() + 60min, used: false
      })

 6    EventService.publish(                            Service → RabbitMQ
      'password.reset.requested', {
        userId, email, timestamp
      })
      (Email service consumes this event and
       sends the reset email with the raw token)

      → Return 200 OK
        "If the email exists, a reset link
         has been sent" (always same response)
```

### Perform Reset

**Endpoint:** `POST /v1/auth/reset-password`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client sends POST /v1/auth/reset-password        Client
      Body: { token, newPassword, confirmPassword }

 2    Guard validation                                  Guard

 3    ValidationPipe validates ResetPasswordDto         Pipe
      → 400 if password too weak or mismatch

 4    Hash the reset token: SHA-256(token)             Service

 5    Look up by hash:                                  Repository
      PasswordResetTokenRepository.findByHash()
      → 400 "Invalid or expired token"
        if not found

 6    Validate token:                                  Service
      → 400 if expiresAt < NOW() (expired)
      → 400 if used = true (already consumed)

 7    Hash new password (argon2id)                     Service
      Update user's passwordHash in DB                 Repository
      Mark token as used (used = true,                 Repository
        usedAt = NOW())

 8    Revoke all refresh tokens for user               Service → DB
      Blacklist all active JWTs for user               Service → Redis
      Publish password.reset.completed event           Service → RabbitMQ

      → Return 200 OK
```

---

## Account Lock / Ban

### Lock Account

**Endpoint:** `POST /v1/accounts/lock`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client (admin service) sends POST                Client
      /v1/accounts/lock
      Body: { userId, reason, durationMinutes? }
      Headers: X-Internal-API-Key, X-User-Id

 2    Guard validation (API key)                        Guard

 3    AccountController.lockAccount() delegates         Controller
      to AccountService

 4    CredentialService.findById(userId)                Service
      → 404 if user not found
      → 400 if already LOCKED or BANNED

 5    Update user:                                      Repository
      status = 'LOCKED'
      lockedUntil = durationMinutes ?
        NOW() + durationMinutes : null
      (null = permanent, requires admin unlock)

      Revoke all refresh tokens                         Service → DB
      Blacklist all active JWTs                         Service → Redis
      Publish account.locked event                      Service → RabbitMQ
      Audit log: ACCOUNT_LOCKED / SUCCESS               Repository

      → Return 200 OK
```

### Ban Account

**Endpoint:** `POST /v1/accounts/ban`

```
Step  Action                                          Component
───── ─────────────────────────────────────────────── ─────────────────────────
 1    Client (admin service) sends POST                Client
      /v1/accounts/ban
      Body: { userId, reason }
      Headers: X-Internal-API-Key, X-User-Id

 2    Guard validation (API key)                        Guard

 3    AccountController.banUser() delegates             Controller
      to AccountService

 4    CredentialService.findById(userId)                Service
      → 404 if user not found

 5    Update user:                                      Repository
      status = 'BANNED'

      Revoke all refresh tokens                         Service → DB
      Blacklist all active JWTs                         Service → Redis
      Publish account.banned event                      Service → RabbitMQ
      Audit log: ACCOUNT_BANNED / SUCCESS               Repository

      → Return 200 OK
```

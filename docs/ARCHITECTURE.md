# Architecture

## Layered Architecture

The Auth Service follows a strict **Layered Architecture** where each layer has a single responsibility and only depends on the layer directly below it.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HTTP / HTTPS Request                         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MIDDLEWARE LAYER                                                    │
│  ┌─────────────────────┐  ┌────────────────────────────────────┐   │
│  │  LoggingMiddleware   │  │  ApiKeyMiddleware                  │   │
│  │  (request logging)   │  │  (extract X-Internal-API-Key)      │   │
│  └─────────────────────┘  └────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GUARD LAYER                                                        │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐   │
│  │  InternalApiKeyGuard    │  │  ThrottlerGuard                │   │
│  │  (service-to-service)   │  │  (rate limiting per IP)        │   │
│  └─────────────────────────┘  └────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  INTERCEPTOR LAYER                                                  │
│  ┌───────────────────┐ ┌──────────────────┐ ┌────────────────────┐ │
│  │ LoggingInterceptor│ │ResponseInterceptor│ │ TimeoutInterceptor │ │
│  │ (timing/context)  │ │(standard envelope)│ │ (30s timeout)      │ │
│  └───────────────────┘ └──────────────────┘ └────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CONTROLLER LAYER (Thin — no business logic)                        │
│                                                                     │
│  AuthController    AccountController    TokenController              │
│  RoleController    HealthController                                 │
│                                                                     │
│  Responsibilities:                                                  │
│  • Parse and validate HTTP requests (DTOs via ValidationPipe)       │
│  • Delegate to appropriate service                                  │
│  • Return HTTP responses with correct status codes                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER (Core business logic)                                │
│                                                                     │
│  TokenService       CredentialService    AccountService              │
│  SessionService     BlacklistService     EventService               │
│  HealthService      RoleService                                     │
│                                                                     │
│  Responsibilities:                                                  │
│  • Implement authentication and authorization flows                 │
│  • Enforce security policies (brute force, rotation, blacklisting)  │
│  • Coordinate between repositories, clients, and other services     │
│  • Publish domain events                                            │
└───────────────┬───────────────────────────────────┬────────────────┘
                │                                   │
                ▼                                   ▼
┌──────────────────────────────┐  ┌──────────────────────────────────┐
│  REPOSITORY LAYER            │  │  CLIENT LAYER                    │
│                              │  │                                  │
│  UserCredentialRepository    │  │  RedisClient                     │
│  RefreshTokenRepository      │  │  • Token blacklist (JTI → TTL)   │
│  RoleRepository              │  │  • Session caching               │
│  AuditLogRepository          │  │                                  │
│  PasswordResetTokenRepository│  │  RabbitMQClient                  │
│                              │  │  • Domain event publishing       │
│  Responsibilities:           │  │  • In-memory buffer on failure   │
│  • TypeORM queries           │  │                                  │
│  • Data persistence          │  │  Responsibilities:               │
│  • Transaction management    │  │  • External system integration   │
│                              │  │  • Connection management         │
│                              │  │  • Resilience (reconnect, buffer)│
└──────────────┬───────────────┘  └──────────────────┬───────────────┘
               │                                     │
               ▼                                     ▼
┌──────────────────────────────┐  ┌──────────────────────────────────┐
│  ENTITY LAYER                │  │  EXTERNAL SYSTEMS                │
│                              │  │                                  │
│  UserCredential              │  │  PostgreSQL 16                   │
│  RefreshToken                │  │  Redis 7                         │
│  Role                        │  │  RabbitMQ 3.13                   │
│  AuditLog                    │  │                                  │
│  PasswordResetToken          │  │                                  │
└──────────────────────────────┘  └──────────────────────────────────┘
```

---

## Layer Descriptions

### Middleware Layer

Runs before any guard or controller logic. Processes raw HTTP requests.

| Middleware           | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `LoggingMiddleware`  | Logs request method, URL, IP, User-Agent, and response time |
| `ApiKeyMiddleware`   | Extracts `X-Internal-API-Key` header for guard validation   |

### Guard Layer

Binary allow/deny gates that execute before the controller method.

| Guard                  | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `InternalApiKeyGuard`  | Validates internal API key for service-to-service auth |
| `ThrottlerGuard`       | Enforces per-IP rate limits by endpoint                |

### Controller Layer

Thin HTTP handlers — no business logic. Each controller maps to an API resource group.

| Controller            | Routes Prefix       | Responsibility                              |
| --------------------- | ------------------- | ------------------------------------------- |
| `AuthController`      | `/v1/auth`          | Registration, login, logout, password flows |
| `AccountController`   | `/v1/accounts`      | Account lock, unlock, ban, delete           |
| `TokenController`     | `/v1/tokens`        | Token introspection, session management     |
| `RoleController`      | `/v1/roles`         | Role assignment, revocation, queries        |
| `HealthController`    | `/health`           | Liveness and readiness probes               |

### Service Layer

Core business logic. Services are injected into controllers and may depend on other services.

| Service               | Responsibility                                                |
| --------------------- | ------------------------------------------------------------- |
| `TokenService`        | JWT signing/verification, refresh rotation, blacklisting      |
| `CredentialService`   | Password hashing (argon2/bcrypt), credential CRUD             |
| `AccountService`      | Account lifecycle: lock, unlock, ban, delete                  |
| `SessionService`      | Session tracking, device fingerprints, concurrent limits      |
| `BlacklistService`    | Redis-based JTI blacklist with TTL alignment                  |
| `EventService`        | RabbitMQ event publishing with in-memory buffer               |
| `HealthService`       | Parallel health checks for all dependencies                   |
| `RoleService`         | RBAC role management (assign, revoke, query)                  |

### Repository Layer

Data access via TypeORM. Each repository maps to one entity/table.

| Repository                     | Entity              | Table                    |
| ------------------------------ | ------------------- | ------------------------ |
| `UserCredentialRepository`     | `UserCredential`    | `user_credentials`       |
| `RefreshTokenRepository`       | `RefreshToken`      | `refresh_tokens`         |
| `RoleRepository`               | `Role`              | `roles`                  |
| `AuditLogRepository`           | `AuditLog`          | `audit_logs`             |
| `PasswordResetTokenRepository` | `PasswordResetToken`| `password_reset_tokens`  |

### Client Layer

Integrations with external systems, handling connection lifecycle and resilience.

| Client           | System    | Purpose                                        |
| ---------------- | --------- | ---------------------------------------------- |
| `RedisClient`    | Redis 7   | Token blacklist (JTI keys with TTL), sessions  |
| `RabbitMQClient` | RabbitMQ  | Domain event publishing to `auth.events` topic |

---

## Request Flows

### Login Flow

```
Client                    API Gateway            Auth Service
  │                           │                       │
  │  POST /v1/auth/login      │                       │
  │  { email, password }      │                       │
  │ ─────────────────────────►│                       │
  │                           │  + X-Internal-API-Key  │
  │                           │ ──────────────────────►│
  │                           │                       │
  │                           │    ┌──────────────────┤
  │                           │    │ ApiKeyMiddleware  │ Extract API key
  │                           │    │ LoggingMiddleware │ Log request
  │                           │    ├──────────────────┤
  │                           │    │ ApiKeyGuard       │ Validate key
  │                           │    │ ThrottlerGuard    │ Check rate limit
  │                           │    ├──────────────────┤
  │                           │    │ AuthController    │ Parse LoginDto
  │                           │    │     │             │
  │                           │    │     ▼             │
  │                           │    │ AuthService       │
  │                           │    │     │             │
  │                           │    │     ├─► CredentialService.findByEmail()
  │                           │    │     │   Check account status (ACTIVE?)
  │                           │    │     │   Check brute-force lockout
  │                           │    │     │
  │                           │    │     ├─► CredentialService.verifyPassword()
  │                           │    │     │   argon2.verify() or bcrypt.compare()
  │                           │    │     │
  │                           │    │     ├─► TokenService.generateTokenPair()
  │                           │    │     │   Sign JWT (RS256) + create refresh token
  │                           │    │     │
  │                           │    │     ├─► SessionService.createSession()
  │                           │    │     │   Device fingerprint, enforce max sessions
  │                           │    │     │
  │                           │    │     ├─► CredentialService.resetFailedAttempts()
  │                           │    │     │
  │                           │    │     ├─► EventService.publish('user.logged.in')
  │                           │    │     │
  │                           │    │     └─► AuditLogRepository.save()
  │                           │    │         Log LOGIN / SUCCESS
  │                           │    └──────────────────┤
  │                           │                       │
  │                           │  { accessToken,       │
  │                           │    refreshToken,      │
  │                           │    expiresIn }        │
  │                           │ ◄─────────────────────│
  │ ◄────────────────────────-│                       │
```

### Token Validation Flow

```
Other Service             API Gateway            Auth Service
  │                           │                       │
  │  POST /v1/auth/           │                       │
  │  validate-token           │                       │
  │  { token }                │                       │
  │ ─────────────────────────►│                       │
  │                           │ ──────────────────────►│
  │                           │                       │
  │                           │    ┌──────────────────┤
  │                           │    │ AuthController    │
  │                           │    │     │             │
  │                           │    │     ▼             │
  │                           │    │ TokenService      │
  │                           │    │     │             │
  │                           │    │     ├─► jwt.verify(token, publicKey)
  │                           │    │     │   Check signature, expiry, issuer
  │                           │    │     │
  │                           │    │     ├─► BlacklistService.isBlacklisted(jti)
  │                           │    │     │   Redis GET auth:blacklist:{jti}
  │                           │    │     │
  │                           │    │     ├─► CredentialService.findById(sub)
  │                           │    │     │   Check account status ≠ BANNED/DELETED
  │                           │    │     │
  │                           │    │     └─► Return { valid, userId, roles }
  │                           │    └──────────────────┤
  │                           │ ◄─────────────────────│
  │ ◄─────────────────────────│                       │
```

### Token Refresh with Rotation

```
Client                                    Auth Service
  │                                            │
  │  POST /v1/auth/refresh-token               │
  │  { refreshToken: "uuid-v4-token" }         │
  │ ──────────────────────────────────────────►│
  │                                            │
  │                         ┌──────────────────┤
  │                         │ TokenService      │
  │                         │     │             │
  │                         │     ├─► SHA-256(refreshToken)
  │                         │     │   Look up by hash in DB
  │                         │     │
  │                         │     ├─► Check: revoked?
  │                         │     │   YES → REUSE DETECTED!
  │                         │     │   └─► Revoke ALL user tokens
  │                         │     │   └─► Publish suspicious.activity.detected
  │                         │     │   └─► Return 401
  │                         │     │
  │                         │     ├─► Check: expired?
  │                         │     │   YES → Return 401
  │                         │     │
  │                         │     ├─► Revoke old refresh token
  │                         │     │   (reason: 'rotated')
  │                         │     │
  │                         │     ├─► Generate new token pair
  │                         │     │   New access JWT + new refresh UUID
  │                         │     │
  │                         │     ├─► Link: old.replacedByTokenId = new.id
  │                         │     │   (rotation chain for forensics)
  │                         │     │
  │                         │     └─► Return new token pair
  │                         └──────────────────┤
  │                                            │
  │  { accessToken, refreshToken, expiresIn }  │
  │ ◄──────────────────────────────────────────│
```

---

## Module Dependency Graph

```
AppModule
├── ConfigModule (global)
│   └── Joi schema validation for all env vars
│
├── TypeOrmModule (global)
│   └── PostgreSQL connection with pooling
│
├── ThrottlerModule (global)
│   └── Rate limiting configuration
│
├── ScheduleModule (global)
│   └── Cron job scheduling
│
├── TerminusModule
│   └── Health check endpoints
│
├── PrometheusModule
│   └── Metrics endpoint (/metrics)
│
├── Controllers
│   ├── AuthController
│   │   └── depends on: AuthService, TokenService, CredentialService
│   ├── AccountController
│   │   └── depends on: AccountService
│   ├── TokenController
│   │   └── depends on: TokenService, SessionService
│   ├── RoleController
│   │   └── depends on: RoleService
│   └── HealthController
│       └── depends on: HealthService
│
├── Services
│   ├── TokenService
│   │   └── depends on: RefreshTokenRepo, BlacklistService, RedisClient
│   ├── CredentialService
│   │   └── depends on: UserCredentialRepo, hash utilities
│   ├── AccountService
│   │   └── depends on: UserCredentialRepo, TokenService, EventService
│   ├── SessionService
│   │   └── depends on: RefreshTokenRepo, RedisClient
│   ├── BlacklistService
│   │   └── depends on: RedisClient
│   ├── EventService
│   │   └── depends on: RabbitMQClient, AuditLogRepo
│   ├── RoleService
│   │   └── depends on: RoleRepo, UserCredentialRepo, EventService
│   └── HealthService
│       └── depends on: RedisClient, RabbitMQClient, TypeORM Connection
│
├── Clients
│   ├── RedisClient (singleton)
│   └── RabbitMQClient (singleton)
│
├── Jobs (Scheduled)
│   ├── ExpiredRefreshTokenCleanupJob  → Daily 2 AM
│   ├── ExpiredPasswordResetCleanupJob → Daily 3 AM
│   └── UnlockExpiredLockoutsJob       → Every 5 minutes
│
└── Global Providers
    ├── InternalApiKeyGuard (APP_GUARD)
    ├── ValidationPipe (APP_PIPE)
    ├── ResponseInterceptor (APP_INTERCEPTOR)
    ├── LoggingInterceptor (APP_INTERCEPTOR)
    ├── TimeoutInterceptor (APP_INTERCEPTOR)
    ├── HttpExceptionFilter (APP_FILTER)
    └── TypeOrmExceptionFilter (APP_FILTER)
```

---

## Data Model

```
┌──────────────────────┐       ┌──────────────────────┐
│   user_credentials   │       │       roles          │
│ ──────────────────── │       │ ──────────────────── │
│ id          UUID PK  │       │ id          UUID PK  │
│ email       UNIQUE   │       │ name        UNIQUE   │
│ password_hash        │       │ description          │
│ status      ENUM     │       │ permissions TEXT[]   │
│ roles       TEXT[]   │◄──────│ created_at           │
│ failed_login_attempts│       │ updated_at           │
│ locked_until         │       └──────────────────────┘
│ last_login_at        │
│ last_login_ip        │
│ password_changed_at  │
│ created_at           │
│ updated_at           │
└─────────┬────────────┘
          │ 1
          │
          │ N
┌─────────┴────────────┐       ┌──────────────────────┐
│   refresh_tokens     │       │     audit_logs       │
│ ──────────────────── │       │ ──────────────────── │
│ id          UUID PK  │       │ id          UUID PK  │
│ user_id     FK ──────│       │ event_type           │
│ token_hash  UNIQUE   │       │ user_id              │
│ issued_at            │       │ email                │
│ expires_at   INDEX   │       │ ip_address           │
│ revoked              │       │ user_agent           │
│ revoked_at           │       │ outcome    ENUM      │
│ revocation_reason    │       │ metadata   JSONB     │
│ device_fingerprint   │       │ trace_id             │
│ ip_address           │       │ created_at  INDEX    │
│ user_agent           │       └──────────────────────┘
│ last_used_at         │
│ replaced_by_token_id │───► Self-reference (rotation chain)
│ created_at           │
└──────────────────────┘
          │ 1 (user_id FK)
          │
┌─────────┴────────────┐
│ password_reset_tokens│
│ ──────────────────── │
│ id          UUID PK  │
│ user_id     FK ──────│
│ token_hash  UNIQUE   │
│ expires_at   INDEX   │
│ used                 │
│ used_at              │
│ created_at           │
└──────────────────────┘
```

---

## Cross-Cutting Concerns

| Concern                | Implementation                                                    |
| ---------------------- | ----------------------------------------------------------------- |
| **Logging**            | Winston structured JSON + LoggingMiddleware + LoggingInterceptor  |
| **Tracing**            | OpenTelemetry SDK, `X-Request-ID` propagation, trace ID in audit  |
| **Metrics**            | Prometheus via prom-client, exposed at `/metrics`                 |
| **Error Handling**     | Global HttpExceptionFilter + TypeOrmExceptionFilter               |
| **Validation**         | Global ValidationPipe with class-validator DTOs                   |
| **Response Format**    | ResponseInterceptor wraps all responses in standard envelope      |
| **Timeout**            | TimeoutInterceptor enforces `REQUEST_TIMEOUT_MS`                  |
| **Security Headers**   | Helmet middleware (HSTS, X-Frame-Options, etc.)                   |
| **Compression**        | compression middleware for response gzip                          |
| **Graceful Shutdown**  | `enableShutdownHooks()` with configurable timeout                 |

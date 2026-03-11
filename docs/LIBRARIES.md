# Libraries

Every major dependency in the Auth Service — what it does, why it was chosen, how it's configured, and what happens if it fails.

---

## Framework & Core

### NestJS (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`)

- **What it does:** Progressive Node.js framework for building server-side applications. Provides dependency injection, module system, decorators, guards, interceptors, pipes, and filters.
- **Why chosen:** Enterprise-grade structure with TypeScript-first design. Modular architecture scales well for microservices. Rich ecosystem of official modules (@nestjs/jwt, @nestjs/typeorm, etc.) reduces boilerplate.
- **How configured:** `AppModule` is the root module. Global providers (guards, interceptors, filters, pipes) are registered in `app.module.ts`. Express is the underlying HTTP adapter.
- **If it fails:** Application cannot start. Fatal error logged and process exits.

---

## Database & ORM

### TypeORM (`typeorm`, `@nestjs/typeorm`)

- **What it does:** Object-Relational Mapper for TypeScript. Maps entity classes to PostgreSQL tables. Handles queries, migrations, transactions, and connection pooling.
- **Why chosen:** First-class TypeScript decorator support. Integrates natively with NestJS via `@nestjs/typeorm`. Supports migrations for schema versioning. Active Record and Data Mapper patterns.
- **How configured:** Connection settings in `database.config.ts` (loaded from env). Pool size: min 2, max 10. SSL configurable. Entities auto-loaded from `src/entities/`. Migrations in `src/migrations/`.
- **If it fails:** Database queries fail. Controllers return 500 errors. Health readiness check reports PostgreSQL as unhealthy. Service remains running but non-functional for stateful operations.

### pg (`pg`)

- **What it does:** Low-level PostgreSQL client driver for Node.js. Used internally by TypeORM.
- **Why chosen:** Required by TypeORM for PostgreSQL connections. Most mature PostgreSQL driver for Node.js.
- **How configured:** No direct configuration — managed by TypeORM.
- **If it fails:** Same as TypeORM failure — database operations fail.

---

## Cache & Session Store

### ioredis (`ioredis`)

- **What it does:** Redis client for Node.js with support for Cluster, Sentinel, Streams, and Lua scripting.
- **Why chosen:** Better TypeScript support than `redis` package. Built-in reconnection with exponential backoff. Supports pipelines and transactions. Widely used in production.
- **How configured:** Connection via `REDIS_URL` env var. Key prefix: `auth:` (configurable). TLS optional. Singleton client created in `redis.client.ts`.
- **If it fails:** Token blacklist checks fall back to **fail-open** policy (revoked tokens may be accepted for up to 15 minutes). Session caching degrades to database queries. Health readiness check reports Redis as unhealthy. See [SECURITY.md](SECURITY.md#fail-open-redis-policy) for details.

---

## Messaging

### amqplib (`amqplib`)

- **What it does:** AMQP 0-9-1 client library for Node.js. Connects to RabbitMQ for message publishing.
- **Why chosen:** Official RabbitMQ-recommended client for Node.js. Supports all AMQP features: exchanges, queues, routing, confirms, heartbeats.
- **How configured:** Connection via `RABBITMQ_URL`. Topic exchange: `auth.events`. Heartbeat: 60s. Prefetch: 10. Connection management and reconnection logic in `rabbitmq.client.ts`.
- **If it fails:** Events are buffered in memory (up to 1000 messages). Auto-reconnect with exponential backoff (1s → 30s). Buffered events flushed on reconnect (FIFO order). If the service restarts while disconnected, buffered events are lost. Health readiness check reports RabbitMQ as unhealthy.

---

## Authentication & Cryptography

### argon2 (`argon2`)

- **What it does:** Node.js bindings for the Argon2 password hashing algorithm. Provides `hash()` and `verify()` functions.
- **Why chosen:** Winner of the Password Hashing Competition. Memory-hard algorithm that resists GPU/ASIC brute-force attacks. Argon2id variant combines side-channel and GPU resistance. OWASP recommended.
- **How configured:** Memory: 64 MB (`ARGON2_MEMORY_COST=65536`). Time: 3 iterations (`ARGON2_TIME_COST=3`). Parallelism: 4 threads (`ARGON2_PARALLELISM=4`). Type: argon2id. Salt: auto-generated (16 bytes).
- **If it fails:** Falls back to bcrypt for hashing. Verification auto-detects algorithm from hash prefix. If both fail, login returns 500.

### bcrypt (`bcrypt`)

- **What it does:** Node.js bindings for the bcrypt password hashing algorithm. Used as a fallback when argon2 native bindings are unavailable.
- **Why chosen:** Battle-tested, widely deployed. Pure JavaScript fallback available. Good fallback when argon2 native compilation fails.
- **How configured:** Cost factor: 12 (`BCRYPT_ROUNDS=12`). Salt: auto-generated (16 bytes).
- **If it fails:** Password hashing/verification fails. Login and registration return 500.

### jsonwebtoken (`jsonwebtoken`)

- **What it does:** JSON Web Token implementation for Node.js. Signs tokens with private key, verifies with public key.
- **Why chosen:** Most popular JWT library for Node.js. Supports RS256 (asymmetric). Handles expiry, issuer, audience validation. Well-audited.
- **How configured:** Algorithm: RS256. Private/public keys loaded from base64-encoded env vars. Access token expiry: 15m. Issuer: `auth-service`. Audience: `omi-services`. Claims: sub, email, roles, jti.
- **If it fails:** Token generation fails → login/refresh returns 500. Token verification fails → validation returns invalid token.

---

## Validation

### class-validator (`class-validator`)

- **What it does:** Decorator-based validation for TypeScript classes. Validates DTO properties using decorators like `@IsEmail()`, `@MinLength()`, `@IsNotEmpty()`.
- **Why chosen:** Integrates natively with NestJS `ValidationPipe`. Declarative validation via decorators. Extensive built-in validators. Custom validators supported.
- **How configured:** Global `ValidationPipe` registered in `app.module.ts` with `whitelist: true` (strips unknown properties), `forbidNonWhitelisted: true` (rejects unknown properties), and `transform: true` (auto-transform types).
- **If it fails:** Validation errors return 400 with detailed error messages. Invalid requests never reach service layer.

### class-transformer (`class-transformer`)

- **What it does:** Transforms plain objects to class instances and vice versa. Works with class-validator for DTO transformation.
- **Why chosen:** Required companion to class-validator. Handles type transformation (string → number, JSON → class instance). `@Exclude()` and `@Expose()` control serialization.
- **How configured:** Used automatically by NestJS `ValidationPipe` with `transform: true`.
- **If it fails:** DTO transformation fails → validation may produce unexpected results.

### Joi (`joi`)

- **What it does:** Schema-based validation library. Used specifically for **environment variable validation** at application startup.
- **Why chosen:** Rich schema DSL for complex validation rules. `@nestjs/config` has built-in Joi support via `validationSchema`. Validates all env vars before the app starts — fail fast on misconfiguration.
- **How configured:** Schema defined in `env.validation.ts`. Loaded by `ConfigModule.forRoot({ validationSchema })`. Validates types, required fields, defaults, and allowed values.
- **If it fails:** Application fails to start with a clear error message describing which env var is invalid or missing.

---

## Logging

### Winston (`winston`)

- **What it does:** Multi-transport logging library. Supports structured JSON logging, log levels, and multiple output targets.
- **Why chosen:** Industry standard for Node.js logging. Structured JSON format for log aggregation (ELK, Datadog). Multiple transports (console, file, remote). Custom formatting.
- **How configured:** Log level from `LOG_LEVEL` env var (default: `log`). Console transport with JSON format. Timestamp and service name included in every log entry. Wrapped in `logger.util.ts`.
- **If it fails:** Falls back to `console.log`. Application continues running but loses structured logging.

---

## Security & Performance

### helmet (`helmet`)

- **What it does:** Sets security-related HTTP headers. Prevents common web vulnerabilities.
- **Why chosen:** De facto standard for Express/NestJS security headers. Protects against clickjacking, MIME sniffing, XSS, and more. Zero-config defaults are production-ready.
- **How configured:** Applied as global middleware in `main.ts`. Uses default settings (HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, etc.).
- **If it fails:** Security headers are not set. No functional impact — responses still work but are less secure.

### compression (`compression`)

- **What it does:** Response compression middleware. Compresses HTTP responses using gzip/deflate.
- **Why chosen:** Reduces response payload size by 60-80% for JSON. Improves network performance. Standard Express middleware.
- **How configured:** Applied as global middleware in `main.ts`. Default threshold: 1KB. Supports gzip and deflate.
- **If it fails:** Responses are sent uncompressed. No functional impact — slightly larger payloads.

### @nestjs/throttler (`@nestjs/throttler`)

- **What it does:** Rate limiting for NestJS. Limits requests per IP per time window.
- **Why chosen:** Official NestJS module. Integrates with guards. Per-route configuration via decorators. In-memory storage (no external dependency).
- **How configured:** Global guard registered in `app.module.ts`. Default: 60 requests / 60 seconds. Per-route overrides in controllers (login: 10/60s, register: 5/60s, forgot-password: 3/300s).
- **If it fails:** Rate limiting is disabled. All requests are accepted regardless of frequency. Risk of brute-force attacks increases.

---

## Scheduling

### @nestjs/schedule (`@nestjs/schedule`)

- **What it does:** Cron-based task scheduling for NestJS. Runs background jobs at specified intervals.
- **Why chosen:** Official NestJS module. Decorator-based cron expressions (`@Cron()`). Integrates with NestJS lifecycle. No external scheduler needed.
- **How configured:** `ScheduleModule.forRoot()` in `app.module.ts`. Three jobs: expired refresh token cleanup (daily 2 AM), expired password reset cleanup (daily 3 AM), unlock expired lockouts (every 5 min).
- **If it fails:** Scheduled jobs stop running. Expired tokens accumulate in database. Locked accounts are not auto-unlocked. Manual intervention required.

---

## Health Checks

### @nestjs/terminus (`@nestjs/terminus`)

- **What it does:** Health check module for NestJS. Provides liveness and readiness endpoints for container orchestration.
- **Why chosen:** Official NestJS module. Integrates with Kubernetes/Docker health probes. Built-in health indicators for TypeORM, HTTP, and custom checks.
- **How configured:** `TerminusModule` in `app.module.ts`. Liveness: `/health/live` (always UP). Readiness: `/health/ready` (checks PostgreSQL, Redis, RabbitMQ in parallel).
- **If it fails:** Health endpoints return 503. Container orchestrator may restart the pod. No impact on actual service functionality.

---

## Monitoring

### prom-client (`prom-client`) + @willsoto/nestjs-prometheus

- **What it does:** Prometheus metrics client. Exposes application metrics in Prometheus format at `/metrics`.
- **Why chosen:** Prometheus is the standard for cloud-native monitoring. prom-client is the official Node.js client. @willsoto/nestjs-prometheus provides NestJS integration with auto-collection of default metrics.
- **How configured:** `PrometheusModule` in `app.module.ts`. Default metrics (memory, CPU, event loop) auto-collected. Custom metrics can be added via `@InjectMetric()`.
- **If it fails:** Metrics endpoint returns errors. No impact on service functionality. Monitoring dashboards lose data.

---

## Tracing

### OpenTelemetry (`@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`)

- **What it does:** Distributed tracing SDK. Automatically instruments HTTP, database, and Redis operations with trace context propagation.
- **Why chosen:** Vendor-neutral observability standard. Automatic instrumentation requires no code changes. Supports trace context propagation across microservices via `X-Request-ID` headers.
- **How configured:** SDK initialized before NestJS bootstrap. Auto-instrumentations enabled for HTTP, PostgreSQL, Redis. Trace IDs stored in audit logs.
- **If it fails:** Tracing is disabled. No trace context propagation. No impact on service functionality.

---

## Utilities

### uuid (`uuid`)

- **What it does:** Generates RFC 4122 compliant UUIDs. Used for entity IDs, refresh tokens, message IDs, and trace IDs.
- **Why chosen:** Standard UUID generation. `v4()` provides 122 bits of cryptographically random entropy. Widely used and well-tested.
- **How configured:** Imported directly where needed. No global configuration.
- **If it fails:** UUID generation fails → entity creation fails → 500 errors.

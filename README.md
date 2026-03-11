# Auth Service

> Single source of truth for authentication and authorization in the Omi video streaming platform.

A production-ready NestJS microservice that handles user registration, login, JWT token lifecycle, role-based access control (RBAC), session management, and security event publishing — designed for a microservice architecture where other services delegate all auth decisions to this service.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Docker](#docker)
- [Project Structure](#project-structure)
- [Security Model](#security-model)
- [Contributing](#contributing)

---

## Architecture Overview

The service follows a **Layered Architecture** with clear separation of concerns:

```
┌──────────────────────────────────────────────────────────┐
│                    HTTP Request                           │
├──────────────────────────────────────────────────────────┤
│  Middlewares     │ API Key validation, Request logging    │
├──────────────────────────────────────────────────────────┤
│  Guards          │ InternalApiKeyGuard, ThrottlerGuard    │
├──────────────────────────────────────────────────────────┤
│  Controllers     │ Thin HTTP handlers, input validation   │
├──────────────────────────────────────────────────────────┤
│  Services        │ Business logic, orchestration          │
├──────────────────────────────────────────────────────────┤
│  Repositories    │ Data access (TypeORM)                  │
├──────────────────────────────────────────────────────────┤
│  Entities        │ Domain models / database tables        │
├──────────────────────────────────────────────────────────┤
│  Clients         │ Redis (blacklist), RabbitMQ (events)   │
└──────────────────────────────────────────────────────────┘
```

| Layer          | Responsibility                                                  |
| -------------- | --------------------------------------------------------------- |
| **Middlewares** | Pre-request processing: API key extraction, request logging     |
| **Guards**      | Authentication and authorization gates                          |
| **Controllers** | Parse HTTP requests, validate DTOs, delegate to services        |
| **Services**    | Core business logic: auth flows, token lifecycle, security      |
| **Repositories**| Database queries via TypeORM                                    |
| **Entities**    | TypeORM entities mapping to PostgreSQL tables                   |
| **Clients**     | External system integrations (Redis, RabbitMQ)                  |

---

## Technology Stack

| Category               | Technology                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| **Framework**          | NestJS 11 with Express                                                     |
| **Language**           | TypeScript 5 (strict mode)                                                 |
| **Database**           | PostgreSQL 16 via TypeORM                                                  |
| **Cache / Blacklist**  | Redis 7 via ioredis                                                        |
| **Message Broker**     | RabbitMQ 3.13 via amqplib                                                  |
| **Auth Tokens**        | RS256 JWT (jsonwebtoken) + opaque refresh tokens                           |
| **Password Hashing**   | Argon2id (primary) / bcrypt (fallback)                                     |
| **Validation**         | class-validator + class-transformer + Joi (env)                            |
| **Rate Limiting**      | @nestjs/throttler                                                          |
| **Scheduling**         | @nestjs/schedule (cron jobs)                                               |
| **Health Checks**      | @nestjs/terminus                                                           |
| **Monitoring**         | prom-client + @willsoto/nestjs-prometheus                                  |
| **Tracing**            | OpenTelemetry SDK                                                          |
| **Logging**            | Winston (structured JSON)                                                  |
| **Security Headers**   | Helmet                                                                     |
| **API Docs**           | @nestjs/swagger (Swagger UI at `/api-docs`)                                |
| **Testing**            | Jest + ts-jest + supertest                                                 |

---

## Prerequisites

| Tool        | Version | Purpose                                |
| ----------- | ------- | -------------------------------------- |
| Node.js     | ≥ 20    | Runtime                                |
| npm         | ≥ 10    | Package manager                        |
| Docker      | ≥ 24    | Container runtime for dependencies     |
| PostgreSQL  | 16      | Primary data store (via Docker)        |
| Redis       | 7       | Token blacklist & sessions (via Docker)|
| RabbitMQ    | 3.13    | Event publishing (via Docker)          |

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd auth-service
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your values — see "Environment Variables" below
```

Generate RSA key pair for JWT signing:

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Base64-encode for .env (Linux/macOS)
echo "JWT_PRIVATE_KEY=$(base64 -w 0 private.pem)"
echo "JWT_PUBLIC_KEY=$(base64 -w 0 public.pem)"
```

### 4. Start infrastructure

```bash
docker-compose up -d
# Starts PostgreSQL, Redis, and RabbitMQ
```

Verify services are healthy:

```bash
docker-compose ps
```

### 5. Run database migrations

```bash
npm run migration:run
```

### 6. Start the service

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The service starts on `http://localhost:3000` (or the `PORT` configured in `.env`).

- **Swagger UI:** `http://localhost:3000/api-docs`
- **Health check:** `http://localhost:3000/health/live`

---

## API Reference

All endpoints require the `X-Internal-API-Key` header unless noted otherwise.

### Authentication (`/v1/auth`)

| Method | Path                            | Description                        | Auth Required |
| ------ | ------------------------------- | ---------------------------------- | ------------- |
| POST   | `/v1/auth/register`             | Register a new user account        | API Key       |
| POST   | `/v1/auth/login`                | Authenticate and receive tokens    | API Key       |
| POST   | `/v1/auth/logout`               | Revoke tokens and end session      | API Key       |
| POST   | `/v1/auth/validate-token`       | Validate an access/refresh token   | API Key       |
| POST   | `/v1/auth/refresh-token`        | Refresh access token (rotation)    | API Key       |
| POST   | `/v1/auth/revoke-token`         | Revoke a specific token            | API Key       |
| POST   | `/v1/auth/revoke-all-tokens`    | Revoke all tokens for a user       | API Key       |
| POST   | `/v1/auth/forgot-password`      | Request a password reset email     | API Key       |
| POST   | `/v1/auth/reset-password`       | Reset password with token          | API Key       |
| POST   | `/v1/auth/request-email-change` | Request email change confirmation  | API Key       |
| POST   | `/v1/auth/confirm-email-change` | Confirm email change with token    | API Key       |

### Account Management (`/v1/accounts`) — Admin Only

| Method | Path                                  | Description                     | Auth Required |
| ------ | ------------------------------------- | ------------------------------- | ------------- |
| POST   | `/v1/accounts/lock`                   | Lock a user account             | API Key       |
| POST   | `/v1/accounts/unlock`                 | Unlock a locked account         | API Key       |
| POST   | `/v1/accounts/ban`                    | Ban a user permanently          | API Key       |
| DELETE | `/v1/accounts/:userId/credentials`    | Delete user credentials         | API Key       |

### Token Management (`/v1/tokens`)

| Method | Path                                  | Description                     | Auth Required |
| ------ | ------------------------------------- | ------------------------------- | ------------- |
| GET    | `/v1/tokens/introspect?token=<token>` | Introspect token metadata       | API Key       |
| GET    | `/v1/tokens/sessions/:userId`         | List active sessions for user   | API Key       |
| DELETE | `/v1/tokens/sessions/:sessionId`      | Revoke a specific session       | API Key       |

### Role Management (`/v1/roles`) — Admin Only

| Method | Path                   | Description                     | Auth Required |
| ------ | ---------------------- | ------------------------------- | ------------- |
| POST   | `/v1/roles/assign`     | Assign a role to a user         | API Key       |
| POST   | `/v1/roles/revoke`     | Revoke a role from a user       | API Key       |
| GET    | `/v1/roles/:userId`    | Get roles for a specific user   | API Key       |
| GET    | `/v1/roles`            | List all available roles        | API Key       |

### Health (`/health`) — No Authentication

| Method | Path            | Description                          | Auth Required |
| ------ | --------------- | ------------------------------------ | ------------- |
| GET    | `/health/live`  | Liveness probe (process is running)  | None          |
| GET    | `/health/ready` | Readiness probe (dependencies up)    | None          |

---

## Environment Variables

| Variable                             | Description                                       | Default                   | Required |
| ------------------------------------ | ------------------------------------------------- | ------------------------- | -------- |
| `NODE_ENV`                           | Runtime environment                               | `development`             | No       |
| `PORT`                               | HTTP listen port                                  | `3000`                    | No       |
| `SERVICE_NAME`                       | Logical service name for logs/tracing             | `auth-service`            | No       |
| `INTERNAL_API_KEY`                   | Shared secret for service-to-service calls        | —                         | **Yes**  |
| `JWT_PRIVATE_KEY`                    | Base64-encoded RSA private key                    | —                         | **Yes**  |
| `JWT_PUBLIC_KEY`                     | Base64-encoded RSA public key                     | —                         | **Yes**  |
| `JWT_ALGORITHM`                      | JWT signing algorithm                             | `RS256`                   | No       |
| `JWT_ACCESS_TOKEN_EXPIRY`            | Access token lifetime                             | `15m`                     | No       |
| `JWT_REFRESH_TOKEN_EXPIRY`           | Refresh token lifetime                            | `7d`                      | No       |
| `JWT_ISSUER`                         | JWT `iss` claim                                   | `auth-service`            | No       |
| `JWT_AUDIENCE`                       | JWT `aud` claim                                   | `omi-services`            | No       |
| `DB_HOST`                            | PostgreSQL hostname                               | `localhost`               | **Yes**  |
| `DB_PORT`                            | PostgreSQL port                                   | `5432`                    | No       |
| `DB_USERNAME`                        | Database username                                 | `postgres`                | **Yes**  |
| `DB_PASSWORD`                        | Database password                                 | —                         | **Yes**  |
| `DB_NAME`                            | Database name                                     | `auth_db`                 | **Yes**  |
| `DB_SSL`                             | Enable TLS for DB connections                     | `false`                   | No       |
| `DB_POOL_MIN`                        | Min connection pool size                          | `2`                       | No       |
| `DB_POOL_MAX`                        | Max connection pool size                          | `10`                      | No       |
| `REDIS_URL`                          | Redis connection URL                              | `redis://localhost:6379`  | **Yes**  |
| `REDIS_KEY_PREFIX`                   | Namespace prefix for Redis keys                   | `auth:`                   | No       |
| `REDIS_TLS`                          | Enable TLS for Redis                              | `false`                   | No       |
| `RABBITMQ_URL`                       | AMQP connection URL                               | `amqp://guest:guest@localhost:5672` | **Yes** |
| `RABBITMQ_EXCHANGE`                  | Topic exchange name                               | `auth.events`             | No       |
| `RABBITMQ_PREFETCH_COUNT`            | Max unacknowledged messages                       | `10`                      | No       |
| `RABBITMQ_HEARTBEAT_INTERVAL`        | AMQP heartbeat in seconds                         | `60`                      | No       |
| `BCRYPT_ROUNDS`                      | bcrypt cost factor                                | `12`                      | No       |
| `ARGON2_MEMORY_COST`                 | Argon2 memory in KiB                              | `65536`                   | No       |
| `ARGON2_TIME_COST`                   | Argon2 iterations                                 | `3`                       | No       |
| `ARGON2_PARALLELISM`                 | Argon2 threads                                    | `4`                       | No       |
| `MAX_LOGIN_ATTEMPTS`                 | Failed attempts before lockout                    | `5`                       | No       |
| `ACCOUNT_LOCKOUT_DURATION_MINUTES`   | Lockout duration in minutes                       | `15`                      | No       |
| `MAX_CONCURRENT_SESSIONS`            | Max active sessions per user                      | `5`                       | No       |
| `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES`| Reset token lifetime in minutes                   | `60`                      | No       |
| `LOG_LEVEL`                          | Logging level                                     | `log`                     | No       |
| `REQUEST_TIMEOUT_MS`                 | Global request timeout in ms                      | `30000`                   | No       |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS`       | Shutdown wait time in ms                          | `5000`                    | No       |

---

## Testing

```bash
# Unit tests
npm test

# Unit tests in watch mode
npm run test:watch

# Unit tests with coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e

# Debug tests
npm run test:debug
```

**Coverage threshold:** 85% across branches, functions, lines, and statements (enforced in `jest.config.ts`).

Test infrastructure setup:

```bash
# Start test containers (PostgreSQL, Redis, RabbitMQ)
npm run docker:test

# Run e2e tests
npm run test:e2e
```

---

## Docker

### Build the image

```bash
docker build -t auth-service .
# or
npm run docker:build
```

### Run with Docker

```bash
docker run -p 3001:3001 --env-file .env auth-service
```

### Docker Compose (development)

```bash
# Start infrastructure (PostgreSQL, Redis, RabbitMQ)
docker-compose up -d

# Stop infrastructure
docker-compose down

# Stop and remove volumes (reset all data)
docker-compose down -v
```

### Docker Compose (test environment)

```bash
docker-compose -f docker-compose.test.yml up -d
```

---

## Project Structure

```
auth-service/
├── src/
│   ├── controllers/          # HTTP endpoint handlers
│   │   ├── auth.controller.ts
│   │   ├── account.controller.ts
│   │   ├── token.controller.ts
│   │   ├── role.controller.ts
│   │   └── health.controller.ts
│   ├── services/             # Business logic
│   │   ├── token.service.ts          # JWT lifecycle, refresh, revocation
│   │   ├── credential.service.ts     # Password hashing, credential CRUD
│   │   ├── account.service.ts        # Lock, unlock, ban, delete
│   │   ├── session.service.ts        # Session tracking, device fingerprints
│   │   ├── blacklist.service.ts      # Redis-based JWT blacklist
│   │   ├── event.service.ts          # RabbitMQ event publishing
│   │   ├── health.service.ts         # Dependency health checks
│   │   └── role.service.ts           # RBAC role management
│   ├── repositories/         # Data access layer (TypeORM)
│   ├── entities/             # Database models
│   │   ├── user-credential.entity.ts
│   │   ├── refresh-token.entity.ts
│   │   ├── role.entity.ts
│   │   ├── audit-log.entity.ts
│   │   └── password-reset-token.entity.ts
│   ├── dtos/                 # Request/response validation
│   ├── interfaces/           # TypeScript interfaces
│   ├── clients/              # Redis & RabbitMQ clients
│   ├── guards/               # Auth guards (API key)
│   ├── middlewares/          # Request preprocessing
│   ├── interceptors/         # Response transformation, timeout
│   ├── filters/              # Global exception handling
│   ├── pipes/                # Input validation
│   ├── decorators/           # Custom decorators
│   ├── jobs/                 # Scheduled background tasks
│   ├── migrations/           # TypeORM database migrations
│   ├── constants/            # Enums, error messages, event names
│   ├── config/               # Configuration modules (Joi-validated)
│   ├── utils/                # Utility functions
│   ├── app.module.ts         # Root module
│   └── main.ts               # Application entry point
├── test/                     # E2E tests
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   ├── LIBRARIES.md
│   ├── PATTERNS.md
│   ├── API_FLOW.md
│   └── postman/              # Postman collection
├── docker-compose.yml        # Dev infrastructure
├── docker-compose.test.yml   # Test infrastructure
├── Dockerfile                # Multi-stage production build
├── .env.example              # Environment variable reference
├── jest.config.ts            # Test configuration (85% threshold)
├── tsconfig.json             # TypeScript config (strict)
└── .github/workflows/ci.yml  # CI pipeline
```

---

## Security Model

For full details, see [`docs/SECURITY.md`](docs/SECURITY.md).

- **JWT Access Tokens:** RS256-signed, 15-minute expiry, JTI-based revocation via Redis blacklist
- **Refresh Tokens:** Opaque UUID v4, SHA-256 hashed at rest, 7-day expiry, single-use with rotation
- **Password Hashing:** Argon2id (64 MB memory, 3 iterations) with bcrypt fallback
- **Brute Force Protection:** 5 failed attempts → 15-minute lockout, automatic recovery
- **Rate Limiting:** Per-endpoint throttling (login: 10/min, register: 5/min)
- **Session Management:** Max 5 concurrent sessions, device fingerprinting, per-session revocation
- **Token Reuse Detection:** Revoked refresh token use triggers full session family revocation
- **No User Enumeration:** Generic error messages on forgot-password and login
- **Service-to-Service Auth:** Internal API key via `X-Internal-API-Key` header

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and ensure all checks pass:
   ```bash
   npm run lint:check
   npm run format:check
   npm run typecheck
   npm run test:cov
   npm run build
   ```
4. Commit with a descriptive message following [Conventional Commits](https://www.conventionalcommits.org/)
5. Push and open a Pull Request against `develop`

### Code Style

- ESLint + Prettier enforced (see `.eslintrc.js` and `.prettierrc`)
- Run `npm run lint` and `npm run format` before committing
- All new code must include unit tests
- Maintain ≥ 85% coverage

### Branch Strategy

- `main` — Production-ready code
- `develop` — Integration branch for features
- `feature/*` — Feature branches (merge to `develop`)
- `hotfix/*` — Critical fixes (merge to `main` and `develop`)
# Auth-Service-NestJS

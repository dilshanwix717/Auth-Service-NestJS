# Getting Started — Auth Service NestJS

A step-by-step guide to understanding, running, and working with this project.  
Start from the top if you're a beginner. The guide gets progressively deeper.

---

## What Does This Project Do?

This is an **authentication microservice** — a backend server whose only job is to handle:

- **Who are you?** → Registration & Login (email + password)
- **Prove it** → JWT tokens (digital identity cards)
- **What can you do?** → Roles like USER, ADMIN, MODERATOR
- **Stay safe** → Password resets, account locking, brute-force protection
- **Keep track** → Audit logs of every security event

It's one piece of a larger system (a video streaming platform). Other services talk to it to verify users.

---

## What Technologies Are Used?

| Technology                | What It Is                                         | Why We Use It                                             |
| ------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| **NestJS**                | A Node.js framework (like Express, but structured) | Organized code with dependency injection                  |
| **TypeScript**            | JavaScript with types                              | Catch bugs before running code                            |
| **PostgreSQL**            | A relational database                              | Store users, tokens, roles, audit logs                    |
| **Redis**                 | A super-fast in-memory store                       | Instant token blacklisting (logout = instant)             |
| **RabbitMQ**              | A message queue                                    | Tell other services "hey, a user just signed up"          |
| **Docker**                | Containers for running services                    | Run PostgreSQL/Redis/RabbitMQ with one command            |
| **JWT (JSON Web Tokens)** | Digitally signed identity cards                    | Prove who you are without hitting the database every time |
| **Argon2id**              | Password hashing algorithm                         | Most secure way to store passwords today                  |

---

## How to Run the Project

### What You Need Installed

- **Node.js 20+** — [Download here](https://nodejs.org/)
- **Docker Desktop** — [Download here](https://www.docker.com/products/docker-desktop/)
- **Git** — [Download here](https://git-scm.com/)
- **OpenSSL** — Comes with Git for Windows (use Git Bash), or install separately

### Step 1 — Install Dependencies

Open a terminal in the project folder and run:

```powershell
cd c:\Users\AR3\Documents\GitHub\Auth-Service-NestJS
npm install
```

This downloads all the libraries listed in `package.json`.

### Step 2 — Start the Database, Redis, and RabbitMQ

```powershell
docker compose up -d
```

This starts three services in the background:

| Service        | What It Does                      | How to Check                                             |
| -------------- | --------------------------------- | -------------------------------------------------------- |
| **PostgreSQL** | Database on `localhost:5432`      | pgAdmin or any SQL client                                |
| **Redis**      | Cache on `localhost:6379`         | Redis CLI or RedisInsight                                |
| **RabbitMQ**   | Message queue on `localhost:5672` | Open `http://localhost:15672` (user: guest, pass: guest) |

> **Tip:** The `-d` flag means "detached" — it runs in the background so you get your terminal back.

### Step 3 — Generate RSA Keys for JWT Signing

JWTs need a pair of cryptographic keys. Think of it like a wax seal:

- **Private key** = the seal stamp (only this service has it)
- **Public key** = the seal pattern (anyone can verify it's real)

Run these commands in **Git Bash** or **PowerShell**:

```bash
# Create a private key
openssl genrsa -out private.pem 2048

# Extract the public key from it
openssl rsa -in private.pem -pubout -out public.pem
```

Now convert them to Base64 (the format our app expects):

**PowerShell:**

```powershell
$privateKeyBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("private.pem"))
$publicKeyBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("public.pem"))

Write-Host "JWT_PRIVATE_KEY=$privateKeyBase64"
Write-Host "JWT_PUBLIC_KEY=$publicKeyBase64"
```

Copy the output — you'll paste it into the next step.

### Step 4 — Create a `.env` File

Create a file called `.env` in the project root (same level as `package.json`):

```env
# ─── App Settings ────────────────────────────────────
NODE_ENV=development
PORT=3001
SERVICE_NAME=auth-service
INTERNAL_API_KEY=my-super-secret-api-key-for-dev

# ─── JWT Keys ────────────────────────────────────────
# Paste your Base64 keys from Step 3 here
JWT_PRIVATE_KEY=<paste_your_private_key_base64_here>
JWT_PUBLIC_KEY=<paste_your_public_key_base64_here>
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# ─── Database (PostgreSQL) ───────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres_dev_password
DB_NAME=auth_db

# ─── Redis ───────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── RabbitMQ ────────────────────────────────────────
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# ─── Security (defaults are fine for development) ────
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION_MINUTES=15
MAX_CONCURRENT_SESSIONS=5
```

> **Important:** Never commit `.env` to Git. It contains secrets.

### Step 5 — Set Up the Database Tables

```powershell
npm run build
npm run migration:run
```

This creates all the tables (users, tokens, roles, audit logs) in PostgreSQL.

### Step 6 — Start the App

```powershell
npm run start:dev
```

You should see output ending with something like:

```
Auth Service listening on port 3001
```

### Step 7 — Verify Everything Works

Open your browser or run:

```powershell
# Is the app alive?
curl http://localhost:3001/health/live
# Expected: { "status": "ok" }

# Are all dependencies connected?
curl http://localhost:3001/health/ready
# Expected: { "status": "healthy", checks: { postgresql: "up", redis: "up", rabbitmq: "up" } }
```

Open **http://localhost:3001/api-docs** in your browser to see the interactive API documentation (Swagger UI).

---

## Try It Out — Your First API Calls

Every request needs the `X-Internal-API-Key` header (this is how other services prove they're allowed to call us).

### Register a User

```powershell
$headers = @{
    "X-Internal-API-Key" = "my-super-secret-api-key-for-dev"
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Method POST -Uri "http://localhost:3001/v1/auth/register" `
    -Headers $headers `
    -Body '{"email":"test@example.com","password":"MyP@ssw0rd!","confirmPassword":"MyP@ssw0rd!"}'
```

You'll get back:

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "a1b2c3d4-...",
    "expiresIn": 900,
    "tokenType": "Bearer",
    "userId": "some-uuid"
  }
}
```

### Login

```powershell
$login = Invoke-RestMethod -Method POST -Uri "http://localhost:3001/v1/auth/login" `
    -Headers $headers `
    -Body '{"email":"test@example.com","password":"MyP@ssw0rd!"}'

# Save the tokens for later use
$accessToken = $login.data.accessToken
$refreshToken = $login.data.refreshToken
```

### Validate a Token

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3001/v1/auth/validate-token" `
    -Headers $headers `
    -Body "{`"token`":`"$accessToken`"}"
```

### Refresh Your Tokens

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3001/v1/auth/refresh-token" `
    -Headers $headers `
    -Body "{`"refreshToken`":`"$refreshToken`"}"
```

### Logout

```powershell
$headers["Authorization"] = "Bearer $accessToken"

Invoke-RestMethod -Method POST -Uri "http://localhost:3001/v1/auth/logout" `
    -Headers $headers `
    -Body "{`"refreshToken`":`"$refreshToken`"}"
```

> **Tip:** You can also import
> `docs/postman/auth-service.postman_collection.json` into **Postman** for
> a pre-built set of all API requests.

---

## How to Run Tests

```powershell
# Unit tests (fast, no external services needed)
npm run test

# Unit tests with coverage report
npm run test:cov

# End-to-end tests (needs test infrastructure running)
docker compose -f docker-compose.test.yml up -d
npm run test:e2e

# Type checking (no tests, just verifies TypeScript types)
npm run typecheck
```

The project requires **85% code coverage** across branches, functions, lines, and statements.

---

## Understanding the Code — Read It in This Order

If you're new to the codebase, read the files in this order. Each layer builds on the previous one.

### Layer 1 — The Vocabulary (read first)

These files define the "words" the project uses:

| File                                        | What You'll Learn                                      |
| ------------------------------------------- | ------------------------------------------------------ |
| `src/constants/roles.constant.ts`           | The three roles: USER, ADMIN, MODERATOR                |
| `src/constants/account-status.constant.ts`  | Account states: ACTIVE, LOCKED, BANNED, DELETED        |
| `src/constants/token.constant.ts`           | Token types (ACCESS vs REFRESH) and Redis key prefixes |
| `src/constants/error-messages.constant.ts`  | Every error code and message the API can return        |
| `src/constants/rabbitmq-events.constant.ts` | Every event published to RabbitMQ                      |

### Layer 2 — The Database Tables

These define what gets stored:

| File                                          | Table                   | What It Stores                                        |
| --------------------------------------------- | ----------------------- | ----------------------------------------------------- |
| `src/entities/user-credential.entity.ts`      | `user_credentials`      | Email, hashed password, roles, login attempts, status |
| `src/entities/refresh-token.entity.ts`        | `refresh_tokens`        | Hashed refresh tokens, expiry, device info            |
| `src/entities/role.entity.ts`                 | `roles`                 | Role definitions (USER, ADMIN, MODERATOR)             |
| `src/entities/audit-log.entity.ts`            | `audit_logs`            | Every security event (immutable log)                  |
| `src/entities/password-reset-token.entity.ts` | `password_reset_tokens` | Password reset tokens (single-use)                    |

### Layer 3 — Type Definitions

These describe the shape of data flowing through the app:

| File                                                  | What It Defines                                            |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `src/interfaces/jwt-payload.interface.ts`             | What's inside a JWT token (sub, email, roles, jti, exp...) |
| `src/interfaces/auth-response.interface.ts`           | What login/register returns (accessToken, refreshToken...) |
| `src/interfaces/token-validation-result.interface.ts` | Result of validating a token (valid/invalid + reason)      |
| `src/interfaces/session.interface.ts`                 | What a "session" looks like (device, IP, timestamps)       |
| `src/interfaces/service-response.interface.ts`        | Standard API response wrapper                              |
| `src/interfaces/health-check.interface.ts`            | Health check result structure                              |

### Layer 4 — Input Validation (DTOs)

DTOs (Data Transfer Objects) define **what the API accepts** and enforce rules:

| Folder                                | Key Rules                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/dtos/auth/register.dto.ts`       | Email must be valid; password needs uppercase, lowercase, number, special char; confirmPassword must match |
| `src/dtos/auth/login.dto.ts`          | Email + password required                                                                                  |
| `src/dtos/auth/reset-password.dto.ts` | Token + newPassword + confirmPassword, same strength rules                                                 |
| `src/dtos/role/assign-role.dto.ts`    | userId must be UUID, role must be valid name                                                               |
| `src/dtos/common/api-response.dto.ts` | Standard response envelope with success, message, data, traceId                                            |

### Layer 5 — Configuration

How the app reads environment variables and applies defaults:

| File                              | What It Configures                                                     |
| --------------------------------- | ---------------------------------------------------------------------- |
| `src/config/env.validation.ts`    | Validates ALL env vars at startup (app crashes if something's missing) |
| `src/config/database.config.ts`   | PostgreSQL connection (host, port, pool size)                          |
| `src/config/jwt.config.ts`        | RSA keys (decoded from Base64), token lifetimes                        |
| `src/config/redis.config.ts`      | Redis connection URL, key prefix                                       |
| `src/config/rabbitmq.config.ts`   | RabbitMQ connection URL, exchange name                                 |
| `src/config/security.config.ts`   | Hashing parameters, lockout rules, session limits                      |
| `src/config/rate-limit.config.ts` | How many requests per endpoint per time window                         |
| `src/config/swagger.config.ts`    | API docs UI setup                                                      |

### Layer 6 — Data Access (Repositories)

Repositories wrap database queries. Services call these instead of writing SQL:

| File                                             | Key Methods                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/repositories/user-credential.repository.ts` | `findByEmail()`, `createCredential()`, `incrementFailedAttempts()`, `lockAccount()`        |
| `src/repositories/refresh-token.repository.ts`   | `findByTokenHash()`, `revokeToken()`, `revokeAllUserTokens()`, `deleteExpiredAndRevoked()` |
| `src/repositories/audit-log.repository.ts`       | `create()` only — this table is append-only (no updates or deletes ever)                   |

### Layer 7 — Business Logic (Services)

This is where the real logic lives:

| File                                 | What It Does                                                               |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `src/services/auth.service.ts`       | **The main orchestrator** — register, login, logout, forgot/reset password |
| `src/services/token.service.ts`      | Generate JWTs, generate refresh tokens, validate tokens, handle rotation   |
| `src/services/credential.service.ts` | Hash and verify passwords (Argon2id primary, bcrypt fallback)              |
| `src/services/blacklist.service.ts`  | Add/check token JTIs in Redis (for instant logout)                         |
| `src/services/session.service.ts`    | Track active sessions, enforce max session limit                           |
| `src/services/role.service.ts`       | Assign/revoke roles (USER, ADMIN, MODERATOR)                               |
| `src/services/account.service.ts`    | Lock, unlock, ban accounts; delete credentials                             |
| `src/services/event.service.ts`      | Publish events to RabbitMQ (fire-and-forget)                               |
| `src/services/health.service.ts`     | Check if PostgreSQL, Redis, RabbitMQ are healthy                           |

### Layer 8 — HTTP Endpoints (Controllers)

Controllers are **thin wrappers** — they validate input and call services:

| File                                    | Base Path      | Key Endpoints                                                                           |
| --------------------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `src/controllers/auth.controller.ts`    | `/v1/auth`     | register, login, logout, validate-token, refresh-token, forgot-password, reset-password |
| `src/controllers/token.controller.ts`   | `/v1/tokens`   | introspect, list sessions, revoke session                                               |
| `src/controllers/role.controller.ts`    | `/v1/roles`    | assign, revoke, list roles                                                              |
| `src/controllers/account.controller.ts` | `/v1/accounts` | lock, unlock, ban, delete credentials                                                   |
| `src/controllers/health.controller.ts`  | `/health`      | liveness + readiness probes                                                             |

### Layer 9 — Cross-Cutting Concerns

These apply to **every request** automatically:

| File                                       | What It Does                                         |
| ------------------------------------------ | ---------------------------------------------------- |
| `src/guards/internal-api-key.guard.ts`     | Rejects requests without valid `X-Internal-API-Key`  |
| `src/guards/admin-only.guard.ts`           | Rejects non-admin users from admin endpoints         |
| `src/interceptors/logging.interceptor.ts`  | Logs every request start/end with duration           |
| `src/interceptors/response.interceptor.ts` | Wraps every response in `{ success, data, traceId }` |
| `src/interceptors/timeout.interceptor.ts`  | Kills requests that take longer than 30 seconds      |
| `src/filters/http-exception.filter.ts`     | Formats error responses consistently                 |
| `src/filters/typeorm-exception.filter.ts`  | Converts database errors to proper HTTP errors       |
| `src/pipes/validation.pipe.ts`             | Validates all incoming DTOs, strips unknown fields   |

### Layer 10 — External Connections (Clients)

| File                             | What It Connects To                                                               |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `src/clients/redis.client.ts`    | Redis — manages connection, auto-reconnect, provides `set/get/del` methods        |
| `src/clients/rabbitmq.client.ts` | RabbitMQ — manages connection, publishes events, buffers messages if disconnected |

### Layer 11 — Scheduled Jobs

These run automatically on a timer:

| File                                             | Schedule        | What It Does                                    |
| ------------------------------------------------ | --------------- | ----------------------------------------------- |
| `src/jobs/expired-refresh-token-cleanup.job.ts`  | Daily at 2 AM   | Deletes expired/old-revoked refresh tokens      |
| `src/jobs/expired-password-reset-cleanup.job.ts` | Daily at 3 AM   | Deletes expired/used password reset tokens      |
| `src/jobs/unlock-expired-lockouts.job.ts`        | Every 5 minutes | Auto-unlocks accounts whose lockout has expired |

### Layer 12 — Wiring It All Together

| File                | What It Does                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `src/app.module.ts` | Registers every controller, service, guard, interceptor, filter, and pipe |
| `src/main.ts`       | Starts the app: applies Helmet, CORS, Swagger, graceful shutdown          |

---

## Key Concepts Explained Simply

### What Is a JWT?

A JWT (JSON Web Token) is like a **digital ID card**:

```
┌─────────────────────────────────┐
│  HEADER: "I'm an RS256 JWT"    │
├─────────────────────────────────┤
│  PAYLOAD:                       │
│    User: john@example.com      │
│    Role: USER                  │
│    Expires: 15 minutes         │
│    ID: abc-123 (for revoking)  │
├─────────────────────────────────┤
│  SIGNATURE: (cryptographic     │
│    proof this wasn't tampered) │
└─────────────────────────────────┘
```

- The server **signs** it with a private key (only the auth service has this)
- Any service can **verify** it with the public key (no database call needed)
- It **expires** after 15 minutes (short-lived for security)

### What Are Access Tokens vs Refresh Tokens?

Think of it like a building pass system:

|               | Access Token                   | Refresh Token                     |
| ------------- | ------------------------------ | --------------------------------- |
| **Analogy**   | Day pass to enter the building | ID card to get a new day pass     |
| **Lifetime**  | 15 minutes                     | 7 days                            |
| **Format**    | JWT (readable, verifiable)     | Random UUID (opaque, meaningless) |
| **Stored in** | Client memory                  | Client storage + Database         |
| **Used for**  | Calling APIs                   | Getting new access tokens         |

**Why two tokens?** If someone steals your access token, it only works for 15 minutes. The refresh token is stored securely and is **single-use** — after you use it, you get a new one (rotation).

### What Is Token Rotation?

```
Login → You get Token-A (refresh) + JWT-1 (access)

15 min later, JWT-1 expires...

Use Token-A → You get Token-B (new refresh) + JWT-2 (new access)
                Token-A is now DEAD (revoked)

15 min later, JWT-2 expires...

Use Token-B → You get Token-C + JWT-3
                Token-B is now DEAD

What if an attacker stole Token-A and tries to use it?
→ Token-A is already revoked
→ THIS IS SUSPICIOUS — revoke ALL tokens for this user
→ The real user has to log in again (safe)
```

### What Is Argon2id?

It's the **recommended password hashing algorithm** (won the Password Hashing Competition in 2015). It's designed to be:

- **Slow on purpose** — takes ~100ms per hash, so attackers can't try billions of passwords
- **Memory-hungry** — uses 64 MB of RAM per hash, so GPUs can't run thousands in parallel
- **Resistant to side-channel attacks** — the "id" variant combines protections

Passwords are **never stored in plain text**. They're stored as hashes like:

```
$argon2id$v=19$m=65536,t=3,p=4$randomsalt$longhashvalue
```

### What Is the API Key For?

This service sits **behind an API gateway** in the larger system:

```
User's Browser → API Gateway → Auth Service
                     ↓
               Other Services
```

The `X-Internal-API-Key` header proves the request is coming from the API gateway (a trusted internal source), not directly from the internet. It uses **constant-time comparison** to prevent timing attacks.

### What Are the Account Statuses?

```
                ┌──────────────────────────────────────────┐
                │                                          │
   Register     │     5 failed logins    Admin action      │
      │         │           │                 │            │
      ▼         │           ▼                 ▼            │
   ACTIVE ──────┼──────→ LOCKED          BANNED            │
      │         │           │                              │
      │         │     Lockout expires                      │
      │         │     (auto, every 5 min)                  │
      │         │           │                              │
      │         │           ▼                              │
      │         └───── back to ACTIVE                      │
      │                                                    │
      └──────────────→ DELETED (GDPR / credential wipe)    │
                                                           │
              BANNED has no automatic recovery ────────────┘
```

---

## All API Endpoints at a Glance

Every request (except health checks) requires the header:

```
X-Internal-API-Key: your-api-key-value
```

### Authentication — `/v1/auth`

| Method | Endpoint                | What It Does                              |
| ------ | ----------------------- | ----------------------------------------- |
| POST   | `/register`             | Create a new account                      |
| POST   | `/login`                | Sign in and get tokens                    |
| POST   | `/logout`               | Invalidate your session                   |
| POST   | `/validate-token`       | Check if a JWT is still valid             |
| POST   | `/refresh-token`        | Exchange refresh token for new token pair |
| POST   | `/revoke-token`         | Revoke a specific token                   |
| POST   | `/revoke-all-tokens`    | Revoke all of a user's tokens             |
| POST   | `/forgot-password`      | Request a password reset email            |
| POST   | `/reset-password`       | Reset password using the token from email |
| POST   | `/request-email-change` | Start email change process                |
| POST   | `/confirm-email-change` | Confirm email change with token           |

### Token Management — `/v1/tokens`

| Method | Endpoint                | What It Does                        |
| ------ | ----------------------- | ----------------------------------- |
| GET    | `/introspect?token=...` | Decode and inspect a JWT            |
| GET    | `/sessions/:userId`     | List all active sessions for a user |
| DELETE | `/sessions/:sessionId`  | End a specific session              |

### Role Management — `/v1/roles` (Admin Only)

| Method | Endpoint   | What It Does              |
| ------ | ---------- | ------------------------- |
| POST   | `/assign`  | Give a role to a user     |
| POST   | `/revoke`  | Remove a role from a user |
| GET    | `/:userId` | See a user's roles        |
| GET    | `/`        | List all available roles  |

### Account Management — `/v1/accounts` (Admin Only)

| Method | Endpoint               | What It Does                   |
| ------ | ---------------------- | ------------------------------ |
| POST   | `/lock`                | Lock an account (temporary)    |
| POST   | `/unlock`              | Unlock an account              |
| POST   | `/ban`                 | Ban a user (permanent)         |
| DELETE | `/:userId/credentials` | Delete user credentials (GDPR) |

### Health Checks — `/health` (No Auth Required)

| Method | Endpoint | What It Does                                                  |
| ------ | -------- | ------------------------------------------------------------- |
| GET    | `/live`  | Is the process alive? (Kubernetes liveness)                   |
| GET    | `/ready` | Are database/Redis/RabbitMQ connected? (Kubernetes readiness) |

---

## Environment Variables Reference

### Required (app won't start without these)

| Variable           | Example                             | What It Is                                |
| ------------------ | ----------------------------------- | ----------------------------------------- |
| `INTERNAL_API_KEY` | `some-long-secret-string`           | Shared secret for service-to-service auth |
| `JWT_PRIVATE_KEY`  | `base64-encoded-RSA-key`            | Signs JWT tokens                          |
| `JWT_PUBLIC_KEY`   | `base64-encoded-RSA-key`            | Verifies JWT tokens                       |
| `DB_HOST`          | `localhost`                         | PostgreSQL hostname                       |
| `DB_PORT`          | `5432`                              | PostgreSQL port                           |
| `DB_USERNAME`      | `postgres`                          | PostgreSQL user                           |
| `DB_PASSWORD`      | `postgres_dev_password`             | PostgreSQL password                       |
| `DB_NAME`          | `auth_db`                           | PostgreSQL database name                  |
| `REDIS_URL`        | `redis://localhost:6379`            | Full Redis connection URL                 |
| `RABBITMQ_URL`     | `amqp://guest:guest@localhost:5672` | Full RabbitMQ connection URL              |

### Optional (have sensible defaults)

| Variable                              | Default       | What It Controls                     |
| ------------------------------------- | ------------- | ------------------------------------ |
| `NODE_ENV`                            | `development` | Runtime environment                  |
| `PORT`                                | `3000`        | HTTP listen port                     |
| `JWT_ACCESS_TOKEN_EXPIRY`             | `15m`         | How long access tokens last          |
| `JWT_REFRESH_TOKEN_EXPIRY`            | `7d`          | How long refresh tokens last         |
| `MAX_LOGIN_ATTEMPTS`                  | `5`           | Failed logins before lockout         |
| `ACCOUNT_LOCKOUT_DURATION_MINUTES`    | `15`          | How long a lockout lasts             |
| `MAX_CONCURRENT_SESSIONS`             | `5`           | Max simultaneous logins per user     |
| `BCRYPT_ROUNDS`                       | `12`          | bcrypt cost factor (fallback hasher) |
| `ARGON2_MEMORY_COST`                  | `65536`       | Argon2 memory usage in KiB (64 MB)   |
| `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` | `60`          | How long password reset links last   |

---

## RabbitMQ Events

When something happens in the auth service, it publishes an event so other services can react:

| Event                          | When It Fires                         |
| ------------------------------ | ------------------------------------- |
| `user.account.created`         | New user registered                   |
| `user.logged.in`               | Successful login                      |
| `user.logged.out`              | User logged out                       |
| `token.revoked`                | A specific token was revoked          |
| `token.all.revoked`            | All of a user's tokens were revoked   |
| `account.locked`               | Account locked (brute-force or admin) |
| `account.unlocked`             | Account unlocked                      |
| `account.banned`               | User permanently banned               |
| `credentials.deleted`          | User credentials wiped (GDPR)         |
| `password.reset.requested`     | Password reset initiated              |
| `password.reset.completed`     | Password successfully reset           |
| `role.assigned`                | User given a new role                 |
| `role.revoked`                 | Role removed from user                |
| `login.failed`                 | Failed login attempt                  |
| `suspicious.activity.detected` | Reuse of revoked refresh token        |

---

## All npm Scripts

| Command                      | What It Does                                         |
| ---------------------------- | ---------------------------------------------------- |
| `npm run start:dev`          | Start in dev mode with hot-reload                    |
| `npm run build`              | Compile TypeScript to JavaScript                     |
| `npm run start:prod`         | Run the compiled production build                    |
| `npm run test`               | Run unit tests                                       |
| `npm run test:e2e`           | Run end-to-end tests                                 |
| `npm run test:cov`           | Run tests and generate coverage report               |
| `npm run typecheck`          | Check TypeScript types without running               |
| `npm run lint`               | Auto-fix code style issues                           |
| `npm run migration:generate` | Create a new database migration                      |
| `npm run migration:run`      | Apply pending migrations                             |
| `npm run docker:up`          | Start dev infrastructure (Postgres, Redis, RabbitMQ) |
| `npm run docker:test`        | Start test infrastructure (separate ports)           |
| `npm run docker:build`       | Build the production Docker image                    |

---

## Security Features Summary

| Protection                      | How It Works                                                     |
| ------------------------------- | ---------------------------------------------------------------- |
| **Password hashing**            | Argon2id (64 MB memory, 3 iterations) — resistant to GPU attacks |
| **Asymmetric JWT signing**      | RS256 — private key signs, public key verifies                   |
| **Token blacklisting**          | Revoked token IDs stored in Redis with auto-cleanup              |
| **Refresh token rotation**      | Each use generates a new token; old one is invalidated           |
| **Reuse detection**             | If someone uses a revoked refresh token, ALL tokens are killed   |
| **Brute-force protection**      | 5 failed logins → 15-minute lockout                              |
| **User enumeration prevention** | Login errors are always generic ("Invalid credentials")          |
| **Rate limiting**               | Login: 10/min, Register: 5/min, Forgot-password: 3/5min          |
| **Session limits**              | Max 5 concurrent sessions per user                               |
| **Secure headers**              | Helmet sets X-Content-Type-Options, X-Frame-Options, HSTS        |
| **Input validation**            | All inputs validated with strict rules; unknown fields rejected  |
| **SQL injection prevention**    | TypeORM uses parameterized queries                               |
| **Timing attack prevention**    | API key comparison uses `crypto.timingSafeEqual`                 |
| **Audit logging**               | Every security event recorded in append-only log (no deletes)    |
| **Distributed tracing**         | Every request tagged with a traceId for debugging                |

---

## Further Reading

| Document               | What It Covers                                       |
| ---------------------- | ---------------------------------------------------- |
| `docs/ARCHITECTURE.md` | Detailed layer diagram and component relationships   |
| `docs/SECURITY.md`     | In-depth security design decisions                   |
| `docs/API_FLOW.md`     | Step-by-step flow diagrams for each operation        |
| `docs/PATTERNS.md`     | Design patterns used (Repository, Service Layer, DI) |
| `docs/LIBRARIES.md`    | Why each dependency was chosen                       |
| `docs/TESTING.md`      | Testing strategy, mocking approach, coverage goals   |

# Testing

## Testing Pyramid

The Auth Service follows the standard testing pyramid:

```
        ╱ ╲
       ╱ E2E ╲           Few — slow, full stack
      ╱───────╲
     ╱ Integra- ╲        Moderate — real dependencies
    ╱   tion     ╲
   ╱──────────────╲
  ╱   Unit Tests    ╲    Many — fast, isolated
 ╱───────────────────╲
```

| Level           | Count    | Speed  | Dependencies              | Purpose                              |
| --------------- | -------- | ------ | ------------------------- | ------------------------------------ |
| **Unit**        | Many     | Fast   | Mocks only                | Test individual functions/classes     |
| **Integration** | Moderate | Medium | Real DB, Redis, RabbitMQ  | Test service interactions             |
| **E2E**         | Few      | Slow   | Full running application  | Test complete API flows               |

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:cov

# Debug mode
npm run test:debug
```

### Integration Tests

```bash
# Start test infrastructure
npm run docker:test
# or
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm test -- --testPathPattern=integration
```

### End-to-End Tests

```bash
# Start test infrastructure
npm run docker:test

# Run e2e tests
npm run test:e2e
```

### Type Checking

```bash
npm run typecheck
```

---

## Coverage Requirements

Coverage is enforced at **85%** across all metrics. This is configured in `jest.config.ts`:

```typescript
coverageThreshold: {
  global: {
    branches: 85,
    functions: 85,
    lines: 85,
    statements: 85,
  },
},
```

**Excluded from coverage:**

| Pattern                      | Reason                                |
| ---------------------------- | ------------------------------------- |
| `src/main.ts`                | Application bootstrap (side effects)  |
| `src/migrations/**`          | Auto-generated database migrations    |
| `src/**/*.module.ts`         | NestJS module wiring (no logic)       |
| `src/**/*.interface.ts`      | TypeScript interfaces (no runtime)    |
| `src/**/*.dto.ts`            | Data Transfer Objects (declarations)  |
| `src/**/*.entity.ts`         | TypeORM entities (declarations)       |
| `src/**/*.constant.ts`       | Constants (no logic)                  |

### Viewing the Coverage Report

```bash
npm run test:cov

# Open HTML report
open coverage/lcov-report/index.html
```

---

## Mock Strategy

### In-Memory Repositories

Unit tests use mock repositories that implement the same interface as TypeORM repositories:

```typescript
const mockUserCredentialRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
};
```

### Redis Mock

Redis operations are mocked to avoid requiring a running Redis instance:

```typescript
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
};
```

### RabbitMQ Mock

Event publishing is mocked to prevent actual message publishing:

```typescript
const mockRabbitMQClient = {
  publish: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
};
```

### NestJS Testing Module

Unit tests use `@nestjs/testing` to create isolated module instances:

```typescript
import { Test, TestingModule } from '@nestjs/testing';

describe('TokenService', () => {
  let service: TokenService;
  let refreshTokenRepo: jest.Mocked<RefreshTokenRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: RefreshTokenRepository, useValue: mockRefreshTokenRepo },
        { provide: BlacklistService, useValue: mockBlacklistService },
        { provide: RedisClient, useValue: mockRedisClient },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    refreshTokenRepo = module.get(RefreshTokenRepository);
  });
});
```

---

## Test Environment Setup

### Environment Variables (`.env.test`)

The `.env.test` file provides test-specific configuration:

```bash
NODE_ENV=test
PORT=3001
INTERNAL_API_KEY=test-api-key

# Use test database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=test_password
DB_NAME=auth_db_test

# Use test Redis
REDIS_URL=redis://localhost:6379

# Use test RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# Faster hashing for tests
BCRYPT_ROUNDS=4
ARGON2_MEMORY_COST=1024
ARGON2_TIME_COST=1
ARGON2_PARALLELISM=1
```

> **Note:** Hashing parameters are reduced in tests for speed. `BCRYPT_ROUNDS=4` and minimal argon2 settings make tests run much faster while still exercising the hashing logic.

### Test Infrastructure (`docker-compose.test.yml`)

```bash
# Start test containers
docker-compose -f docker-compose.test.yml up -d

# Verify they're running
docker-compose -f docker-compose.test.yml ps

# Tear down
docker-compose -f docker-compose.test.yml down -v
```

---

## Security Test Scenarios

### Brute Force Protection

```typescript
describe('Brute Force Protection', () => {
  it('should lock account after 5 failed login attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .set('X-Internal-API-Key', apiKey)
        .send({ email: 'user@test.com', password: 'wrong-password' })
        .expect(401);
    }

    // 6th attempt should return 423 Locked
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Internal-API-Key', apiKey)
      .send({ email: 'user@test.com', password: 'wrong-password' })
      .expect(423);
  });
});
```

### Token Rotation Reuse Detection

```typescript
describe('Token Reuse Detection', () => {
  it('should revoke all tokens when a rotated token is reused', async () => {
    // Login to get initial tokens
    const loginRes = await login('user@test.com', 'ValidPass123!');
    const originalRefreshToken = loginRes.body.data.refreshToken;

    // Use refresh token to get new pair (rotates original)
    const refreshRes = await refresh(originalRefreshToken);
    const newRefreshToken = refreshRes.body.data.refreshToken;

    // Try to reuse the original (now-revoked) refresh token
    await request(app.getHttpServer())
      .post('/v1/auth/refresh-token')
      .set('X-Internal-API-Key', apiKey)
      .send({ refreshToken: originalRefreshToken })
      .expect(401);

    // The new token should also be revoked (family revocation)
    await request(app.getHttpServer())
      .post('/v1/auth/refresh-token')
      .set('X-Internal-API-Key', apiKey)
      .send({ refreshToken: newRefreshToken })
      .expect(401);
  });
});
```

### JWT Blacklist Validation

```typescript
describe('JWT Blacklisting', () => {
  it('should reject a blacklisted access token', async () => {
    const loginRes = await login('user@test.com', 'ValidPass123!');
    const accessToken = loginRes.body.data.accessToken;

    // Logout (blacklists the access token's JTI)
    await request(app.getHttpServer())
      .post('/v1/auth/logout')
      .set('X-Internal-API-Key', apiKey)
      .send({ accessToken, refreshToken: loginRes.body.data.refreshToken })
      .expect(200);

    // Validate the now-blacklisted token
    await request(app.getHttpServer())
      .post('/v1/auth/validate-token')
      .set('X-Internal-API-Key', apiKey)
      .send({ token: accessToken })
      .expect(200)
      .expect((res) => {
        expect(res.body.data.valid).toBe(false);
      });
  });
});
```

### No User Enumeration

```typescript
describe('User Enumeration Prevention', () => {
  it('should return the same response for existing and non-existing emails on forgot-password', async () => {
    const existingRes = await request(app.getHttpServer())
      .post('/v1/auth/forgot-password')
      .set('X-Internal-API-Key', apiKey)
      .send({ email: 'existing@test.com' });

    const nonExistingRes = await request(app.getHttpServer())
      .post('/v1/auth/forgot-password')
      .set('X-Internal-API-Key', apiKey)
      .send({ email: 'nonexistent@test.com' });

    expect(existingRes.status).toBe(nonExistingRes.status);
    expect(existingRes.body.message).toBe(nonExistingRes.body.message);
  });
});
```

### API Key Enforcement

```typescript
describe('API Key Guard', () => {
  it('should reject requests without X-Internal-API-Key', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'user@test.com', password: 'ValidPass123!' })
      .expect(401);
  });

  it('should reject requests with invalid API key', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Internal-API-Key', 'invalid-key')
      .send({ email: 'user@test.com', password: 'ValidPass123!' })
      .expect(401);
  });

  it('should allow health endpoints without API key', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
  });
});
```

---

## Test File Naming Conventions

| Test Type   | Pattern                        | Location          |
| ----------- | ------------------------------ | ----------------- |
| Unit        | `*.spec.ts`                    | `src/`            |
| Integration | `*.integration.spec.ts`        | `src/` or `test/` |
| E2E         | `*.e2e-spec.ts`                | `test/`           |

---

## CI Integration

Tests run automatically in the GitHub Actions CI pipeline:

1. **Lint & Type Check** — `npm run lint:check`, `npm run format:check`, `npm run typecheck`
2. **Unit Tests** — `npm run test:cov` (fails if coverage < 85%)
3. **Build** — `npm run build`

See `.github/workflows/ci.yml` for the full pipeline configuration.

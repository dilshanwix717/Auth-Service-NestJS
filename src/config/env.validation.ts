/**
 * Environment Variable Validation Schema
 *
 * Validates ALL environment variables at application startup using Joi.
 * If any required variable is missing or invalid, the application will
 * fail fast with a descriptive error message before any services start.
 *
 * This module is consumed by NestJS ConfigModule's `validate` option
 * to ensure a fully validated, typed configuration is available
 * throughout the application lifecycle.
 */

import * as Joi from 'joi';

/** Joi schema defining every environment variable the Auth Service requires. */
const envVarsSchema = Joi.object({
  // ─── Application ────────────────────────────────────────────────────
  /** Runtime environment – controls logging verbosity, error detail, etc. */
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),

  /** HTTP port the NestJS server listens on */
  PORT: Joi.number().port().default(3000),

  /** Logical name used in logs, tracing headers, and service discovery */
  SERVICE_NAME: Joi.string().default('auth-service'),

  /** Shared secret for internal service-to-service API calls */
  INTERNAL_API_KEY: Joi.string().required(),

  // ─── JWT ────────────────────────────────────────────────────────────
  /** Base64-encoded RSA private key used to sign JWTs */
  JWT_PRIVATE_KEY: Joi.string().base64().required(),

  /** Base64-encoded RSA public key used to verify JWTs */
  JWT_PUBLIC_KEY: Joi.string().base64().required(),

  /** JWT signing algorithm – only asymmetric RS256 is supported */
  JWT_ALGORITHM: Joi.string().default('RS256'),

  /** Lifetime of short-lived access tokens (e.g. "15m", "1h") */
  JWT_ACCESS_TOKEN_EXPIRY: Joi.string().default('15m'),

  /** Lifetime of long-lived refresh tokens (e.g. "7d", "30d") */
  JWT_REFRESH_TOKEN_EXPIRY: Joi.string().default('7d'),

  /** `iss` claim written into every JWT */
  JWT_ISSUER: Joi.string().default('auth-service'),

  /** `aud` claim written into every JWT */
  JWT_AUDIENCE: Joi.string().default('omi-services'),

  // ─── Database (PostgreSQL / TypeORM) ────────────────────────────────
  /** PostgreSQL server hostname or IP */
  DB_HOST: Joi.string().required(),

  /** PostgreSQL server port */
  DB_PORT: Joi.number().port().default(5432),

  /** Database login username */
  DB_USERNAME: Joi.string().required(),

  /** Database login password */
  DB_PASSWORD: Joi.string().required(),

  /** Name of the PostgreSQL database */
  DB_NAME: Joi.string().required(),

  /** Whether to enforce TLS when connecting to PostgreSQL */
  DB_SSL: Joi.boolean().default(false),

  /** Minimum number of connections kept in the TypeORM pool */
  DB_POOL_MIN: Joi.number().integer().min(0).default(2),

  /** Maximum number of connections the TypeORM pool may open */
  DB_POOL_MAX: Joi.number().integer().min(1).default(10),

  // ─── Redis ──────────────────────────────────────────────────────────
  /** Full Redis connection URL (e.g. redis://localhost:6379) */
  REDIS_URL: Joi.string().uri().required(),

  /** Prefix prepended to every Redis key to avoid collisions */
  REDIS_KEY_PREFIX: Joi.string().default('auth:'),

  /** Whether to use TLS when connecting to Redis */
  REDIS_TLS: Joi.boolean().default(false),

  // ─── RabbitMQ ───────────────────────────────────────────────────────
  /** AMQP connection URL (e.g. amqp://guest:guest@localhost:5672) */
  RABBITMQ_URL: Joi.string().uri().required(),

  /** Name of the topic exchange used for auth domain events */
  RABBITMQ_EXCHANGE: Joi.string().default('auth.events'),

  /** How many unacknowledged messages a consumer may hold */
  RABBITMQ_PREFETCH_COUNT: Joi.number().integer().min(1).default(10),

  /** AMQP heartbeat interval in seconds – keeps connections alive */
  RABBITMQ_HEARTBEAT_INTERVAL: Joi.number().integer().min(0).default(60),

  // ─── Password Hashing ──────────────────────────────────────────────
  /** bcrypt cost factor – higher = slower but more secure */
  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(31).default(12),

  /** Argon2 memory cost in KiB (e.g. 65536 = 64 MB) */
  ARGON2_MEMORY_COST: Joi.number().integer().min(1024).default(65536),

  /** Argon2 time cost – number of iterations */
  ARGON2_TIME_COST: Joi.number().integer().min(1).default(3),

  /** Argon2 parallelism – number of threads */
  ARGON2_PARALLELISM: Joi.number().integer().min(1).default(4),

  // ─── Security / Brute-Force Protection ─────────────────────────────
  /** Failed login attempts before the account is temporarily locked */
  MAX_LOGIN_ATTEMPTS: Joi.number().integer().min(1).default(5),

  /** Duration (minutes) an account stays locked after exceeding max attempts */
  ACCOUNT_LOCKOUT_DURATION_MINUTES: Joi.number().integer().min(1).default(15),

  /** Maximum number of active sessions a single user may have */
  MAX_CONCURRENT_SESSIONS: Joi.number().integer().min(1).default(5),

  /** Lifetime (minutes) of a password-reset token before it expires */
  PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: Joi.number().integer().min(1).default(60),

  // ─── Operational ───────────────────────────────────────────────────
  /** Minimum log level (error, warn, log, debug, verbose) */
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),

  /** Global HTTP request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: Joi.number().integer().min(0).default(30000),

  /** Time (ms) to wait for in-flight requests during graceful shutdown */
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: Joi.number().integer().min(0).default(5000),
}).options({
  /** Strip unknown env vars so they don't leak into the validated config */
  stripUnknown: true,
});

/**
 * Validates the raw process.env record against the Joi schema.
 *
 * @param config - Raw key-value map from process.env
 * @returns The validated (and coerced) configuration object
 * @throws Error with descriptive message if validation fails
 *
 * @example
 * // Used in AppModule:
 * ConfigModule.forRoot({ validate });
 */
export function validate(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = envVarsSchema.validate(config, {
    /** Report ALL validation errors at once, not just the first one */
    abortEarly: false,
  });

  if (error) {
    const messages = error.details
      .map((detail) => `  • ${detail.message}`)
      .join('\n');

    throw new Error(
      `Environment validation failed:\n${messages}\n\n` +
        'Ensure all required variables are set. See .env.example for reference.',
    );
  }

  return value as Record<string, unknown>;
}

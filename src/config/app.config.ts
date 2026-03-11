/**
 * Application Configuration Namespace
 *
 * Registers the 'app' configuration namespace with NestJS ConfigModule.
 * Provides general application-level settings such as the HTTP port,
 * runtime environment, service identity, and operational timeouts.
 *
 * Inject via: @Inject(appConfig.KEY) or configService.get('app')
 */

import { registerAs } from '@nestjs/config';

const appConfig = registerAs('app', () => ({
  /** HTTP port the NestJS server binds to */
  port: parseInt(process.env.PORT ?? '3000', 10),

  /** Current runtime environment (development | production | test | staging) */
  nodeEnv: process.env.NODE_ENV ?? 'development',

  /** Logical service name used in logs, tracing, and service discovery */
  serviceName: process.env.SERVICE_NAME ?? 'auth-service',

  /** Shared secret for authenticating internal service-to-service calls */
  internalApiKey: process.env.INTERNAL_API_KEY,

  /** Global HTTP request timeout in milliseconds */
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS ?? '30000', 10),

  /** Time (ms) to wait for in-flight requests during graceful shutdown */
  gracefulShutdownTimeoutMs: parseInt(
    process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? '5000',
    10,
  ),

  /** Minimum log level (error | warn | log | debug | verbose) */
  logLevel: process.env.LOG_LEVEL ?? 'log',
}));

export default appConfig;

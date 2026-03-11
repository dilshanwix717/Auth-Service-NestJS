/**
 * @file logger.util.ts
 * @description Custom structured JSON logger utility built on Winston.
 * Provides consistent, machine-parseable log output with required fields
 * for distributed tracing and observability.
 *
 * Architecture Role: Cross-Cutting Utility — used by all layers for structured logging.
 *
 * Key Concepts:
 * - JSON transport ensures logs are machine-parseable for log aggregation (ELK, Datadog, etc.)
 * - Every log entry includes timestamp, traceId, service name for cross-service correlation
 * - Log levels: error > warn > info > debug > verbose (controlled by LOG_LEVEL env var)
 *
 * Why Winston over alternatives:
 * - Most popular Node.js logging library with extensive ecosystem
 * - Native JSON transport support, custom formatters, multiple transports
 * - Production-proven at scale with async logging
 */

import * as winston from 'winston';

/** Default service name if not configured */
const SERVICE_NAME = process.env.SERVICE_NAME || 'auth-service';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Custom Winston format that adds required fields to every log entry.
 * Fields: timestamp, traceId, correlationId, service, level, message
 */
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

/**
 * Application-wide logger instance.
 * Uses JSON transport for structured logging compatible with log aggregation systems.
 *
 * @example
 * import { logger } from './utils/logger.util';
 * logger.info('User logged in', { userId: '123', traceId: 'abc-def' });
 * logger.error('Token validation failed', { error: err.message, jti: 'xxx' });
 */
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: SERVICE_NAME },
  format: structuredFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        structuredFormat,
        // In development, also add colorized output for readability
        ...(process.env.NODE_ENV !== 'production'
          ? [winston.format.colorize({ all: false })]
          : []),
      ),
    }),
  ],
  // Prevent Winston from exiting on uncaught exceptions — let NestJS handle shutdown
  exitOnError: false,
});

/**
 * Creates a child logger with additional default metadata.
 * Useful for adding context (e.g., traceId, userId) to all logs within a request scope.
 *
 * @param meta - Additional metadata to include in every log from this child logger
 * @returns A Winston child logger instance
 *
 * @example
 * const reqLogger = createChildLogger({ traceId: 'abc-123', userId: 'user-456' });
 * reqLogger.info('Processing request'); // automatically includes traceId and userId
 */
export function createChildLogger(
  meta: Record<string, unknown>,
): winston.Logger {
  return logger.child(meta);
}

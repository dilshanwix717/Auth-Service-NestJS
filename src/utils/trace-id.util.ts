/**
 * @file trace-id.util.ts
 * @description Utility for generating and propagating unique trace IDs (X-Request-ID).
 * Trace IDs enable distributed tracing across microservices by correlating logs,
 * error responses, and RabbitMQ messages to a single originating request.
 *
 * Architecture Role: Cross-Cutting Utility — used by middlewares, interceptors,
 * filters, and the RabbitMQ publisher to ensure every operation is traceable.
 *
 * Key Concepts:
 * - Accept X-Request-ID from API Gateway if present; generate UUID v4 if not
 * - Include traceId in all log entries, error responses, and RabbitMQ envelopes
 * - Supports W3C Trace Context propagation for OpenTelemetry integration
 */

import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';

/** Header name for the request/trace ID propagated between services */
export const TRACE_ID_HEADER = 'x-request-id';

/**
 * Extracts the trace ID from an incoming request's X-Request-ID header.
 * If the header is not present, generates a new UUID v4.
 *
 * @param request - Express request object
 * @returns The trace ID string (existing from header or newly generated)
 *
 * @example
 * // In a middleware or interceptor:
 * const traceId = extractOrGenerateTraceId(req);
 * req['traceId'] = traceId;
 */
export function extractOrGenerateTraceId(request: Request): string {
  const existingTraceId = request.headers[TRACE_ID_HEADER];

  if (existingTraceId && typeof existingTraceId === 'string') {
    return existingTraceId;
  }

  return generateTraceId();
}

/**
 * Generates a new UUID v4 trace ID.
 *
 * @returns A new UUID v4 string for use as a trace/correlation ID
 */
export function generateTraceId(): string {
  return uuidv4();
}

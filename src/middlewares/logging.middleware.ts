/**
 * @file logging.middleware.ts
 * @description NestJS middleware that provides structured request/response
 *              logging with trace ID propagation for distributed tracing.
 *              Attaches a trace ID to each request and logs completion metrics.
 * @module middlewares/logging
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.util';
import {
  extractOrGenerateTraceId,
  TRACE_ID_HEADER,
} from '../utils/trace-id.util';

/**
 * Middleware that logs all incoming HTTP requests with structured JSON output.
 * Extracts or generates a trace ID for each request, attaches it to the
 * request object, sets the X-Request-ID response header, and logs request
 * completion with duration metrics.
 *
 * @class LoggingMiddleware
 * @implements {NestMiddleware}
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  /**
   * Processes each incoming request by attaching a trace ID and logging
   * request metadata on response completion.
   *
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   * @param {NextFunction} next - Express next function
   * @returns {void}
   */
  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const traceId = extractOrGenerateTraceId(req);

    // Attach traceId to request for downstream use
    (req as any)['traceId'] = traceId;

    // Set trace ID on response header for client correlation
    res.setHeader(TRACE_ID_HEADER, traceId);

    logger.info('Incoming request', {
      method: req.method,
      path: req.originalUrl,
      traceId,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });

    // Log response metrics when the response finishes
    res.on('finish', () => {
      const duration = Date.now() - startTime;

      logger.info('Request completed', {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        traceId,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });
    });

    next();
  }
}

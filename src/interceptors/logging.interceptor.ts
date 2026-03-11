/**
 * @file logging.interceptor.ts
 * @description NestJS interceptor that provides structured logging for
 *              request entry and response completion with duration tracking.
 *              Complements the LoggingMiddleware with interceptor-level
 *              visibility into the NestJS pipeline.
 * @module interceptors/logging
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { logger } from '../utils/logger.util';

/**
 * Interceptor that logs request entry and response completion with
 * duration metrics and trace ID correlation. Provides application-level
 * request lifecycle logging within the NestJS pipeline.
 *
 * @class LoggingInterceptor
 * @implements {NestInterceptor}
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  /**
   * Intercepts the request/response cycle to log entry and completion events.
   * Captures start time on entry and calculates duration on completion.
   *
   * @param {ExecutionContext} context - NestJS execution context
   * @param {CallHandler} next - Call handler for the next interceptor/handler
   * @returns {Observable<any>} Observable of the response with logging side effects
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl } = request;
    const traceId = (request as any)['traceId'] as string;
    const startTime = Date.now();

    logger.info('Request started', {
      method,
      url: originalUrl,
      traceId,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          logger.info('Request completed', {
            method,
            url: originalUrl,
            statusCode: response.statusCode,
            duration: `${duration}ms`,
            traceId,
          });
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          logger.error('Request failed', {
            method,
            url: originalUrl,
            statusCode: error?.status || 500,
            duration: `${duration}ms`,
            traceId,
            error: error?.message,
          });
        },
      }),
    );
  }
}

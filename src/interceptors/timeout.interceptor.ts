/**
 * @file timeout.interceptor.ts
 * @description NestJS interceptor that enforces a per-request timeout
 *              using the rxjs timeout operator. Prevents long-running
 *              requests from consuming resources indefinitely.
 * @module interceptors/timeout
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { logger } from '../utils/logger.util';
import { Request } from 'express';

/**
 * Interceptor that enforces a configurable timeout on each request.
 * If a request exceeds the configured timeout duration, it throws
 * a RequestTimeoutException (HTTP 408).
 *
 * @class TimeoutInterceptor
 * @implements {NestInterceptor}
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  /** Request timeout duration in milliseconds. */
  private readonly timeoutMs: number;

  /**
   * Creates an instance of TimeoutInterceptor.
   *
   * @param {ConfigService} configService - NestJS config service for reading timeout configuration
   */
  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.configService.get<number>(
      'app.requestTimeoutMs',
      30000,
    );
  }

  /**
   * Intercepts the request and applies a timeout constraint. If the
   * handler does not complete within the configured timeout, a
   * RequestTimeoutException is thrown.
   *
   * @param {ExecutionContext} context - NestJS execution context
   * @param {CallHandler} next - Call handler for the next interceptor/handler
   * @returns {Observable<any>} Observable of the response with timeout enforcement
   * @throws {RequestTimeoutException} If the request exceeds the configured timeout
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          logger.warn('Request timed out', {
            method: request.method,
            url: request.originalUrl,
            timeoutMs: this.timeoutMs,
            traceId: (request as any)['traceId'],
          });

          return throwError(
            () =>
              new RequestTimeoutException(
                `Request timed out after ${this.timeoutMs}ms`,
              ),
          );
        }

        return throwError(() => err);
      }),
    );
  }
}

/**
 * @file response.interceptor.ts
 * @description NestJS interceptor that wraps all successful responses
 *              in the standardized ServiceResponse envelope format.
 *              Ensures consistent API response structure across all endpoints.
 * @module interceptors/response
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { ServiceResponse } from '../interfaces/service-response.interface';

/**
 * Interceptor that transforms all successful controller responses into
 * the standardized {@link ServiceResponse} envelope format. Attaches
 * traceId and timestamp for distributed tracing and debugging.
 *
 * @class ResponseInterceptor
 * @implements {NestInterceptor<T, ServiceResponse<T>>}
 * @template T - The type of the original response data
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ServiceResponse<T>>
{
  /**
   * Intercepts the outgoing response and wraps it in the standard
   * ServiceResponse envelope.
   *
   * @param {ExecutionContext} context - NestJS execution context
   * @param {CallHandler<T>} next - Call handler for the next interceptor/handler
   * @returns {Observable<ServiceResponse<T>>} Observable of the wrapped response
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ServiceResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const traceId = (request as any)['traceId'] as string;

    return next.handle().pipe(
      map((data) => ({
        success: true,
        message: 'Success',
        data: data ?? null,
        traceId,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}

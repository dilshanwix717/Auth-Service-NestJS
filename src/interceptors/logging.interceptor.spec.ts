/**
 * @file logging.interceptor.spec.ts
 * @description Unit tests for LoggingInterceptor — structured logging for
 *   request entry, response completion with duration, and error responses.
 */

import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';
import { logger } from '../utils/logger.util';

jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  const createMockContext = (
    method = 'GET',
    url = '/test/endpoint',
    traceId = 'test-trace-id',
    statusCode = 200,
  ): ExecutionContext => {
    const request = {
      method,
      originalUrl: url,
      traceId,
    };

    const response = {
      statusCode,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  };

  const createSuccessHandler = (data: any = { ok: true }): CallHandler => ({
    handle: () => of(data),
  });

  const createErrorHandler = (error: Error & { status?: number }): CallHandler => ({
    handle: () => throwError(() => error),
  });

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    jest.clearAllMocks();
  });

  describe('logs request start and completion with duration', () => {
    it('should log request started on entry', (done) => {
      const context = createMockContext('POST', '/auth/login', 'trace-123');
      const handler = createSuccessHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(logger.info).toHaveBeenCalledWith(
            'Request started',
            expect.objectContaining({
              method: 'POST',
              url: '/auth/login',
              traceId: 'trace-123',
            }),
          );
          done();
        },
      });
    });

    it('should log request completed with status and duration', (done) => {
      const context = createMockContext('GET', '/auth/validate', 'trace-456', 200);
      const handler = createSuccessHandler();

      interceptor.intercept(context, handler).subscribe({
        next: () => {
          expect(logger.info).toHaveBeenCalledWith(
            'Request completed',
            expect.objectContaining({
              method: 'GET',
              url: '/auth/validate',
              statusCode: 200,
              duration: expect.stringMatching(/^\d+ms$/),
              traceId: 'trace-456',
            }),
          );
          done();
        },
      });
    });
  });

  describe('logs error responses', () => {
    it('should log error with status code and duration', (done) => {
      const context = createMockContext('POST', '/auth/login', 'trace-789');
      const error: Error & { status?: number } = new Error('Unauthorized');
      error.status = 401;
      const handler = createErrorHandler(error);

      interceptor.intercept(context, handler).subscribe({
        error: () => {
          expect(logger.error).toHaveBeenCalledWith(
            'Request failed',
            expect.objectContaining({
              method: 'POST',
              url: '/auth/login',
              statusCode: 401,
              duration: expect.stringMatching(/^\d+ms$/),
              traceId: 'trace-789',
              error: 'Unauthorized',
            }),
          );
          done();
        },
      });
    });

    it('should default to 500 status when error has no status', (done) => {
      const context = createMockContext('POST', '/auth/register');
      const handler = createErrorHandler(new Error('Internal error'));

      interceptor.intercept(context, handler).subscribe({
        error: () => {
          expect(logger.error).toHaveBeenCalledWith(
            'Request failed',
            expect.objectContaining({
              statusCode: 500,
            }),
          );
          done();
        },
      });
    });
  });
});

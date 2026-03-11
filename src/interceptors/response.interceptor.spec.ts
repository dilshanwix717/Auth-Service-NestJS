/**
 * @file response.interceptor.spec.ts
 * @description Unit tests for ResponseInterceptor — wraps controller responses
 *   in the standardized ServiceResponse envelope format.
 */

import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<any>;

  const createMockContext = (traceId?: string): ExecutionContext => {
    const request = {
      traceId: traceId ?? 'test-trace-id',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (data: any): CallHandler => ({
    handle: () => of(data),
  });

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  describe('wraps response in standard envelope', () => {
    it('should wrap response data in ServiceResponse format', (done) => {
      const context = createMockContext('trace-123');
      const handler = createMockCallHandler({ userId: 'user-1', email: 'test@test.com' });

      interceptor.intercept(context, handler).subscribe((result) => {
        expect(result).toEqual({
          success: true,
          message: 'Success',
          data: { userId: 'user-1', email: 'test@test.com' },
          traceId: 'trace-123',
          timestamp: expect.any(String),
        });
        done();
      });
    });

    it('should include valid ISO timestamp', (done) => {
      const context = createMockContext();
      const handler = createMockCallHandler({ value: 1 });

      interceptor.intercept(context, handler).subscribe((result) => {
        const timestamp = new Date((result as any).timestamp);
        expect(timestamp.getTime()).not.toBeNaN();
        done();
      });
    });
  });

  describe('handles null response', () => {
    it('should set data to null when handler returns null', (done) => {
      const context = createMockContext('trace-456');
      const handler = createMockCallHandler(null);

      interceptor.intercept(context, handler).subscribe((result) => {
        expect(result.success).toBe(true);
        expect(result.data).toBeNull();
        done();
      });
    });

    it('should set data to null when handler returns undefined', (done) => {
      const context = createMockContext();
      const handler = createMockCallHandler(undefined);

      interceptor.intercept(context, handler).subscribe((result) => {
        expect(result.data).toBeNull();
        done();
      });
    });
  });
});

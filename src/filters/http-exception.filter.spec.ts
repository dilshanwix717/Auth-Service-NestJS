/**
 * @file http-exception.filter.spec.ts
 * @description Unit tests for HttpExceptionFilter — transforms HttpExceptions
 *   into the standardized ServiceResponse error envelope with traceId.
 */

import {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  const createMockArgumentsHost = (traceId = 'test-trace-id') => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    const mockRequest = {
      originalUrl: '/auth/login',
      method: 'POST',
      traceId,
    };

    const mockResponse = {
      status: mockStatus,
    };

    const host = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;

    return { host, mockJson, mockStatus };
  };

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jest.clearAllMocks();
  });

  describe('transforms HttpException to standard response', () => {
    it('should format a 400 BadRequestException', () => {
      const { host, mockJson, mockStatus } = createMockArgumentsHost('trace-123');
      const exception = new BadRequestException({
        message: 'Validation failed',
        errorCode: 'AUTH_PASSWORD_WEAK',
      });

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Validation failed',
          errorCode: 'AUTH_PASSWORD_WEAK',
          data: null,
          traceId: 'trace-123',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should format a 401 UnauthorizedException', () => {
      const { host, mockJson, mockStatus } = createMockArgumentsHost();
      const exception = new UnauthorizedException({
        message: 'Invalid credentials',
        errorCode: 'AUTH_INVALID_CREDENTIALS',
      });

      filter.catch(exception, host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid credentials',
          errorCode: 'AUTH_INVALID_CREDENTIALS',
        }),
      );
    });

    it('should handle string exception response', () => {
      const { host, mockJson } = createMockArgumentsHost();
      const exception = new HttpException('Something went wrong', 400);

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Something went wrong',
        }),
      );
    });

    it('should handle array messages (validation pipe)', () => {
      const { host, mockJson } = createMockArgumentsHost();
      const exception = new BadRequestException({
        message: ['email must be valid', 'password is too short'],
      });

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'email must be valid; password is too short',
        }),
      );
    });
  });

  describe('includes traceId in response', () => {
    it('should include the traceId from the request', () => {
      const { host, mockJson } = createMockArgumentsHost('my-trace-id');
      const exception = new BadRequestException('Bad request');

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          traceId: 'my-trace-id',
        }),
      );
    });
  });

  describe('handles unknown exceptions (500)', () => {
    it('should use fallback error code for exceptions without errorCode', () => {
      const { host, mockJson } = createMockArgumentsHost();
      const exception = new InternalServerErrorException('Server error');

      filter.catch(exception, host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: 'INTERNAL_SERVER_ERROR',
        }),
      );
    });
  });
});

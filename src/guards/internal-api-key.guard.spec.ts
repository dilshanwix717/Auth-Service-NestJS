/**
 * @file internal-api-key.guard.spec.ts
 * @description Unit tests for InternalApiKeyGuard — validates X-Internal-API-Key
 *   header, supports @PublicInternal() bypass, and uses constant-time comparison.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InternalApiKeyGuard } from './internal-api-key.guard';

jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('InternalApiKeyGuard', () => {
  let guard: InternalApiKeyGuard;
  let reflector: jest.Mocked<Reflector>;

  const mockApiKey = 'test-internal-api-key-12345';

  const createMockContext = (
    headers: Record<string, string> = {},
    path = '/test',
    method = 'GET',
  ): ExecutionContext => {
    const request = {
      headers,
      path,
      method,
      traceId: 'mock-trace-id',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalApiKeyGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockApiKey),
          },
        },
      ],
    }).compile();

    guard = module.get<InternalApiKeyGuard>(InternalApiKeyGuard);
    reflector = module.get(Reflector);

    jest.clearAllMocks();
  });

  describe('valid API key', () => {
    it('should allow request with valid API key', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockContext({
        'x-internal-api-key': mockApiKey,
      });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('missing API key', () => {
    it('should reject with UnauthorizedException when API key is missing', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockContext({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('invalid API key', () => {
    it('should reject with UnauthorizedException when API key is wrong', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockContext({
        'x-internal-api-key': 'wrong-api-key',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject when API key has different length', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const context = createMockContext({
        'x-internal-api-key': 'short',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('@PublicInternal() bypass', () => {
    it('should allow request when endpoint is marked @PublicInternal()', () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const context = createMockContext({}); // No API key header

      expect(guard.canActivate(context)).toBe(true);
    });
  });
});

/**
 * @file admin-only.guard.spec.ts
 * @description Unit tests for AdminOnlyGuard — enforces ADMIN role requirement,
 *   extracts roles from X-User-Roles header or request body.
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminOnlyGuard } from './admin-only.guard';

jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('AdminOnlyGuard', () => {
  let guard: AdminOnlyGuard;

  const createMockContext = (
    headers: Record<string, string> = {},
    body: Record<string, unknown> = {},
    path = '/admin/test',
    method = 'POST',
  ): ExecutionContext => {
    const request = {
      headers,
      body,
      path,
      method,
      traceId: 'mock-trace-id',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    guard = new AdminOnlyGuard();
    jest.clearAllMocks();
  });

  describe('admin role passes', () => {
    it('should allow request when X-User-Roles header contains ADMIN', () => {
      const context = createMockContext({
        'x-user-roles': 'ADMIN,USER',
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should handle case-insensitive role matching', () => {
      const context = createMockContext({
        'x-user-roles': 'admin,user',
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow when roles are in request body', () => {
      const context = createMockContext(
        {},
        { roles: ['ADMIN', 'USER'] },
      );

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('non-admin rejects', () => {
    it('should throw ForbiddenException when user only has USER role', () => {
      const context = createMockContext({
        'x-user-roles': 'USER',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for MODERATOR role (not ADMIN)', () => {
      const context = createMockContext({
        'x-user-roles': 'USER,MODERATOR',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('missing credential rejects', () => {
    it('should throw ForbiddenException when no roles header or body', () => {
      const context = createMockContext({}, {});

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when roles header is empty string', () => {
      const context = createMockContext({
        'x-user-roles': '',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});

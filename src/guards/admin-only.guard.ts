/**
 * @file admin-only.guard.ts
 * @description NestJS guard that restricts endpoint access to users with
 *              the ADMIN role. Extracts roles from the X-User-Roles header
 *              (set by API Gateway) or from the request body.
 * @module guards/admin-only
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { logger } from '../utils/logger.util';
import {
  ErrorMessages,
  ErrorCodes,
} from '../constants/error-messages.constant';
import { Roles } from '../constants/roles.constant';

/**
 * Guard that enforces admin-only access on protected endpoints.
 * Checks for the ADMIN role in the X-User-Roles header (propagated
 * by the API Gateway from validated token claims) or in the request body.
 *
 * @class AdminOnlyGuard
 * @implements {CanActivate}
 */
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  /**
   * Determines whether the current request has admin-level access.
   * Extracts user roles from the X-User-Roles header (comma-separated)
   * or from req.body.roles, and checks for the ADMIN role.
   *
   * @param {ExecutionContext} context - NestJS execution context
   * @returns {boolean} True if the caller has the ADMIN role
   * @throws {ForbiddenException} If the caller does not have admin privileges
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const roles = this.extractRoles(request);

    if (!roles.includes(Roles.ADMIN)) {
      logger.warn('Non-admin access attempt to admin-only endpoint', {
        path: request.path,
        method: request.method,
        roles,
        traceId: (request as any)['traceId'],
      });

      throw new ForbiddenException({
        message: ErrorMessages.AUTH_INSUFFICIENT_PERMISSIONS,
        errorCode: ErrorCodes.INSUFFICIENT_PERMISSIONS,
      });
    }

    return true;
  }

  /**
   * Extracts user roles from the request. Checks the X-User-Roles header
   * first (comma-separated string set by API Gateway), then falls back
   * to the request body roles field.
   *
   * @private
   * @param {Request} request - Express request object
   * @returns {string[]} Array of role strings
   */
  private extractRoles(request: Request): string[] {
    // Prefer roles from API Gateway header (validated upstream)
    const headerRoles = request.headers['x-user-roles'] as string;
    if (headerRoles) {
      return headerRoles
        .split(',')
        .map((role) => role.trim().toUpperCase());
    }

    // Fallback to request body roles (for internal service calls)
    if (request.body?.roles && Array.isArray(request.body.roles)) {
      return request.body.roles.map((role: string) =>
        role.trim().toUpperCase(),
      );
    }

    return [];
  }
}

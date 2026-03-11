/**
 * @file internal-api-key.guard.ts
 * @description NestJS guard that enforces X-Internal-API-Key validation
 *              on protected endpoints. Respects the @PublicInternal()
 *              decorator to skip validation for health checks, Swagger, etc.
 * @module guards/internal-api-key
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.util';
import {
  ErrorMessages,
  ErrorCodes,
} from '../constants/error-messages.constant';
import { PUBLIC_INTERNAL_KEY } from '../decorators/public-internal.decorator';

/**
 * Guard that validates the X-Internal-API-Key header for service-to-service
 * authentication. Endpoints decorated with @PublicInternal() bypass validation.
 * Uses constant-time string comparison to prevent timing attacks.
 *
 * @class InternalApiKeyGuard
 * @implements {CanActivate}
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  /** The expected internal API key loaded from configuration. */
  private readonly internalApiKey: string;

  /**
   * Creates an instance of InternalApiKeyGuard.
   *
   * @param {Reflector} reflector - NestJS reflector for reading metadata
   * @param {ConfigService} configService - NestJS config service for app configuration
   */
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.internalApiKey = this.configService.get<string>('app.internalApiKey', '');
  }

  /**
   * Determines whether the current request is allowed to proceed.
   * Checks for @PublicInternal() metadata first; if present, allows access.
   * Otherwise, validates the X-Internal-API-Key header.
   *
   * @param {ExecutionContext} context - NestJS execution context
   * @returns {boolean} True if the request is authorized
   * @throws {UnauthorizedException} If the API key is missing or invalid
   */
  canActivate(context: ExecutionContext): boolean {
    const isPublicInternal = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_INTERNAL_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicInternal) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-internal-api-key'] as string;

    if (!apiKey) {
      logger.warn('API key missing from guarded request', {
        path: request.path,
        method: request.method,
        traceId: (request as any)['traceId'],
      });

      throw new UnauthorizedException({
        message: ErrorMessages.AUTH_API_KEY_MISSING,
        errorCode: ErrorCodes.API_KEY_MISSING,
      });
    }

    if (!this.isApiKeyValid(apiKey)) {
      logger.warn('Invalid API key on guarded request', {
        path: request.path,
        method: request.method,
        traceId: (request as any)['traceId'],
      });

      throw new UnauthorizedException({
        message: ErrorMessages.AUTH_API_KEY_INVALID,
        errorCode: ErrorCodes.API_KEY_INVALID,
      });
    }

    return true;
  }

  /**
   * Performs constant-time comparison of the provided API key against
   * the configured internal API key using crypto.timingSafeEqual.
   *
   * @private
   * @param {string} providedKey - The API key from the request header
   * @returns {boolean} True if the keys match, false otherwise
   */
  private isApiKeyValid(providedKey: string): boolean {
    const expected = Buffer.from(this.internalApiKey);
    const provided = Buffer.from(providedKey);

    if (expected.length !== provided.length) {
      return false;
    }

    return crypto.timingSafeEqual(expected, provided);
  }
}

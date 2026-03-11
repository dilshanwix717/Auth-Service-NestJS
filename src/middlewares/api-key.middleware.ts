/**
 * @file api-key.middleware.ts
 * @description NestJS middleware that validates the X-Internal-API-Key header
 *              for service-to-service authentication. Uses constant-time
 *              comparison to prevent timing attacks.
 * @module middlewares/api-key
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.util';
import { ErrorMessages } from '../constants/error-messages.constant';

/**
 * Middleware that validates the X-Internal-API-Key header against the
 * configured internal API key. Intended for protecting internal
 * service-to-service endpoints from unauthorized access.
 *
 * @class ApiKeyMiddleware
 * @implements {NestMiddleware}
 */
@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  /** The expected internal API key loaded from configuration. */
  private readonly internalApiKey: string;

  /**
   * Creates an instance of ApiKeyMiddleware.
   *
   * @param {ConfigService} configService - NestJS config service for reading app configuration
   */
  constructor(private readonly configService: ConfigService) {
    this.internalApiKey = this.configService.get<string>('app.internalApiKey', '');
  }

  /**
   * Validates the X-Internal-API-Key header on each incoming request.
   * Uses crypto.timingSafeEqual for constant-time comparison to prevent
   * timing-based side-channel attacks.
   *
   * @param {Request} req - Express request object
   * @param {Response} res - Express response object
   * @param {NextFunction} next - Express next function
   * @returns {void | Response} Calls next() on success, or returns 401 JSON response on failure
   */
  use(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-internal-api-key'] as string;

    if (!apiKey) {
      logger.warn('API key missing from request', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        message: ErrorMessages.AUTH_API_KEY_MISSING,
        data: null,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!this.isApiKeyValid(apiKey)) {
      logger.warn('Invalid API key provided', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        message: ErrorMessages.AUTH_API_KEY_INVALID,
        data: null,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
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

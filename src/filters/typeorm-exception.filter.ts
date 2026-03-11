/**
 * @file typeorm-exception.filter.ts
 * @description Exception filter that catches TypeORM-specific database errors
 *              and translates them into appropriate HTTP responses with
 *              standardized error format. Handles unique constraint violations,
 *              entity-not-found errors, and generic database failures.
 * @module filters/typeorm-exception
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import { logger } from '../utils/logger.util';
import { ErrorCodes } from '../constants/error-messages.constant';

/**
 * Exception filter that intercepts TypeORM database errors and maps them
 * to appropriate HTTP status codes and standardized error responses.
 *
 * Handled error types:
 * - QueryFailedError with code '23505' → 409 Conflict (unique constraint violation)
 * - EntityNotFoundError → 404 Not Found
 * - Other TypeORM errors → 500 Internal Server Error
 *
 * @class TypeOrmExceptionFilter
 * @implements {ExceptionFilter}
 */
@Catch(QueryFailedError, EntityNotFoundError)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  /**
   * Catches TypeORM exceptions and sends a standardized JSON error response
   * with the appropriate HTTP status code.
   *
   * @param {QueryFailedError | EntityNotFoundError} exception - The caught TypeORM exception
   * @param {ArgumentsHost} host - NestJS arguments host for accessing request/response
   * @returns {void}
   */
  catch(
    exception: QueryFailedError | EntityNotFoundError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const traceId = (request as any)['traceId'] as string;

    const { status, message, errorCode } =
      this.resolveErrorDetails(exception);

    logger.error('TypeORM exception caught', {
      statusCode: status,
      message,
      errorCode,
      path: request.originalUrl,
      method: request.method,
      traceId,
      exceptionType: exception.constructor.name,
    });

    response.status(status).json({
      success: false,
      message,
      errorCode,
      data: null,
      traceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Resolves the HTTP status code, error message, and error code based
   * on the type of TypeORM exception.
   *
   * @private
   * @param {QueryFailedError | EntityNotFoundError} exception - The caught TypeORM exception
   * @returns {{ status: number; message: string; errorCode: string }} Resolved error details
   */
  private resolveErrorDetails(
    exception: QueryFailedError | EntityNotFoundError,
  ): { status: number; message: string; errorCode: string } {
    // Unique constraint violation (PostgreSQL error code 23505)
    if (
      exception instanceof QueryFailedError &&
      (exception as any).code === '23505'
    ) {
      return {
        status: HttpStatus.CONFLICT,
        message: 'A record with the given details already exists',
        errorCode: ErrorCodes.EMAIL_EXISTS,
      };
    }

    // Entity not found
    if (exception instanceof EntityNotFoundError) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested resource was not found',
        errorCode: ErrorCodes.USER_NOT_FOUND,
      };
    }

    // Generic database error
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected database error occurred',
      errorCode: ErrorCodes.INTERNAL_SERVER_ERROR,
    };
  }
}

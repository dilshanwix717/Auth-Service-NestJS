/**
 * @file http-exception.filter.ts
 * @description Global exception filter that catches all HttpException instances
 *              and formats them into the standardized ServiceResponse error
 *              envelope. Ensures consistent error response structure with
 *              traceId correlation across the entire application.
 * @module filters/http-exception
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { logger } from '../utils/logger.util';
import { ErrorCodes } from '../constants/error-messages.constant';

/**
 * Global exception filter that intercepts all HttpException instances
 * and transforms them into a standardized error response format.
 * Extracts errorCode from the exception response when available and
 * includes the traceId for distributed tracing correlation.
 *
 * @class HttpExceptionFilter
 * @implements {ExceptionFilter}
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  /**
   * Catches an HttpException and sends a standardized JSON error response.
   *
   * @param {HttpException} exception - The caught HTTP exception
   * @param {ArgumentsHost} host - NestJS arguments host for accessing request/response
   * @returns {void}
   */
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const traceId = (request as any)['traceId'] as string;

    // Extract error details from the exception response
    const errorCode = this.extractErrorCode(exceptionResponse);
    const message = this.extractMessage(exception, exceptionResponse);

    logger.error('HTTP exception caught', {
      statusCode: status,
      message,
      errorCode,
      path: request.originalUrl,
      method: request.method,
      traceId,
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
   * Extracts the machine-readable error code from the exception response.
   * Checks for an errorCode property in the response object, falls back
   * to a generic code based on HTTP status.
   *
   * @private
   * @param {string | object} exceptionResponse - The raw exception response
   * @returns {string} The extracted or derived error code
   */
  private extractErrorCode(exceptionResponse: string | object): string {
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, any>;
      if (resp.errorCode) {
        return resp.errorCode;
      }
    }

    return ErrorCodes.INTERNAL_SERVER_ERROR;
  }

  /**
   * Extracts the human-readable error message from the exception.
   * Prefers the message from the exception response object, falls back
   * to the exception's own message property.
   *
   * @private
   * @param {HttpException} exception - The caught HTTP exception
   * @param {string | object} exceptionResponse - The raw exception response
   * @returns {string} The extracted error message
   */
  private extractMessage(
    exception: HttpException,
    exceptionResponse: string | object,
  ): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, any>;
      if (resp.message) {
        return Array.isArray(resp.message)
          ? resp.message.join('; ')
          : resp.message;
      }
    }

    return exception.message;
  }
}

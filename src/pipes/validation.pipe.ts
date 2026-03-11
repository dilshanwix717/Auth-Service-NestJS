/**
 * @file validation.pipe.ts
 * @description Custom global validation pipe extending NestJS ValidationPipe.
 *              Configures strict DTO validation with whitelist stripping,
 *              implicit type conversion, and a custom exception factory that
 *              returns detailed, structured validation error messages.
 * @module pipes/validation
 */

import {
  ValidationPipe,
  BadRequestException,
  ValidationError,
} from '@nestjs/common';

/**
 * Custom global validation pipe that enforces strict DTO validation rules.
 *
 * Configuration:
 * - **whitelist**: Strips properties not defined in the DTO
 * - **forbidNonWhitelisted**: Rejects requests with unknown properties
 * - **transform**: Automatically transforms payloads to DTO instances
 * - **transformOptions.enableImplicitConversion**: Enables type coercion
 * - **Custom exceptionFactory**: Returns detailed per-field validation errors
 *
 * @class CustomValidationPipe
 * @extends {ValidationPipe}
 */
export class CustomValidationPipe extends ValidationPipe {
  /**
   * Creates an instance of CustomValidationPipe with strict validation settings
   * and a custom exception factory for structured error output.
   */
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors: ValidationError[]) => {
        const formattedErrors = CustomValidationPipe.formatErrors(errors);

        return new BadRequestException({
          message: 'Validation failed',
          errorCode: 'VALIDATION_ERROR',
          errors: formattedErrors,
        });
      },
    });
  }

  /**
   * Recursively formats class-validator ValidationError objects into a flat,
   * human-readable structure mapping field names to their constraint violations.
   *
   * @static
   * @param {ValidationError[]} errors - Array of class-validator validation errors
   * @param {string} [parentPath=''] - Dot-notation path prefix for nested properties
   * @returns {Record<string, string[]>} Object mapping field paths to arrays of error messages
   *
   * @example
   * // Input: [{ property: 'email', constraints: { isEmail: 'must be an email' } }]
   * // Output: { email: ['must be an email'] }
   */
  static formatErrors(
    errors: ValidationError[],
    parentPath: string = '',
  ): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const error of errors) {
      const propertyPath = parentPath
        ? `${parentPath}.${error.property}`
        : error.property;

      if (error.constraints) {
        result[propertyPath] = Object.values(error.constraints);
      }

      // Recursively handle nested validation errors
      if (error.children && error.children.length > 0) {
        const childErrors = CustomValidationPipe.formatErrors(
          error.children,
          propertyPath,
        );
        Object.assign(result, childErrors);
      }
    }

    return result;
  }
}

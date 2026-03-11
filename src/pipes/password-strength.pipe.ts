/**
 * @file password-strength.pipe.ts
 * @description Custom NestJS pipe that validates password strength against
 *              a set of security rules. Enforces minimum length, character
 *              diversity, and whitespace restrictions to ensure strong passwords.
 * @module pipes/password-strength
 */

import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ErrorMessages } from '../constants/error-messages.constant';

/**
 * Represents a single password validation rule with a test function
 * and a descriptive error message.
 *
 * @interface PasswordRule
 */
interface PasswordRule {
  /** Regular expression or function to test the password against. */
  test: (password: string) => boolean;
  /** Human-readable error message if the rule fails. */
  message: string;
}

/**
 * Custom pipe that validates password strength by checking against
 * multiple security rules. Intended for use on password parameters
 * in registration, password change, and password reset endpoints.
 *
 * Enforced rules:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character (!@#$%^&*)
 * - No whitespace characters
 *
 * @class PasswordStrengthPipe
 * @implements {PipeTransform<string, string>}
 */
@Injectable()
export class PasswordStrengthPipe implements PipeTransform<string, string> {
  /** Array of password validation rules applied in order. */
  private readonly rules: PasswordRule[] = [
    {
      test: (pw: string) => pw.length >= 8,
      message: 'Password must be at least 8 characters long',
    },
    {
      test: (pw: string) => /[A-Z]/.test(pw),
      message: 'Password must contain at least one uppercase letter',
    },
    {
      test: (pw: string) => /[a-z]/.test(pw),
      message: 'Password must contain at least one lowercase letter',
    },
    {
      test: (pw: string) => /[0-9]/.test(pw),
      message: 'Password must contain at least one number',
    },
    {
      test: (pw: string) => /[!@#$%^&*]/.test(pw),
      message:
        'Password must contain at least one special character (!@#$%^&*)',
    },
    {
      test: (pw: string) => !/\s/.test(pw),
      message: 'Password must not contain whitespace characters',
    },
  ];

  /**
   * Validates the incoming password string against all strength rules.
   * Collects all failing rules and throws a single BadRequestException
   * with all violation messages if any rules fail.
   *
   * @param {string} value - The password string to validate
   * @returns {string} The validated password (unchanged) if all rules pass
   * @throws {BadRequestException} If one or more password strength rules fail
   */
  transform(value: string): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException({
        message: ErrorMessages.AUTH_PASSWORD_WEAK,
        errorCode: 'AUTH_PASSWORD_WEAK',
        errors: ['Password is required and must be a string'],
      });
    }

    const violations = this.rules
      .filter((rule) => !rule.test(value))
      .map((rule) => rule.message);

    if (violations.length > 0) {
      throw new BadRequestException({
        message: ErrorMessages.AUTH_PASSWORD_WEAK,
        errorCode: 'AUTH_PASSWORD_WEAK',
        errors: violations,
      });
    }

    return value;
  }
}

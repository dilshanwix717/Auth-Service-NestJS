/**
 * @file audit.decorator.ts
 * @description Custom NestJS decorator that tags controller methods with
 *              an audit event type. Used by audit interceptors to
 *              automatically log authentication events (login, logout,
 *              password change, etc.) without manual logging in each handler.
 * @module decorators/audit
 */

import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by audit interceptors to retrieve the event type
 * from decorated controller methods.
 *
 * @constant {string}
 */
export const AUDIT_EVENT_KEY = 'auditEventType';

/**
 * Marks a controller method for automatic audit logging with the
 * specified event type. The audit interceptor reads this metadata
 * and logs the event with request context (user, IP, timestamp, etc.).
 *
 * @example
 * ```typescript
 * @Audit('USER_LOGIN')
 * @Post('login')
 * async login(@Body() dto: LoginDto) {
 *   return this.authService.login(dto);
 * }
 * ```
 *
 * @param {string} eventType - The audit event type identifier (e.g., 'USER_LOGIN', 'PASSWORD_CHANGE')
 * @returns {CustomDecorator<string>} NestJS metadata decorator
 */
export const Audit = (eventType: string) =>
  SetMetadata(AUDIT_EVENT_KEY, eventType);

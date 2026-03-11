/**
 * @file public-internal.decorator.ts
 * @description Custom NestJS decorator that marks endpoints as publicly
 *              accessible within the internal network, bypassing the
 *              InternalApiKeyGuard. Intended for health checks, readiness
 *              probes, Swagger docs, and similar endpoints.
 * @module decorators/public-internal
 */

import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by the InternalApiKeyGuard to identify endpoints
 * that should bypass API key validation.
 *
 * @constant {string}
 */
export const PUBLIC_INTERNAL_KEY = 'isPublicInternal';

/**
 * Marks a controller or route handler as publicly accessible within
 * the internal service mesh, bypassing the InternalApiKeyGuard.
 *
 * @example
 * ```typescript
 * @PublicInternal()
 * @Get('health')
 * healthCheck() {
 *   return { status: 'ok' };
 * }
 * ```
 *
 * @returns {CustomDecorator<string>} NestJS metadata decorator
 */
export const PublicInternal = () => SetMetadata(PUBLIC_INTERNAL_KEY, true);

/**
 * @file current-credential.decorator.ts
 * @description Custom NestJS parameter decorator that extracts the
 *              authenticated credential (user/service account) from the
 *              request context. The credential is attached by upstream
 *              validation middleware or API Gateway token verification.
 * @module decorators/current-credential
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Parameter decorator that extracts the validated credential from the
 * request object. The credential is expected to be attached at
 * req['user'] or req['credential'] by upstream authentication logic.
 *
 * Optionally accepts a property key to extract a specific field from
 * the credential object (e.g., @CurrentCredential('id') for just the user ID).
 *
 * @example
 * ```typescript
 * @Get('profile')
 * getProfile(@CurrentCredential() credential: CredentialPayload) {
 *   return this.userService.findById(credential.id);
 * }
 *
 * @Get('profile')
 * getProfile(@CurrentCredential('id') userId: string) {
 *   return this.userService.findById(userId);
 * }
 * ```
 *
 * @param {string} [data] - Optional property key to extract from the credential object
 * @param {ExecutionContext} ctx - NestJS execution context
 * @returns {any} The full credential object or a specific property
 */
export const CurrentCredential = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const credential = (request as any)['user'] || (request as any)['credential'];

    if (!credential) {
      return null;
    }

    return data ? credential[data] : credential;
  },
);

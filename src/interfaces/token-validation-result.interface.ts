/**
 * @file token-validation-result.interface.ts
 * @description Result structure returned by the token validation pipeline.
 *
 * When the API Gateway (or any internal caller) asks the Auth Service to validate a
 * JWT, the response follows this shape. On success, `valid` is true and `payload`
 * contains the decoded claims. On failure, `reason` provides a machine-readable
 * explanation so the caller can respond with the appropriate HTTP status and message.
 */

import { JwtPayload } from './jwt-payload.interface';

export interface TokenValidationResult {
  /** Whether the token passed all validation checks. */
  valid: boolean;

  /** Decoded JWT claims — present only when `valid` is true. */
  payload?: JwtPayload;

  /** Machine-readable failure reason — present only when `valid` is false. */
  reason?:
    | 'expired'
    | 'revoked'
    | 'blacklisted'
    | 'invalid_signature'
    | 'invalid'
    | 'account_locked'
    | 'account_banned';
}

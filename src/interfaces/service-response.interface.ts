/**
 * @file service-response.interface.ts
 * @description Generic wrapper for all Auth Service RPC and internal responses.
 *
 * Every response emitted by the Auth Service — whether over RabbitMQ RPC, gRPC, or
 * internal method calls — is wrapped in this envelope. The consistent shape lets
 * consumers check `success`, read `data`, or inspect `errorCode` without special-
 * casing per endpoint. The optional `traceId` enables end-to-end request tracing
 * across the microservice mesh.
 */

export interface ServiceResponse<T = any> {
  /** Whether the operation completed successfully. */
  success: boolean;

  /** Human-readable summary of the result or error. */
  message: string;

  /** Response payload — `null` on failure. */
  data: T | null;

  /** Machine-readable error code from `ErrorCodes` (present on failure). */
  errorCode?: string;

  /** Distributed tracing identifier for cross-service correlation. */
  traceId?: string;
}

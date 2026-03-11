/**
 * @file api-response.dto.ts
 * @description Generic API response wrapper used throughout the Auth Service.
 *
 * Provides a consistent envelope for every HTTP response. The generic type
 * parameter `T` represents the payload type. Static factory methods
 * `ApiResponseDto.success()` and `ApiResponseDto.error()` offer a clean,
 * expressive way to construct responses from controllers and services.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiResponseDto<T = unknown> {
  @ApiProperty({
    description: 'Whether the request was successful',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'Human-readable message describing the result',
    example: 'Operation completed successfully',
  })
  message!: string;

  @ApiProperty({
    description: 'Response payload (null on error)',
    nullable: true,
  })
  data!: T | null;

  @ApiPropertyOptional({
    description: 'Machine-readable error code (present only on errors)',
    example: 'AUTH_INVALID_CREDENTIALS',
  })
  errorCode?: string;

  @ApiPropertyOptional({
    description: 'Distributed tracing ID for debugging (present only on errors)',
    example: 'abc-123-def-456',
  })
  traceId?: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp of the response',
    example: '2025-01-15T12:00:00.000Z',
  })
  timestamp!: string;

  /**
   * Create a successful API response.
   *
   * @param data    - The response payload.
   * @param message - Optional human-readable success message.
   */
  static success<T>(
    data: T,
    message = 'Operation completed successfully',
  ): ApiResponseDto<T> {
    const response = new ApiResponseDto<T>();
    response.success = true;
    response.message = message;
    response.data = data;
    response.timestamp = new Date().toISOString();
    return response;
  }

  /**
   * Create an error API response.
   *
   * @param message   - Human-readable error description.
   * @param errorCode - Machine-readable error code (e.g. `AUTH_INVALID_CREDENTIALS`).
   * @param traceId   - Optional distributed tracing ID for debugging.
   */
  static error(
    message: string,
    errorCode?: string,
    traceId?: string,
  ): ApiResponseDto<null> {
    const response = new ApiResponseDto<null>();
    response.success = false;
    response.message = message;
    response.data = null;
    response.errorCode = errorCode;
    response.traceId = traceId;
    response.timestamp = new Date().toISOString();
    return response;
  }
}

/**
 * @file auth-response.dto.ts
 * @description Response DTO returned after successful authentication operations
 * (login, register, token refresh).
 *
 * This class carries no validation decorators because it is an *outgoing*
 * payload shaped by the service, not incoming user input. Swagger
 * `@ApiProperty` decorators are applied so the auto-generated API docs
 * accurately describe the response schema.
 */

import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    description: 'Short-lived JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Long-lived refresh token used to obtain new access tokens',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;

  @ApiProperty({
    description: 'Access token lifetime in seconds',
    example: 900,
  })
  expiresIn!: number;

  @ApiProperty({
    description: 'Token type (always "Bearer")',
    example: 'Bearer',
    default: 'Bearer',
  })
  tokenType: string = 'Bearer';

  @ApiProperty({
    description: 'Unique identifier of the authenticated user',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  userId!: string;
}

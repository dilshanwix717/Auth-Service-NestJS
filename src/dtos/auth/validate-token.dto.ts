/**
 * @file validate-token.dto.ts
 * @description Validates requests that ask the service to verify an access token.
 *
 * Used by other micro-services (via RPC or HTTP) to confirm whether a bearer
 * token is still valid and extract its claims.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateTokenDto {
  @ApiProperty({
    description: 'The access token (JWT) to validate',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token!: string;
}

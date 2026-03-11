/**
 * @file refresh-token.dto.ts
 * @description Validates token-refresh requests.
 *
 * The client sends its current refresh token so the service can verify it,
 * rotate it, and return a fresh access / refresh token pair.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token issued at login or last refresh',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken!: string;
}

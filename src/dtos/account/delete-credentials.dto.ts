/**
 * @file delete-credentials.dto.ts
 * @description Validates requests to delete a user's authentication credentials.
 *
 * Used during account deletion or GDPR-style data-erasure workflows. Only the
 * user's UUID is required; authorisation checks happen at the guard / service
 * layer.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class DeleteCredentialsDto {
  @ApiProperty({
    description: 'UUID of the user whose credentials should be deleted',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;
}

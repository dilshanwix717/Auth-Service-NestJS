/**
 * @file ban-user.dto.ts
 * @description Validates requests to permanently ban a user account.
 *
 * Requires the target user's UUID and a reason so the action is auditable.
 * Unlike a temporary lock, a ban is intended to be permanent and typically
 * revokes all existing tokens as well.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class BanUserDto {
  @ApiProperty({
    description: 'UUID of the user to ban',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @ApiProperty({
    description: 'Reason for banning the user (audit trail)',
    example: 'Terms of service violation',
  })
  @IsString()
  @IsNotEmpty({ message: 'A reason for banning is required' })
  reason!: string;
}

/**
 * @file lock-account.dto.ts
 * @description Validates requests to lock a user account.
 *
 * An administrator must supply the target user's UUID and a reason for the
 * lock. An optional `durationMinutes` field allows time-limited locks; when
 * omitted the account stays locked until an admin explicitly unlocks it.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class LockAccountDto {
  @ApiProperty({
    description: 'UUID of the user whose account should be locked',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @ApiProperty({
    description: 'Reason for locking the account (audit trail)',
    example: 'Multiple failed login attempts',
  })
  @IsString()
  @IsNotEmpty({ message: 'A reason for locking the account is required' })
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Lock duration in minutes. Omit or set to null for a permanent lock until an admin unlocks.',
    example: 60,
  })
  @IsOptional()
  @IsInt({ message: 'durationMinutes must be an integer' })
  @Min(1, { message: 'durationMinutes must be at least 1' })
  durationMinutes?: number;
}

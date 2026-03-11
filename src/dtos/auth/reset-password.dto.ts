/**
 * @file reset-password.dto.ts
 * @description Validates password-reset requests.
 *
 * The user supplies the raw reset token (received via email), a new password
 * that satisfies complexity requirements identical to those enforced at
 * registration, and a confirmation of that new password.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

import { Match } from '../../decorators/match.decorator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'The raw password-reset token received via email',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token!: string;

  @ApiProperty({
    description:
      'New password (min 8 chars, must include uppercase, lowercase, number, and special character)',
    example: 'N3wP@ssw0rd!',
  })
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/(?=.*[a-z])/, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(/(?=.*[A-Z])/, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(/(?=.*\d)/, {
    message: 'Password must contain at least one number',
  })
  @Matches(/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, {
    message: 'Password must contain at least one special character',
  })
  newPassword!: string;

  @ApiProperty({
    description: 'Must match the newPassword field exactly',
    example: 'N3wP@ssw0rd!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password confirmation is required' })
  @Match('newPassword', {
    message: 'confirmNewPassword must match newPassword',
  })
  confirmNewPassword!: string;
}

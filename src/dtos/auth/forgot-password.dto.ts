/**
 * @file forgot-password.dto.ts
 * @description Validates forgot-password requests.
 *
 * Accepts a normalised email so the service can look up the account and,
 * if it exists, send a password-reset link. The email is trimmed and
 * lowercased to prevent case-sensitivity issues.
 */

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'The email address associated with the account',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email!: string;
}

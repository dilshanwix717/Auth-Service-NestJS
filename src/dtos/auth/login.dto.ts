/**
 * @file login.dto.ts
 * @description Validates incoming login (authentication) requests.
 *
 * Requires a normalised email and a non-empty password. An optional
 * `deviceInfo` string may be supplied so the service can track active
 * sessions per device and allow users to revoke individual sessions.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email!: string;

  @ApiProperty({
    description: 'Account password',
    example: 'P@ssw0rd!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;

  @ApiPropertyOptional({
    description: 'Identifier for the device / client initiating the session',
    example: 'Mozilla/5.0 — iPhone 15 Pro',
  })
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}

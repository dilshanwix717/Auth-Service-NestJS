/**
 * @file register.dto.ts
 * @description Validates incoming registration requests.
 *
 * Ensures the caller supplies a valid, normalised email address and a password
 * that meets minimum complexity requirements (≥ 8 characters, at least one
 * uppercase letter, one lowercase letter, one digit, and one special character).
 * The `confirmPassword` field must match `password` exactly, preventing typos
 * during sign-up.
 */

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

import { Match } from '../../decorators/match.decorator';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email!: string;

  @ApiProperty({
    description:
      'Password (min 8 chars, must include uppercase, lowercase, number, and special character)',
    example: 'P@ssw0rd!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
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
  password!: string;

  @ApiProperty({
    description: 'Must match the password field exactly',
    example: 'P@ssw0rd!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password confirmation is required' })
  @Match('password', { message: 'confirmPassword must match password' })
  confirmPassword!: string;
}

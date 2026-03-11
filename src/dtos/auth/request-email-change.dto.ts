/**
 * @file request-email-change.dto.ts
 * @description Validates requests to initiate an email-address change.
 *
 * The user must supply a new, valid email and their current password so the
 * service can verify their identity before sending a confirmation link to the
 * new address. The email is trimmed and lowercased for consistency.
 */

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RequestEmailChangeDto {
  @ApiProperty({
    description: 'The new email address the user wants to switch to',
    example: 'newemail@example.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'New email is required' })
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  newEmail!: string;

  @ApiProperty({
    description: 'Current account password to verify identity',
    example: 'P@ssw0rd!',
  })
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword!: string;
}

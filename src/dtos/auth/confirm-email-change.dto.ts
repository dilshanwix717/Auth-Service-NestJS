/**
 * @file confirm-email-change.dto.ts
 * @description Validates email-change confirmation requests.
 *
 * After a user requests an email change, a confirmation token is sent to the
 * new address. This DTO ensures that the token is present and is a non-empty
 * string before the service attempts to apply the change.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmEmailChangeDto {
  @ApiProperty({
    description: 'The confirmation token received at the new email address',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Confirmation token is required' })
  token!: string;
}

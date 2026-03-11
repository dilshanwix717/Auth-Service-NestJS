/**
 * @file revoke-token.dto.ts
 * @description Validates token-revocation requests.
 *
 * Allows an administrator to revoke a specific access token by its JTI
 * (JWT ID) or revoke every token belonging to a given user. At least one
 * of `tokenJti` or `userId` must be supplied; an optional `reason` can be
 * recorded for audit purposes.
 *
 * The "at least one required" constraint is enforced via the custom
 * `@ValidateIf` logic and a class-level validator.
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class RevokeTokenDto {
  @ApiPropertyOptional({
    description: 'JTI (JWT ID) of the specific access token to revoke',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ValidateIf((o: RevokeTokenDto) => !o.userId)
  @IsString({ message: 'tokenJti must be a string' })
  @IsOptional()
  tokenJti?: string;

  @ApiPropertyOptional({
    description: 'User ID — revokes all tokens belonging to this user',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ValidateIf((o: RevokeTokenDto) => !o.tokenJti)
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Reason for revoking the token(s) (audit trail)',
    example: 'Suspicious activity detected',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

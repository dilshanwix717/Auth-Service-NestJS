/**
 * @file revoke-role.dto.ts
 * @description Validates requests to revoke (remove) a role from a user account.
 *
 * Mirrors the structure of `AssignRoleDto` — a valid user UUID and a role from
 * the `Roles` enum are required so the service knows exactly which role to
 * remove from which user.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';

import { Roles } from '../../constants/roles.constant';

export class RevokeRoleDto {
  @ApiProperty({
    description: 'UUID of the user to revoke the role from',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @ApiProperty({
    description: 'The role to revoke',
    enum: Roles,
    example: Roles.MODERATOR,
  })
  @IsEnum(Roles, {
    message: `Role must be one of: ${Object.values(Roles).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Role is required' })
  role!: Roles;
}

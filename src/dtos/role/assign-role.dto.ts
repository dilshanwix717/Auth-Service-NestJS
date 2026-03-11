/**
 * @file assign-role.dto.ts
 * @description Validates requests to assign a role to a user account.
 *
 * Ensures a valid UUID identifies the target user and that the requested role
 * is one of the allowed values defined in the `Roles` enum (USER, ADMIN,
 * MODERATOR). This prevents assignment of arbitrary or unknown roles.
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';

import { Roles } from '../../constants/roles.constant';

export class AssignRoleDto {
  @ApiProperty({
    description: 'UUID of the user to assign the role to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId!: string;

  @ApiProperty({
    description: 'The role to assign',
    enum: Roles,
    example: Roles.ADMIN,
  })
  @IsEnum(Roles, {
    message: `Role must be one of: ${Object.values(Roles).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Role is required' })
  role!: Roles;
}

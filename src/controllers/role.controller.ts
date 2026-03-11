/**
 * @file role.controller.ts
 * @description Role management controller — handles role assignment, revocation,
 *   and querying of user roles. All endpoints are admin-only; the acting admin's
 *   user ID is extracted from the X-User-Id header set by the API Gateway.
 * @module controllers/role
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { Request } from 'express';

import { RoleService } from '../services/role.service';

import { AssignRoleDto } from '../dtos/role/assign-role.dto';
import { RevokeRoleDto } from '../dtos/role/revoke-role.dto';
import { ApiResponseDto } from '../dtos/common/api-response.dto';
import { Role } from '../entities/role.entity';

import { Audit } from '../decorators/audit.decorator';

@ApiTags('Role Management')
@Controller('v1/roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /**
   * Assign a role to a user. Admin-only operation.
   * @param assignRoleDto - Contains userId and role to assign
   * @param req - Express request to extract admin user ID from X-User-Id header
   * @returns Success confirmation message
   */
  @Post('assign')
  @HttpCode(HttpStatus.OK)
  @Audit('ROLE_ASSIGNED')
  @ApiOperation({ summary: 'Assign a role to a user (admin only)' })
  @ApiHeader({ name: 'X-User-Id', required: true, description: 'Admin user ID set by API Gateway' })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User or role not found' })
  async assignRole(
    @Body() assignRoleDto: AssignRoleDto,
    @Req() req: Request,
  ): Promise<ApiResponseDto> {
    const adminUserId = req.headers['x-user-id'] as string;

    await this.roleService.assignRole(assignRoleDto.userId, assignRoleDto.role, adminUserId);

    return ApiResponseDto.success(null, 'Role assigned successfully');
  }

  /**
   * Revoke a role from a user. Admin-only operation.
   * @param revokeRoleDto - Contains userId and role to revoke
   * @param req - Express request to extract admin user ID from X-User-Id header
   * @returns Success confirmation message
   */
  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @Audit('ROLE_REVOKED')
  @ApiOperation({ summary: 'Revoke a role from a user (admin only)' })
  @ApiHeader({ name: 'X-User-Id', required: true, description: 'Admin user ID set by API Gateway' })
  @ApiResponse({ status: 200, description: 'Role revoked successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User or role not found' })
  async revokeRole(
    @Body() revokeRoleDto: RevokeRoleDto,
    @Req() req: Request,
  ): Promise<ApiResponseDto> {
    const adminUserId = req.headers['x-user-id'] as string;

    await this.roleService.revokeRole(revokeRoleDto.userId, revokeRoleDto.role, adminUserId);

    return ApiResponseDto.success(null, 'Role revoked successfully');
  }

  /**
   * Get all roles assigned to a specific user.
   * @param userId - The unique identifier of the user
   * @returns Array of role names assigned to the user
   */
  @Get(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all roles for a specific user' })
  @ApiParam({ name: 'userId', required: true, description: 'The user ID to retrieve roles for' })
  @ApiResponse({ status: 200, description: 'List of user roles returned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserRoles(
    @Param('userId') userId: string,
  ): Promise<string[]> {
    return this.roleService.getUserRoles(userId);
  }

  /**
   * Get all available roles in the system.
   * @returns Array of all defined roles
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all available roles in the system' })
  @ApiResponse({ status: 200, description: 'List of all available roles returned' })
  async getAllRoles(): Promise<Role[]> {
    return this.roleService.getAllRoles();
  }
}

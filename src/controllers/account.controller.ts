/**
 * @file account.controller.ts
 * @description Account management controller — handles account locking, unlocking,
 *   banning, and credential deletion. Admin-only operations except for the
 *   idempotent credential deletion endpoint used by compensating transactions.
 *   The acting admin's user ID is extracted from the X-User-Id header set by
 *   the API Gateway.
 * @module controllers/account
 */

import {
  Controller,
  Post,
  Delete,
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

import { AccountService } from '../services/account.service';

import { LockAccountDto } from '../dtos/account/lock-account.dto';
import { BanUserDto } from '../dtos/account/ban-user.dto';
import { DeleteCredentialsDto } from '../dtos/account/delete-credentials.dto';
import { ApiResponseDto } from '../dtos/common/api-response.dto';

import { Audit } from '../decorators/audit.decorator';

@ApiTags('Account Management')
@Controller('v1/accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  /**
   * Lock a user account. Admin-only operation.
   * Prevents the user from authenticating until unlocked.
   * @param lockAccountDto - Contains userId, reason, and optional duration
   * @param req - Express request to extract admin user ID from X-User-Id header
   * @returns Success confirmation message
   */
  @Post('lock')
  @HttpCode(HttpStatus.OK)
  @Audit('ACCOUNT_LOCKED')
  @ApiOperation({ summary: 'Lock a user account (admin only)' })
  @ApiHeader({ name: 'X-User-Id', required: true, description: 'Admin user ID set by API Gateway' })
  @ApiResponse({ status: 200, description: 'Account locked successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async lockAccount(
    @Body() lockAccountDto: LockAccountDto,
    @Req() req: Request,
  ): Promise<ApiResponseDto> {
    const adminUserId = req.headers['x-user-id'] as string;

    await this.accountService.lockAccount(
      lockAccountDto.userId,
      lockAccountDto.reason,
      lockAccountDto.durationMinutes,
      adminUserId,
    );

    return ApiResponseDto.success(null, 'Account locked successfully');
  }

  /**
   * Unlock a previously locked user account. Admin-only operation.
   * @param body - Contains the userId of the account to unlock
   * @param req - Express request to extract admin user ID from X-User-Id header
   * @returns Success confirmation message
   */
  @Post('unlock')
  @HttpCode(HttpStatus.OK)
  @Audit('ACCOUNT_UNLOCKED')
  @ApiOperation({ summary: 'Unlock a user account (admin only)' })
  @ApiHeader({ name: 'X-User-Id', required: true, description: 'Admin user ID set by API Gateway' })
  @ApiResponse({ status: 200, description: 'Account unlocked successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unlockAccount(
    @Body() body: { userId: string },
    @Req() req: Request,
  ): Promise<ApiResponseDto> {
    const adminUserId = req.headers['x-user-id'] as string;

    await this.accountService.unlockAccount(body.userId, adminUserId);

    return ApiResponseDto.success(null, 'Account unlocked successfully');
  }

  /**
   * Ban a user account permanently. Admin-only operation.
   * Revokes all tokens and prevents future authentication.
   * @param banUserDto - Contains userId and reason for the ban
   * @param req - Express request to extract admin user ID from X-User-Id header
   * @returns Success confirmation message
   */
  @Post('ban')
  @HttpCode(HttpStatus.OK)
  @Audit('USER_BANNED')
  @ApiOperation({ summary: 'Ban a user account (admin only)' })
  @ApiHeader({ name: 'X-User-Id', required: true, description: 'Admin user ID set by API Gateway' })
  @ApiResponse({ status: 200, description: 'User banned successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async banUser(
    @Body() banUserDto: BanUserDto,
    @Req() req: Request,
  ): Promise<ApiResponseDto> {
    const adminUserId = req.headers['x-user-id'] as string;

    await this.accountService.banUser(banUserDto.userId, banUserDto.reason, adminUserId);

    return ApiResponseDto.success(null, 'User banned successfully');
  }

  /**
   * Delete all authentication credentials for a user.
   * Used as a compensating transaction endpoint (e.g. when user-service
   * registration fails after auth credentials were already created).
   * This endpoint is idempotent — repeated calls with the same userId
   * will succeed without error even if credentials were already deleted.
   * @param userId - The unique identifier of the user whose credentials to delete
   * @returns Success confirmation message
   */
  @Delete(':userId/credentials')
  @HttpCode(HttpStatus.OK)
  @Audit('CREDENTIALS_DELETED')
  @ApiOperation({ summary: 'Delete user credentials (compensating transaction, idempotent)' })
  @ApiParam({ name: 'userId', required: true, description: 'The user ID whose credentials to delete' })
  @ApiResponse({ status: 200, description: 'Credentials deleted successfully (or already absent)' })
  @ApiResponse({ status: 400, description: 'Invalid userId format' })
  async deleteCredentials(
    @Param('userId') userId: string,
  ): Promise<ApiResponseDto> {
    await this.accountService.deleteCredentials(userId);

    return ApiResponseDto.success(null, 'Credentials deleted successfully');
  }
}

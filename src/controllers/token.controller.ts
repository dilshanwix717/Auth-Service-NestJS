/**
 * @file token.controller.ts
 * @description Token management controller — handles token introspection and
 *   session management (listing active sessions, revoking individual sessions).
 *   Delegates all logic to TokenService and SessionService.
 * @module controllers/token
 */

import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

import { TokenService } from '../services/token.service';
import { SessionService } from '../services/session.service';

import { TokenIntrospectResponseDto } from '../dtos/token/token-introspect-response.dto';
import { ApiResponseDto } from '../dtos/common/api-response.dto';

import { Audit } from '../decorators/audit.decorator';

@ApiTags('Token Management')
@Controller('v1/tokens')
export class TokenController {
  constructor(
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Introspect a token to retrieve its metadata and validity status.
   * @param token - The token string to introspect (passed as query parameter)
   * @returns Token metadata including active status, scopes, and expiry
   */
  @Get('introspect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Introspect a token to check validity and metadata' })
  @ApiQuery({ name: 'token', required: true, type: String, description: 'The token to introspect' })
  @ApiResponse({ status: 200, description: 'Token introspection result', type: TokenIntrospectResponseDto })
  @ApiResponse({ status: 400, description: 'Missing or malformed token' })
  async introspect(
    @Query('token') token: string,
  ): Promise<TokenIntrospectResponseDto> {
    const result = await this.tokenService.validateAccessToken(token);

    if (result.valid && result.payload) {
      const dto = new TokenIntrospectResponseDto();
      dto.active = true;
      dto.sub = result.payload.sub;
      dto.email = result.payload.email;
      dto.roles = result.payload.roles;
      dto.exp = result.payload.exp!;
      dto.iat = result.payload.iat!;
      dto.jti = result.payload.jti!;
      dto.tokenType = result.payload.tokenType;
      return dto;
    }

    const inactiveDto = new TokenIntrospectResponseDto();
    inactiveDto.active = false;
    return inactiveDto;
  }

  /**
   * Retrieve all active sessions for a given user.
   * @param userId - The unique identifier of the user
   * @returns Array of active session information
   */
  @Get('sessions/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all active sessions for a user' })
  @ApiParam({ name: 'userId', required: true, description: 'The user ID to look up sessions for' })
  @ApiResponse({ status: 200, description: 'List of active sessions returned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getActiveSessions(
    @Param('userId') userId: string,
  ): Promise<any[]> {
    return this.sessionService.getActiveSessions(userId);
  }

  /**
   * Revoke a specific session by its session ID.
   * @param sessionId - The unique identifier of the session to revoke
   * @returns Success confirmation message
   */
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @Audit('SESSION_REVOKED')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiParam({ name: 'sessionId', required: true, description: 'The session ID to revoke' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(
    @Param('sessionId') sessionId: string,
  ): Promise<ApiResponseDto> {
    await this.sessionService.revokeSession(sessionId, 'user_revoked');

    return ApiResponseDto.success(null, 'Session revoked successfully');
  }
}

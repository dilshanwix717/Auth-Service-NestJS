/**
 * @file auth.controller.ts
 * @description Authentication controller — handles registration, login, logout,
 *   token validation/refresh/revocation, password reset, and email change flows.
 *   All business logic is delegated to AuthService and TokenService.
 * @module controllers/auth
 */

import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AuthService } from '../services/auth.service';
import { TokenService } from '../services/token.service';
import { CredentialService } from '../services/credential.service';

import { RegisterDto } from '../dtos/auth/register.dto';
import { LoginDto } from '../dtos/auth/login.dto';
import { LogoutDto } from '../dtos/auth/logout.dto';
import { RefreshTokenDto } from '../dtos/auth/refresh-token.dto';
import { ValidateTokenDto } from '../dtos/auth/validate-token.dto';
import { RevokeTokenDto } from '../dtos/auth/revoke-token.dto';
import { AuthResponseDto } from '../dtos/auth/auth-response.dto';
import { ForgotPasswordDto } from '../dtos/auth/forgot-password.dto';
import { ResetPasswordDto } from '../dtos/auth/reset-password.dto';
import { ApiResponseDto } from '../dtos/common/api-response.dto';

import { Audit } from '../decorators/audit.decorator';

@ApiTags('Authentication')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly credentialService: CredentialService,
  ) {}

  /**
   * Register a new user account.
   * @param registerDto - Registration payload (email, password, etc.)
   * @param req - Express request for IP, User-Agent, and traceId extraction
   * @returns AuthResponseDto containing tokens and user info
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Audit('USER_REGISTERED')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error or duplicate email' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    const traceId = (req as any)['traceId'];

    const result = await this.authService.register(
      registerDto.email,
      registerDto.password,
      ip,
      userAgent,
      traceId,
    );
    return result as unknown as AuthResponseDto;
  }

  /**
   * Authenticate a user and return access/refresh tokens.
   * @param loginDto - Login credentials (email, password)
   * @param req - Express request for IP, User-Agent, and traceId extraction
   * @returns AuthResponseDto containing tokens and user info
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Audit('USER_LOGIN')
  @ApiOperation({ summary: 'Authenticate user and issue tokens' })
  @ApiResponse({ status: 200, description: 'Login successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 423, description: 'Account locked or banned' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    const traceId = (req as any)['traceId'];

    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
      undefined,
      ip,
      userAgent,
      traceId,
    );
    return result as unknown as AuthResponseDto;
  }

  /**
   * Log out a user by invalidating their tokens.
   * @param logoutDto - Logout payload (e.g. refresh token to revoke)
   * @param req - Express request to extract the Bearer access token
   * @returns Success confirmation message
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Audit('USER_LOGOUT')
  @ApiOperation({ summary: 'Log out user and revoke tokens' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Invalid or missing token' })
  async logout(
    @Body() logoutDto: LogoutDto,
    @Req() req: Request,
  ): Promise<ApiResponseDto> {
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader?.replace('Bearer ', '') ?? '';

    await this.authService.logout(accessToken, logoutDto.refreshToken);

    return ApiResponseDto.success(null, 'Logout successful');
  }

  /**
   * Validate an access or refresh token.
   * @param validateTokenDto - Token to validate
   * @returns Token validation result with metadata
   */
  @Post('validate-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate an access or refresh token' })
  @ApiResponse({ status: 200, description: 'Token validation result returned' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async validateToken(
    @Body() validateTokenDto: ValidateTokenDto,
  ): Promise<any> {
    return this.authService.validateToken(validateTokenDto.token);
  }

  /**
   * Refresh an expired access token using a valid refresh token.
   * @param refreshTokenDto - Contains the refresh token
   * @returns New access token, refresh token, expiry, and token type
   */
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @Audit('TOKEN_REFRESHED')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; tokenType: string }> {
    const result = await this.tokenService.refreshTokens(refreshTokenDto.refreshToken);

    // TokenService returns an empty accessToken by design — generate it here
    // by looking up the user's current credentials (email, roles).
    const credential = await this.credentialService.findById(result.userId);
    if (!credential) {
      throw new Error('User credential not found during token refresh');
    }

    const accessToken = this.tokenService.generateAccessToken(
      credential.id,
      credential.email,
      credential.roles,
    );

    return {
      accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * Revoke a specific token (access or refresh).
   * @param revokeTokenDto - Token to revoke and optional reason
   * @returns Success confirmation message
   */
  @Post('revoke-token')
  @HttpCode(HttpStatus.OK)
  @Audit('TOKEN_REVOKED')
  @ApiOperation({ summary: 'Revoke a specific token' })
  @ApiResponse({ status: 200, description: 'Token revoked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token' })
  async revokeToken(
    @Body() revokeTokenDto: RevokeTokenDto,
  ): Promise<ApiResponseDto> {
    if (revokeTokenDto.userId) {
      await this.tokenService.revokeAllUserTokens(
        revokeTokenDto.userId,
        revokeTokenDto.reason ?? 'token_revoked',
      );
    }

    return ApiResponseDto.success(null, 'Token revoked successfully');
  }

  /**
   * Revoke all tokens for a given user.
   * @param body - userId and optional reason for bulk revocation
   * @returns Success confirmation message
   */
  @Post('revoke-all-tokens')
  @HttpCode(HttpStatus.OK)
  @Audit('ALL_TOKENS_REVOKED')
  @ApiOperation({ summary: 'Revoke all tokens for a user' })
  @ApiResponse({ status: 200, description: 'All tokens revoked successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async revokeAllTokens(
    @Body() body: { userId: string; reason?: string },
  ): Promise<ApiResponseDto> {
    await this.tokenService.revokeAllUserTokens(body.userId, body.reason ?? 'all_tokens_revoked');

    return ApiResponseDto.success(null, 'All tokens revoked successfully');
  }

  /**
   * Initiate the forgot-password flow. Sends a reset link if the email exists.
   * Always returns a generic success message to prevent email enumeration.
   * @param forgotPasswordDto - Contains the user's email address
   * @returns Generic success message
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Audit('PASSWORD_RESET_REQUESTED')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'If the email exists, a reset link has been sent' })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<ApiResponseDto> {
    await this.authService.forgotPassword(forgotPasswordDto.email);

    return ApiResponseDto.success(
      null,
      'If an account with that email exists, a password reset link has been sent',
    );
  }

  /**
   * Reset the user's password using a valid reset token.
   * @param resetPasswordDto - Reset token and new password
   * @returns Success confirmation message
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Audit('PASSWORD_RESET_COMPLETED')
  @ApiOperation({ summary: 'Reset password using a reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token' })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<ApiResponseDto> {
    await this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.newPassword);

    return ApiResponseDto.success(null, 'Password reset successfully');
  }

}

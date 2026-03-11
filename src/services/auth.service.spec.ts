/**
 * @file auth.service.spec.ts
 * @description Unit tests for AuthService — the core authentication orchestrator.
 *   Tests registration, login (success/failure/lockout), logout, token validation,
 *   forgot password, and reset password flows.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { CredentialService } from './credential.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { EventService } from './event.service';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { PasswordResetTokenRepository } from '../repositories/password-reset-token.repository';
import { UserStatus } from '../entities/user-credential.entity';
import { ErrorMessages } from '../constants/error-messages.constant';
import * as hashUtil from '../utils/hash.util';

jest.mock('../utils/hash.util');
jest.mock('../utils/token.util', () => ({
  extractJti: jest.fn().mockReturnValue('jti-uuid-1'),
  decodeToken: jest.fn().mockReturnValue({ sub: 'user-uuid-1' }),
}));
jest.mock('../utils/device-fingerprint.util', () => ({
  generateDeviceFingerprint: jest.fn().mockReturnValue('mock-fingerprint'),
}));
jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../utils/trace-id.util', () => ({
  generateTraceId: jest.fn().mockReturnValue('mock-trace-id'),
}));

describe('AuthService', () => {
  let service: AuthService;
  let credentialService: jest.Mocked<CredentialService>;
  let tokenService: jest.Mocked<TokenService>;
  let sessionService: jest.Mocked<SessionService>;
  let eventService: jest.Mocked<EventService>;
  let userCredentialRepository: jest.Mocked<UserCredentialRepository>;
  let auditLogRepository: jest.Mocked<AuditLogRepository>;
  let passwordResetTokenRepository: jest.Mocked<PasswordResetTokenRepository>;
  let configService: jest.Mocked<ConfigService>;

  const mockCredential = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$hash',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    passwordChangedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: CredentialService,
          useValue: {
            findByEmail: jest.fn(),
            createCredential: jest.fn(),
            verifyPassword: jest.fn(),
            updatePassword: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
            generateRefreshToken: jest.fn().mockResolvedValue({
              rawToken: 'mock-refresh-token',
              refreshTokenEntity: { id: 'rt-uuid-1' },
            }),
            getAccessTokenExpirySeconds: jest.fn().mockReturnValue(900),
            validateAccessToken: jest.fn(),
            revokeAccessToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
            revokeAllUserTokens: jest.fn(),
            refreshTokenRepository: {
              findByTokenHash: jest.fn(),
            },
          },
        },
        {
          provide: SessionService,
          useValue: {
            enforceMaxSessions: jest.fn(),
          },
        },
        {
          provide: EventService,
          useValue: {
            publishUserCreated: jest.fn(),
            publishUserLoggedIn: jest.fn(),
            publishUserLoggedOut: jest.fn(),
            publishLoginFailed: jest.fn(),
            publishAccountLocked: jest.fn(),
            publishPasswordResetRequested: jest.fn(),
            publishPasswordResetCompleted: jest.fn(),
          },
        },
        {
          provide: UserCredentialRepository,
          useValue: {
            findById: jest.fn(),
            incrementFailedAttempts: jest.fn(),
            resetFailedAttempts: jest.fn(),
            updateLastLogin: jest.fn(),
            lockAccount: jest.fn(),
            unlockAccount: jest.fn(),
          },
        },
        {
          provide: AuditLogRepository,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: PasswordResetTokenRepository,
          useValue: {
            create: jest.fn(),
            findByTokenHash: jest.fn(),
            markAsUsed: jest.fn(),
            deleteByUserId: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    credentialService = module.get(CredentialService);
    tokenService = module.get(TokenService);
    sessionService = module.get(SessionService);
    eventService = module.get(EventService);
    userCredentialRepository = module.get(UserCredentialRepository);
    auditLogRepository = module.get(AuditLogRepository);
    passwordResetTokenRepository = module.get(PasswordResetTokenRepository);
    configService = module.get(ConfigService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create credential, generate tokens, enforce sessions, and publish event', async () => {
      credentialService.findByEmail.mockResolvedValue(null);
      credentialService.createCredential.mockResolvedValue(mockCredential as any);

      const result = await service.register(
        'test@example.com',
        'Password123!',
        '127.0.0.1',
        'Chrome/120',
      );

      expect(credentialService.createCredential).toHaveBeenCalledWith(
        'test@example.com',
        'Password123!',
      );
      expect(tokenService.generateAccessToken).toHaveBeenCalledWith(
        'user-uuid-1',
        'test@example.com',
        ['USER'],
      );
      expect(tokenService.generateRefreshToken).toHaveBeenCalled();
      expect(sessionService.enforceMaxSessions).toHaveBeenCalledWith('user-uuid-1');
      expect(eventService.publishUserCreated).toHaveBeenCalled();
      expect(auditLogRepository.create).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
        tokenType: 'Bearer',
        userId: 'user-uuid-1',
      });
    });

    it('should throw when email already exists', async () => {
      credentialService.findByEmail.mockResolvedValue(mockCredential as any);

      await expect(
        service.register('test@example.com', 'Password123!'),
      ).rejects.toThrow(ErrorMessages.AUTH_EMAIL_EXISTS);
    });
  });

  describe('login', () => {
    it('should authenticate, generate tokens, and publish event on success', async () => {
      credentialService.findByEmail.mockResolvedValue(mockCredential as any);
      credentialService.verifyPassword.mockResolvedValue(true);

      const result = await service.login(
        'test@example.com',
        'Password123!',
        undefined,
        '127.0.0.1',
        'Chrome/120',
      );

      expect(userCredentialRepository.resetFailedAttempts).toHaveBeenCalledWith('user-uuid-1');
      expect(userCredentialRepository.updateLastLogin).toHaveBeenCalledWith(
        'user-uuid-1',
        '127.0.0.1',
      );
      expect(sessionService.enforceMaxSessions).toHaveBeenCalledWith('user-uuid-1');
      expect(eventService.publishUserLoggedIn).toHaveBeenCalled();
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.tokenType).toBe('Bearer');
    });

    it('should throw AUTH_INVALID_CREDENTIALS when email not found', async () => {
      credentialService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login('unknown@example.com', 'password'),
      ).rejects.toThrow(ErrorMessages.AUTH_INVALID_CREDENTIALS);
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'LOGIN',
          outcome: 'FAILURE',
          metadata: { reason: 'email_not_found' },
        }),
      );
    });

    it('should increment failed attempts and throw on wrong password', async () => {
      credentialService.findByEmail.mockResolvedValue(mockCredential as any);
      credentialService.verifyPassword.mockResolvedValue(false);
      userCredentialRepository.incrementFailedAttempts.mockResolvedValue(1);
      configService.get.mockReturnValue(5);

      await expect(
        service.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow(ErrorMessages.AUTH_INVALID_CREDENTIALS);

      expect(userCredentialRepository.incrementFailedAttempts).toHaveBeenCalledWith('user-uuid-1');
      expect(eventService.publishLoginFailed).toHaveBeenCalled();
    });

    it('should lock account after max failed attempts and revoke all tokens', async () => {
      credentialService.findByEmail.mockResolvedValue(mockCredential as any);
      credentialService.verifyPassword.mockResolvedValue(false);
      userCredentialRepository.incrementFailedAttempts.mockResolvedValue(5);
      configService.get.mockImplementation((key: string) => {
        if (key === 'auth.maxLoginAttempts') return 5;
        if (key === 'auth.lockoutDurationMinutes') return 30;
        return undefined;
      });

      await expect(
        service.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow(ErrorMessages.AUTH_INVALID_CREDENTIALS);

      expect(userCredentialRepository.lockAccount).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.any(Date),
      );
      expect(eventService.publishAccountLocked).toHaveBeenCalled();
      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith(
        'user-uuid-1',
        'account_locked:brute_force',
      );
    });

    it('should throw AUTH_ACCOUNT_LOCKED when account is locked', async () => {
      const lockedCredential = {
        ...mockCredential,
        status: UserStatus.LOCKED,
        lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
      };
      credentialService.findByEmail.mockResolvedValue(lockedCredential as any);

      await expect(
        service.login('test@example.com', 'password'),
      ).rejects.toThrow(ErrorMessages.AUTH_ACCOUNT_LOCKED);
    });

    it('should auto-unlock expired locks and proceed with login', async () => {
      const expiredLockCredential = {
        ...mockCredential,
        status: UserStatus.LOCKED,
        lockedUntil: new Date(Date.now() - 1000),
      };
      credentialService.findByEmail.mockResolvedValue(expiredLockCredential as any);
      credentialService.verifyPassword.mockResolvedValue(true);

      const result = await service.login('test@example.com', 'password');

      expect(userCredentialRepository.unlockAccount).toHaveBeenCalledWith('user-uuid-1');
      expect(result.accessToken).toBeDefined();
    });

    it('should throw AUTH_ACCOUNT_BANNED when account is banned', async () => {
      const bannedCredential = { ...mockCredential, status: UserStatus.BANNED };
      credentialService.findByEmail.mockResolvedValue(bannedCredential as any);

      await expect(
        service.login('test@example.com', 'password'),
      ).rejects.toThrow(ErrorMessages.AUTH_ACCOUNT_BANNED);
    });

    it('should throw AUTH_INVALID_CREDENTIALS when account is deleted', async () => {
      const deletedCredential = { ...mockCredential, status: UserStatus.DELETED };
      credentialService.findByEmail.mockResolvedValue(deletedCredential as any);

      await expect(
        service.login('test@example.com', 'password'),
      ).rejects.toThrow(ErrorMessages.AUTH_INVALID_CREDENTIALS);
    });
  });

  describe('logout', () => {
    it('should blacklist access token and revoke refresh token', async () => {
      (tokenService as any).refreshTokenRepository.findByTokenHash.mockResolvedValue({
        id: 'rt-uuid-1',
        userId: 'user-uuid-1',
      });
      (hashUtil.hashToken as jest.Mock).mockReturnValue('hashed-refresh');

      await service.logout(
        'mock-access-token',
        'mock-refresh-token',
        '127.0.0.1',
        'Chrome/120',
      );

      expect(tokenService.revokeAccessToken).toHaveBeenCalledWith('mock-access-token');
      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith('rt-uuid-1', 'logout');
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'LOGOUT',
          outcome: 'SUCCESS',
        }),
      );
    });
  });

  describe('validateToken', () => {
    it('should delegate to token service and check account status', async () => {
      const mockPayload = {
        sub: 'user-uuid-1',
        email: 'test@example.com',
        roles: ['USER'],
        jti: 'jti-1',
        iat: 0,
        exp: 0,
        iss: 'auth-service',
        aud: 'api-gateway',
        tokenType: 'ACCESS',
      };
      tokenService.validateAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
      });
      userCredentialRepository.findById.mockResolvedValue(mockCredential as any);

      const result = await service.validateToken('some-token');

      expect(result.valid).toBe(true);
      expect(result.payload).toEqual(mockPayload);
    });

    it('should return invalid when token service says invalid', async () => {
      tokenService.validateAccessToken.mockResolvedValue({
        valid: false,
        reason: 'expired',
      });

      const result = await service.validateToken('expired-token');

      expect(result).toEqual({ valid: false, reason: 'expired' });
    });

    it('should return invalid when user account is locked', async () => {
      const mockPayload = {
        sub: 'user-uuid-1',
        email: 'test@example.com',
        roles: ['USER'],
        jti: 'jti-1',
        iat: 0,
        exp: 0,
        iss: 'auth-service',
        aud: 'api-gateway',
        tokenType: 'ACCESS',
      };
      tokenService.validateAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
      });
      userCredentialRepository.findById.mockResolvedValue({
        ...mockCredential,
        status: UserStatus.LOCKED,
        lockedUntil: new Date(Date.now() + 60000),
      } as any);

      const result = await service.validateToken('token');

      expect(result).toEqual({ valid: false, reason: 'account_locked' });
    });

    it('should return invalid when user account is banned', async () => {
      const mockPayload = {
        sub: 'user-uuid-1',
        email: 'test@example.com',
        roles: ['USER'],
        jti: 'jti-1',
        iat: 0,
        exp: 0,
        iss: 'auth-service',
        aud: 'api-gateway',
        tokenType: 'ACCESS',
      };
      tokenService.validateAccessToken.mockResolvedValue({
        valid: true,
        payload: mockPayload,
      });
      userCredentialRepository.findById.mockResolvedValue({
        ...mockCredential,
        status: UserStatus.BANNED,
      } as any);

      const result = await service.validateToken('token');

      expect(result).toEqual({ valid: false, reason: 'account_banned' });
    });
  });

  describe('forgotPassword', () => {
    it('should generate reset token, store hash, and publish event', async () => {
      credentialService.findByEmail.mockResolvedValue(mockCredential as any);
      (hashUtil.hashToken as jest.Mock).mockReturnValue('hashed-reset-token');
      passwordResetTokenRepository.deleteByUserId.mockResolvedValue(undefined);
      passwordResetTokenRepository.create.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-uuid-1',
        tokenHash: 'hashed-reset-token',
        expiresAt: new Date(),
        used: false,
        usedAt: null,
        createdAt: new Date(),
      } as any);
      configService.get.mockReturnValue(15);

      await service.forgotPassword('test@example.com', '127.0.0.1');

      expect(passwordResetTokenRepository.deleteByUserId).toHaveBeenCalledWith('user-uuid-1');
      expect(passwordResetTokenRepository.create).toHaveBeenCalledWith({
        userId: 'user-uuid-1',
        tokenHash: 'hashed-reset-token',
        expiresAt: expect.any(Date),
      });
      expect(eventService.publishPasswordResetRequested).toHaveBeenCalled();
    });

    it('should silently succeed for non-existent email (prevent enumeration)', async () => {
      credentialService.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword('unknown@example.com'),
      ).resolves.not.toThrow();

      expect(passwordResetTokenRepository.create).not.toHaveBeenCalled();
      expect(eventService.publishPasswordResetRequested).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const mockResetToken = {
      id: 'prt-uuid-1',
      userId: 'user-uuid-1',
      tokenHash: 'hashed-reset-token',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      used: false,
      usedAt: null,
      createdAt: new Date(),
    };

    it('should validate token, update password, revoke sessions, and publish event', async () => {
      (hashUtil.hashToken as jest.Mock).mockReturnValue('hashed-reset-token');
      passwordResetTokenRepository.findByTokenHash.mockResolvedValue(mockResetToken as any);

      await service.resetPassword('raw-reset-token', 'NewPassword123!', '127.0.0.1');

      expect(credentialService.updatePassword).toHaveBeenCalledWith(
        'user-uuid-1',
        'NewPassword123!',
      );
      expect(passwordResetTokenRepository.markAsUsed).toHaveBeenCalledWith('prt-uuid-1');
      expect(passwordResetTokenRepository.deleteByUserId).toHaveBeenCalledWith('user-uuid-1');
      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith(
        'user-uuid-1',
        'password_reset',
      );
      expect(eventService.publishPasswordResetCompleted).toHaveBeenCalled();
      expect(auditLogRepository.create).toHaveBeenCalled();
    });

    it('should throw when reset token not found', async () => {
      (hashUtil.hashToken as jest.Mock).mockReturnValue('unknown-hash');
      passwordResetTokenRepository.findByTokenHash.mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid-token', 'NewPassword123!'),
      ).rejects.toThrow(ErrorMessages.AUTH_PASSWORD_RESET_INVALID);
    });

    it('should throw when reset token already used', async () => {
      const usedToken = { ...mockResetToken, used: true };
      (hashUtil.hashToken as jest.Mock).mockReturnValue('hashed-reset-token');
      passwordResetTokenRepository.findByTokenHash.mockResolvedValue(usedToken as any);

      await expect(
        service.resetPassword('used-token', 'NewPassword123!'),
      ).rejects.toThrow(ErrorMessages.AUTH_PASSWORD_RESET_USED);
    });

    it('should throw when reset token is expired', async () => {
      const expiredToken = {
        ...mockResetToken,
        expiresAt: new Date(Date.now() - 1000),
      };
      (hashUtil.hashToken as jest.Mock).mockReturnValue('hashed-reset-token');
      passwordResetTokenRepository.findByTokenHash.mockResolvedValue(expiredToken as any);

      await expect(
        service.resetPassword('expired-token', 'NewPassword123!'),
      ).rejects.toThrow(ErrorMessages.AUTH_PASSWORD_RESET_INVALID);
    });
  });
});

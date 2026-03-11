/**
 * @file token.service.spec.ts
 * @description Unit tests for TokenService — JWT generation, validation, refresh
 *   token rotation, reuse detection, and token revocation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { BlacklistService } from './blacklist.service';
import { RedisClient } from '../clients/redis.client';
import { TokenType } from '../constants/token.constant';
import { ErrorMessages } from '../constants/error-messages.constant';
import * as tokenUtil from '../utils/token.util';
import * as hashUtil from '../utils/hash.util';

jest.mock('../utils/token.util');
jest.mock('../utils/hash.util');
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

describe('TokenService', () => {
  let service: TokenService;
  let refreshTokenRepository: jest.Mocked<RefreshTokenRepository>;
  let blacklistService: jest.Mocked<BlacklistService>;
  let configService: jest.Mocked<ConfigService>;

  const mockRefreshTokenEntity = {
    id: 'rt-uuid-1',
    userId: 'user-uuid-1',
    tokenHash: 'hashed-token',
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revoked: false,
    revokedAt: null,
    revocationReason: null,
    deviceFingerprint: 'mock-fingerprint',
    ipAddress: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    lastUsedAt: null,
    replacedByTokenId: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: RefreshTokenRepository,
          useValue: {
            create: jest.fn(),
            findByTokenHash: jest.fn(),
            findById: jest.fn(),
            revokeToken: jest.fn(),
            revokeAllByUserId: jest.fn(),
            setReplacedBy: jest.fn(),
            updateLastUsed: jest.fn(),
            findActiveByUserId: jest.fn(),
            countActiveByUserId: jest.fn(),
          },
        },
        {
          provide: BlacklistService,
          useValue: {
            blacklistToken: jest.fn(),
            isBlacklisted: jest.fn(),
          },
        },
        {
          provide: RedisClient,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
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

    service = module.get<TokenService>(TokenService);
    refreshTokenRepository = module.get(RefreshTokenRepository);
    blacklistService = module.get(BlacklistService);
    configService = module.get(ConfigService);

    jest.clearAllMocks();
  });

  describe('generateAccessToken', () => {
    it('should generate an RS256 JWT with correct claims', () => {
      configService.get.mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'jwt.privateKey': 'mock-private-key',
          'jwt.accessTokenExpiry': '15m',
          'jwt.issuer': 'auth-service',
          'jwt.audience': 'api-gateway',
        };
        return map[key];
      });
      (tokenUtil.signAccessToken as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = service.generateAccessToken('user-uuid-1', 'test@example.com', ['USER']);

      expect(tokenUtil.signAccessToken).toHaveBeenCalledWith(
        {
          sub: 'user-uuid-1',
          email: 'test@example.com',
          roles: ['USER'],
          tokenType: TokenType.ACCESS,
        },
        'mock-private-key',
        {
          expiresIn: '15m',
          issuer: 'auth-service',
          audience: 'api-gateway',
        },
      );
      expect(result).toBe('mock-jwt-token');
    });

    it('should use default values when config is missing', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'jwt.privateKey') return 'mock-key';
        return undefined;
      });
      (tokenUtil.signAccessToken as jest.Mock).mockReturnValue('jwt');

      service.generateAccessToken('uid', 'e@test.com', ['USER']);

      expect(tokenUtil.signAccessToken).toHaveBeenCalledWith(
        expect.any(Object),
        'mock-key',
        {
          expiresIn: '15m',
          issuer: 'auth-service',
          audience: 'api-gateway',
        },
      );
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate an opaque UUID and store as SHA-256 hash', async () => {
      configService.get.mockReturnValue(7);
      (hashUtil.hashToken as jest.Mock).mockReturnValue('sha256-hashed-token');
      refreshTokenRepository.create.mockResolvedValue(mockRefreshTokenEntity as any);

      const result = await service.generateRefreshToken(
        'user-uuid-1',
        'fingerprint',
        '127.0.0.1',
        'TestAgent/1.0',
      );

      expect(hashUtil.hashToken).toHaveBeenCalledWith(expect.any(String));
      expect(refreshTokenRepository.create).toHaveBeenCalledWith({
        userId: 'user-uuid-1',
        tokenHash: 'sha256-hashed-token',
        expiresAt: expect.any(Date),
        deviceFingerprint: 'fingerprint',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
      });
      expect(result.rawToken).toBeDefined();
      expect(result.refreshTokenEntity).toEqual(mockRefreshTokenEntity);
    });
  });

  describe('validateAccessToken', () => {
    const mockPayload = {
      sub: 'user-uuid-1',
      email: 'test@example.com',
      roles: ['USER'],
      jti: 'jti-uuid-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      iss: 'auth-service',
      aud: 'api-gateway',
      tokenType: 'ACCESS',
    };

    it('should return valid=true for a valid non-blacklisted token', async () => {
      configService.get.mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'jwt.publicKey': 'mock-public-key',
          'jwt.issuer': 'auth-service',
          'jwt.audience': 'api-gateway',
        };
        return map[key];
      });
      (tokenUtil.verifyAccessToken as jest.Mock).mockReturnValue(mockPayload);
      blacklistService.isBlacklisted.mockResolvedValue(false);

      const result = await service.validateAccessToken('valid-token');

      expect(result).toEqual({ valid: true, payload: mockPayload });
    });

    it('should return valid=false reason=blacklisted for blacklisted token', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'jwt.publicKey') return 'key';
        if (key === 'jwt.issuer') return 'auth-service';
        if (key === 'jwt.audience') return 'api-gateway';
        return undefined;
      });
      (tokenUtil.verifyAccessToken as jest.Mock).mockReturnValue(mockPayload);
      blacklistService.isBlacklisted.mockResolvedValue(true);

      const result = await service.validateAccessToken('blacklisted-token');

      expect(result).toEqual({ valid: false, reason: 'blacklisted' });
    });

    it('should return valid=false reason=expired for expired token', async () => {
      configService.get.mockReturnValue('mock-key');
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      (tokenUtil.verifyAccessToken as jest.Mock).mockImplementation(() => {
        throw expiredError;
      });

      const result = await service.validateAccessToken('expired-token');

      expect(result).toEqual({ valid: false, reason: 'expired' });
    });

    it('should return valid=false reason=invalid_signature for tampered token', async () => {
      configService.get.mockReturnValue('mock-key');
      const signatureError = new Error('invalid signature');
      signatureError.name = 'JsonWebTokenError';
      (tokenUtil.verifyAccessToken as jest.Mock).mockImplementation(() => {
        throw signatureError;
      });

      const result = await service.validateAccessToken('tampered-token');

      expect(result).toEqual({ valid: false, reason: 'invalid_signature' });
    });

    it('should return valid=false reason=invalid for unexpected errors', async () => {
      configService.get.mockReturnValue('mock-key');
      (tokenUtil.verifyAccessToken as jest.Mock).mockImplementation(() => {
        throw new Error('unexpected error');
      });

      const result = await service.validateAccessToken('bad-token');

      expect(result).toEqual({ valid: false, reason: 'invalid' });
    });
  });

  describe('refreshTokens', () => {
    it('should rotate tokens: revoke old, issue new, track chain', async () => {
      (hashUtil.hashToken as jest.Mock).mockReturnValue('hashed-old-token');
      refreshTokenRepository.findByTokenHash.mockResolvedValue(mockRefreshTokenEntity as any);
      refreshTokenRepository.revokeToken.mockResolvedValue(undefined);
      refreshTokenRepository.create.mockResolvedValue({
        ...mockRefreshTokenEntity,
        id: 'rt-uuid-2',
      } as any);
      refreshTokenRepository.setReplacedBy.mockResolvedValue(undefined);
      refreshTokenRepository.updateLastUsed.mockResolvedValue(undefined);
      configService.get.mockImplementation((key: string) => {
        if (key === 'jwt.refreshTokenExpiryDays') return 7;
        if (key === 'jwt.accessTokenExpiry') return '15m';
        return undefined;
      });

      const result = await service.refreshTokens('raw-refresh-token', '127.0.0.1', 'TestAgent');

      expect(refreshTokenRepository.revokeToken).toHaveBeenCalledWith('rt-uuid-1', 'rotated');
      expect(refreshTokenRepository.setReplacedBy).toHaveBeenCalledWith('rt-uuid-1', 'rt-uuid-2');
      expect(result.refreshToken).toBeDefined();
      expect(result.accessToken).toBe('');
    });

    it('should throw when refresh token not found', async () => {
      (hashUtil.hashToken as jest.Mock).mockReturnValue('unknown-hash');
      refreshTokenRepository.findByTokenHash.mockResolvedValue(null);

      await expect(service.refreshTokens('unknown-token')).rejects.toThrow(
        ErrorMessages.AUTH_REFRESH_TOKEN_INVALID,
      );
    });

    it('should revoke all user tokens on reuse detection', async () => {
      const revokedToken = { ...mockRefreshTokenEntity, revoked: true };
      (hashUtil.hashToken as jest.Mock).mockReturnValue('hashed-reused-token');
      refreshTokenRepository.findByTokenHash.mockResolvedValue(revokedToken as any);
      refreshTokenRepository.revokeAllByUserId.mockResolvedValue(3);

      await expect(service.refreshTokens('reused-token')).rejects.toThrow(
        ErrorMessages.AUTH_TOKEN_REUSE_DETECTED,
      );
      expect(refreshTokenRepository.revokeAllByUserId).toHaveBeenCalledWith(
        'user-uuid-1',
        'token_reuse_detected',
      );
    });

    it('should throw when refresh token is expired', async () => {
      const expiredToken = {
        ...mockRefreshTokenEntity,
        expiresAt: new Date(Date.now() - 1000),
      };
      (hashUtil.hashToken as jest.Mock).mockReturnValue('hashed-expired');
      refreshTokenRepository.findByTokenHash.mockResolvedValue(expiredToken as any);

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        ErrorMessages.AUTH_REFRESH_TOKEN_INVALID,
      );
    });
  });

  describe('revokeAccessToken', () => {
    it('should blacklist the JTI with remaining TTL', async () => {
      (tokenUtil.extractJti as jest.Mock).mockReturnValue('jti-uuid-1');
      (tokenUtil.getRemainingTtl as jest.Mock).mockReturnValue(600);
      blacklistService.blacklistToken.mockResolvedValue(undefined);

      await service.revokeAccessToken('some-jwt-token');

      expect(blacklistService.blacklistToken).toHaveBeenCalledWith('jti-uuid-1', 600);
    });

    it('should skip blacklisting when no JTI is found', async () => {
      (tokenUtil.extractJti as jest.Mock).mockReturnValue(null);

      await service.revokeAccessToken('no-jti-token');

      expect(blacklistService.blacklistToken).not.toHaveBeenCalled();
    });

    it('should skip blacklisting when token already expired', async () => {
      (tokenUtil.extractJti as jest.Mock).mockReturnValue('jti-uuid-1');
      (tokenUtil.getRemainingTtl as jest.Mock).mockReturnValue(0);

      await service.revokeAccessToken('expired-token');

      expect(blacklistService.blacklistToken).not.toHaveBeenCalled();
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke the refresh token by ID with reason', async () => {
      refreshTokenRepository.revokeToken.mockResolvedValue(undefined);

      await service.revokeRefreshToken('rt-uuid-1', 'logout');

      expect(refreshTokenRepository.revokeToken).toHaveBeenCalledWith('rt-uuid-1', 'logout');
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all refresh tokens for the user', async () => {
      refreshTokenRepository.revokeAllByUserId.mockResolvedValue(5);

      await service.revokeAllUserTokens('user-uuid-1', 'password_change');

      expect(refreshTokenRepository.revokeAllByUserId).toHaveBeenCalledWith(
        'user-uuid-1',
        'password_change',
      );
    });
  });

  describe('getAccessTokenExpirySeconds', () => {
    it('should parse "15m" to 900 seconds', () => {
      configService.get.mockReturnValue('15m');
      expect(service.getAccessTokenExpirySeconds()).toBe(900);
    });

    it('should parse "1h" to 3600 seconds', () => {
      configService.get.mockReturnValue('1h');
      expect(service.getAccessTokenExpirySeconds()).toBe(3600);
    });

    it('should parse "30s" to 30 seconds', () => {
      configService.get.mockReturnValue('30s');
      expect(service.getAccessTokenExpirySeconds()).toBe(30);
    });

    it('should parse "1d" to 86400 seconds', () => {
      configService.get.mockReturnValue('1d');
      expect(service.getAccessTokenExpirySeconds()).toBe(86400);
    });

    it('should default to 900 seconds for invalid format', () => {
      configService.get.mockReturnValue('invalid');
      expect(service.getAccessTokenExpirySeconds()).toBe(900);
    });
  });
});

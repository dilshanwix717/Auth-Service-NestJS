/**
 * @file session.service.spec.ts
 * @description Unit tests for SessionService — active session management,
 *   max concurrent session enforcement, and targeted session revocation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SessionService } from './session.service';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';

jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('SessionService', () => {
  let service: SessionService;
  let refreshTokenRepository: jest.Mocked<RefreshTokenRepository>;
  let configService: jest.Mocked<ConfigService>;

  const mockActiveTokens = [
    {
      id: 'rt-1',
      userId: 'user-uuid-1',
      tokenHash: 'hash1',
      issuedAt: new Date('2024-01-01'),
      expiresAt: new Date('2024-01-08'),
      revoked: false,
      revokedAt: null,
      revocationReason: null,
      deviceFingerprint: 'fp-1',
      ipAddress: '127.0.0.1',
      userAgent: 'Chrome/120',
      lastUsedAt: new Date('2024-01-02'),
      replacedByTokenId: null,
    },
    {
      id: 'rt-2',
      userId: 'user-uuid-1',
      tokenHash: 'hash2',
      issuedAt: new Date('2024-01-02'),
      expiresAt: new Date('2024-01-09'),
      revoked: false,
      revokedAt: null,
      revocationReason: null,
      deviceFingerprint: 'fp-2',
      ipAddress: '192.168.1.1',
      userAgent: 'Firefox/120',
      lastUsedAt: null,
      replacedByTokenId: null,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: RefreshTokenRepository,
          useValue: {
            findActiveByUserId: jest.fn(),
            countActiveByUserId: jest.fn(),
            findOldestActiveByUserId: jest.fn(),
            revokeToken: jest.fn(),
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

    service = module.get<SessionService>(SessionService);
    refreshTokenRepository = module.get(RefreshTokenRepository);
    configService = module.get(ConfigService);

    jest.clearAllMocks();
  });

  describe('getActiveSessions', () => {
    it('should return mapped session info for all active tokens', async () => {
      refreshTokenRepository.findActiveByUserId.mockResolvedValue(mockActiveTokens as any);

      const sessions = await service.getActiveSessions('user-uuid-1');

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toEqual({
        sessionId: 'rt-1',
        userId: 'user-uuid-1',
        deviceFingerprint: 'fp-1',
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome/120',
        issuedAt: new Date('2024-01-01'),
        expiresAt: new Date('2024-01-08'),
        lastUsedAt: new Date('2024-01-02'),
      });
    });

    it('should return empty array when no active sessions', async () => {
      refreshTokenRepository.findActiveByUserId.mockResolvedValue([]);

      const sessions = await service.getActiveSessions('user-uuid-1');

      expect(sessions).toEqual([]);
    });

    it('should handle null optional fields correctly', async () => {
      const tokenWithNulls = {
        ...mockActiveTokens[0],
        deviceFingerprint: null,
        ipAddress: null,
        userAgent: null,
        lastUsedAt: null,
      };
      refreshTokenRepository.findActiveByUserId.mockResolvedValue([tokenWithNulls as any]);

      const sessions = await service.getActiveSessions('user-uuid-1');

      expect(sessions[0].deviceFingerprint).toBeUndefined();
      expect(sessions[0].ipAddress).toBeUndefined();
      expect(sessions[0].userAgent).toBeUndefined();
      expect(sessions[0].lastUsedAt).toBeUndefined();
    });
  });

  describe('countActiveSessions', () => {
    it('should return the count of active sessions', async () => {
      refreshTokenRepository.countActiveByUserId.mockResolvedValue(3);

      const count = await service.countActiveSessions('user-uuid-1');

      expect(count).toBe(3);
    });
  });

  describe('enforceMaxSessions', () => {
    it('should do nothing when active count is within limit', async () => {
      configService.get.mockReturnValue(5);
      refreshTokenRepository.countActiveByUserId.mockResolvedValue(3);

      await service.enforceMaxSessions('user-uuid-1');

      expect(refreshTokenRepository.findOldestActiveByUserId).not.toHaveBeenCalled();
      expect(refreshTokenRepository.revokeToken).not.toHaveBeenCalled();
    });

    it('should do nothing when active count equals the limit', async () => {
      configService.get.mockReturnValue(5);
      refreshTokenRepository.countActiveByUserId.mockResolvedValue(5);

      await service.enforceMaxSessions('user-uuid-1');

      expect(refreshTokenRepository.revokeToken).not.toHaveBeenCalled();
    });

    it('should revoke oldest sessions when count exceeds limit', async () => {
      configService.get.mockReturnValue(3);
      refreshTokenRepository.countActiveByUserId.mockResolvedValue(5);
      refreshTokenRepository.findOldestActiveByUserId.mockResolvedValue(mockActiveTokens[0] as any);

      await service.enforceMaxSessions('user-uuid-1');

      // Should revoke 5 - 3 = 2 sessions
      expect(refreshTokenRepository.findOldestActiveByUserId).toHaveBeenCalledTimes(2);
      expect(refreshTokenRepository.revokeToken).toHaveBeenCalledTimes(2);
      expect(refreshTokenRepository.revokeToken).toHaveBeenCalledWith(
        'rt-1',
        'max_sessions_exceeded',
      );
    });

    it('should use default max sessions of 5 when config is missing', async () => {
      configService.get.mockReturnValue(undefined);
      refreshTokenRepository.countActiveByUserId.mockResolvedValue(4);

      await service.enforceMaxSessions('user-uuid-1');

      expect(refreshTokenRepository.revokeToken).not.toHaveBeenCalled();
    });

    it('should handle case where oldest token is not found', async () => {
      configService.get.mockReturnValue(1);
      refreshTokenRepository.countActiveByUserId.mockResolvedValue(3);
      refreshTokenRepository.findOldestActiveByUserId.mockResolvedValue(null);

      await service.enforceMaxSessions('user-uuid-1');

      expect(refreshTokenRepository.revokeToken).not.toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    it('should revoke a specific session by ID', async () => {
      refreshTokenRepository.revokeToken.mockResolvedValue(undefined);

      await service.revokeSession('rt-1', 'user_revoked');

      expect(refreshTokenRepository.revokeToken).toHaveBeenCalledWith('rt-1', 'user_revoked');
    });
  });
});

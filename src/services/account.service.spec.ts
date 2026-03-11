/**
 * @file account.service.spec.ts
 * @description Unit tests for AccountService — account locking, unlocking,
 *   banning, and credential deletion with compensating transactions.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from './account.service';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import { TokenService } from './token.service';
import { EventService } from './event.service';
import { UserStatus } from '../entities/user-credential.entity';
import { ErrorMessages } from '../constants/error-messages.constant';

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

describe('AccountService', () => {
  let service: AccountService;
  let userCredentialRepository: jest.Mocked<UserCredentialRepository>;
  let tokenService: jest.Mocked<TokenService>;
  let eventService: jest.Mocked<EventService>;
  let auditLogRepository: jest.Mocked<AuditLogRepository>;

  const mockUser = {
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
        AccountService,
        {
          provide: UserCredentialRepository,
          useValue: {
            findById: jest.fn(),
            lockAccount: jest.fn(),
            unlockAccount: jest.fn(),
            updateStatus: jest.fn(),
            deleteCredential: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            revokeAllUserTokens: jest.fn(),
          },
        },
        {
          provide: EventService,
          useValue: {
            publishAccountLocked: jest.fn(),
            publishAccountUnlocked: jest.fn(),
            publishAccountBanned: jest.fn(),
            publishCredentialsDeleted: jest.fn(),
          },
        },
        {
          provide: AuditLogRepository,
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
    userCredentialRepository = module.get(UserCredentialRepository);
    tokenService = module.get(TokenService);
    eventService = module.get(EventService);
    auditLogRepository = module.get(AuditLogRepository);

    jest.clearAllMocks();
  });

  describe('lockAccount', () => {
    it('should lock account, revoke tokens, publish event, and audit log', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);

      await service.lockAccount('user-uuid-1', 'brute_force', 30, 'admin-uuid');

      expect(userCredentialRepository.lockAccount).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.any(Date),
      );
      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith(
        'user-uuid-1',
        'account_locked:brute_force',
      );
      expect(eventService.publishAccountLocked).toHaveBeenCalledWith(
        'user-uuid-1',
        'brute_force',
        expect.any(String),
        'mock-trace-id',
      );
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_LOCKED',
          userId: 'user-uuid-1',
          outcome: 'SUCCESS',
        }),
      );
    });

    it('should support indefinite lock when no duration provided', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);

      await service.lockAccount('user-uuid-1', 'admin_action');

      expect(userCredentialRepository.lockAccount).toHaveBeenCalledWith(
        'user-uuid-1',
        null,
      );
      expect(eventService.publishAccountLocked).toHaveBeenCalledWith(
        'user-uuid-1',
        'admin_action',
        null,
        'mock-trace-id',
      );
    });

    it('should throw when user not found', async () => {
      userCredentialRepository.findById.mockResolvedValue(null);

      await expect(
        service.lockAccount('nonexistent', 'reason'),
      ).rejects.toThrow(ErrorMessages.AUTH_USER_NOT_FOUND);
    });
  });

  describe('unlockAccount', () => {
    it('should unlock account, publish event, and audit log', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);

      await service.unlockAccount('user-uuid-1', 'admin-uuid');

      expect(userCredentialRepository.unlockAccount).toHaveBeenCalledWith('user-uuid-1');
      expect(eventService.publishAccountUnlocked).toHaveBeenCalledWith(
        'user-uuid-1',
        'admin-uuid',
        'mock-trace-id',
      );
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_UNLOCKED',
          userId: 'user-uuid-1',
          outcome: 'SUCCESS',
        }),
      );
    });

    it('should use "system" when no admin user ID provided', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);

      await service.unlockAccount('user-uuid-1');

      expect(eventService.publishAccountUnlocked).toHaveBeenCalledWith(
        'user-uuid-1',
        'system',
        'mock-trace-id',
      );
    });

    it('should throw when user not found', async () => {
      userCredentialRepository.findById.mockResolvedValue(null);

      await expect(
        service.unlockAccount('nonexistent'),
      ).rejects.toThrow(ErrorMessages.AUTH_USER_NOT_FOUND);
    });
  });

  describe('banUser', () => {
    it('should set status to BANNED, revoke all tokens, publish event, and audit log', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);

      await service.banUser('user-uuid-1', 'terms_violation', 'admin-uuid');

      expect(userCredentialRepository.updateStatus).toHaveBeenCalledWith(
        'user-uuid-1',
        UserStatus.BANNED,
      );
      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith(
        'user-uuid-1',
        'account_banned:terms_violation',
      );
      expect(eventService.publishAccountBanned).toHaveBeenCalledWith(
        'user-uuid-1',
        'terms_violation',
        'admin-uuid',
        'mock-trace-id',
      );
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ACCOUNT_BANNED',
          outcome: 'SUCCESS',
        }),
      );
    });

    it('should throw when user not found', async () => {
      userCredentialRepository.findById.mockResolvedValue(null);

      await expect(
        service.banUser('nonexistent', 'reason'),
      ).rejects.toThrow(ErrorMessages.AUTH_USER_NOT_FOUND);
    });
  });

  describe('deleteCredentials', () => {
    it('should delete credentials, publish event, and audit log', async () => {
      userCredentialRepository.deleteCredential.mockResolvedValue(true);

      await service.deleteCredentials('user-uuid-1');

      expect(userCredentialRepository.deleteCredential).toHaveBeenCalledWith('user-uuid-1');
      expect(eventService.publishCredentialsDeleted).toHaveBeenCalledWith(
        'user-uuid-1',
        'mock-trace-id',
      );
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CREDENTIALS_DELETED',
          outcome: 'SUCCESS',
          metadata: expect.objectContaining({ deleted: true, idempotent: false }),
        }),
      );
    });

    it('should succeed silently when credential not found (idempotent)', async () => {
      userCredentialRepository.deleteCredential.mockResolvedValue(false);

      await expect(
        service.deleteCredentials('nonexistent'),
      ).resolves.not.toThrow();

      expect(eventService.publishCredentialsDeleted).toHaveBeenCalled();
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ deleted: false, idempotent: true }),
        }),
      );
    });
  });
});

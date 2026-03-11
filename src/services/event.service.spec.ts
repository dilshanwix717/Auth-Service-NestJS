/**
 * @file event.service.spec.ts
 * @description Unit tests for EventService — domain event publishing to RabbitMQ
 *   with correct routing keys, payload structure, and error resilience.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from './event.service';
import { RabbitMQClient } from '../clients/rabbitmq.client';
import { RabbitMQEvents } from '../constants/rabbitmq-events.constant';

jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('EventService', () => {
  let service: EventService;
  let rabbitMQClient: jest.Mocked<RabbitMQClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        {
          provide: RabbitMQClient,
          useValue: {
            publish: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventService>(EventService);
    rabbitMQClient = module.get(RabbitMQClient);

    jest.clearAllMocks();
  });

  describe('publishUserCreated', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishUserCreated('user-1', 'test@test.com', ['USER'], 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.USER_ACCOUNT_CREATED,
        expect.objectContaining({
          userId: 'user-1',
          email: 'test@test.com',
          roles: ['USER'],
          timestamp: expect.any(String),
        }),
        'trace-1',
      );
    });
  });

  describe('publishUserLoggedIn', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishUserLoggedIn('user-1', 'test@test.com', '127.0.0.1', 'fp-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.USER_LOGGED_IN,
        expect.objectContaining({
          userId: 'user-1',
          email: 'test@test.com',
          ip: '127.0.0.1',
          deviceFingerprint: 'fp-1',
        }),
        'trace-1',
      );
    });
  });

  describe('publishUserLoggedOut', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishUserLoggedOut('user-1', 'jti-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.USER_LOGGED_OUT,
        expect.objectContaining({ userId: 'user-1', jti: 'jti-1' }),
        'trace-1',
      );
    });
  });

  describe('publishTokenRevoked', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishTokenRevoked('user-1', 'jti-1', 'logout', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.TOKEN_REVOKED,
        expect.objectContaining({ userId: 'user-1', jti: 'jti-1', reason: 'logout' }),
        'trace-1',
      );
    });
  });

  describe('publishAllTokensRevoked', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishAllTokensRevoked('user-1', 'password_change', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.ALL_TOKENS_REVOKED,
        expect.objectContaining({ userId: 'user-1', reason: 'password_change' }),
        'trace-1',
      );
    });
  });

  describe('publishAccountLocked', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishAccountLocked('user-1', 'brute_force', '2024-01-01T00:30:00Z', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.ACCOUNT_LOCKED,
        expect.objectContaining({
          userId: 'user-1',
          reason: 'brute_force',
          lockedUntil: '2024-01-01T00:30:00Z',
        }),
        'trace-1',
      );
    });
  });

  describe('publishAccountUnlocked', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishAccountUnlocked('user-1', 'admin-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.ACCOUNT_UNLOCKED,
        expect.objectContaining({ userId: 'user-1', unlockedBy: 'admin-1' }),
        'trace-1',
      );
    });
  });

  describe('publishAccountBanned', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishAccountBanned('user-1', 'terms_violation', 'admin-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.ACCOUNT_BANNED,
        expect.objectContaining({
          userId: 'user-1',
          reason: 'terms_violation',
          bannedBy: 'admin-1',
        }),
        'trace-1',
      );
    });
  });

  describe('publishCredentialsDeleted', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishCredentialsDeleted('user-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.CREDENTIALS_DELETED,
        expect.objectContaining({ userId: 'user-1' }),
        'trace-1',
      );
    });
  });

  describe('publishPasswordResetRequested', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishPasswordResetRequested(
        'user-1',
        'test@test.com',
        'raw-token',
        '2024-01-01T00:15:00Z',
        'trace-1',
      );

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.PASSWORD_RESET_REQUESTED,
        expect.objectContaining({
          userId: 'user-1',
          email: 'test@test.com',
          resetToken: 'raw-token',
          expiresAt: '2024-01-01T00:15:00Z',
        }),
        'trace-1',
      );
    });
  });

  describe('publishPasswordResetCompleted', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishPasswordResetCompleted('user-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.PASSWORD_RESET_COMPLETED,
        expect.objectContaining({ userId: 'user-1' }),
        'trace-1',
      );
    });
  });

  describe('publishRoleAssigned', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishRoleAssigned('user-1', 'ADMIN', 'admin-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.ROLE_ASSIGNED,
        expect.objectContaining({ userId: 'user-1', role: 'ADMIN', assignedBy: 'admin-1' }),
        'trace-1',
      );
    });
  });

  describe('publishRoleRevoked', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishRoleRevoked('user-1', 'ADMIN', 'admin-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.ROLE_REVOKED,
        expect.objectContaining({ userId: 'user-1', role: 'ADMIN', revokedBy: 'admin-1' }),
        'trace-1',
      );
    });
  });

  describe('publishLoginFailed', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishLoginFailed('test@test.com', '127.0.0.1', 3, 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.LOGIN_FAILED,
        expect.objectContaining({
          email: 'test@test.com',
          ip: '127.0.0.1',
          attemptCount: 3,
        }),
        'trace-1',
      );
    });
  });

  describe('publishSuspiciousActivity', () => {
    it('should publish with correct routing key and payload', async () => {
      await service.publishSuspiciousActivity('user-1', '127.0.0.1', 'fp-1', 'trace-1');

      expect(rabbitMQClient.publish).toHaveBeenCalledWith(
        RabbitMQEvents.SUSPICIOUS_ACTIVITY_DETECTED,
        expect.objectContaining({
          userId: 'user-1',
          ip: '127.0.0.1',
          deviceFingerprint: 'fp-1',
        }),
        'trace-1',
      );
    });
  });

  describe('event envelope structure', () => {
    it('should include a timestamp in every event payload', async () => {
      await service.publishUserCreated('user-1', 'test@test.com', ['USER'], 'trace-1');

      const publishedPayload = rabbitMQClient.publish.mock.calls[0][1];
      expect(publishedPayload).toHaveProperty('timestamp');
      expect(new Date(publishedPayload.timestamp as string).getTime()).not.toBeNaN();
    });
  });

  describe('RabbitMQ failure handling', () => {
    it('should log error but not throw when RabbitMQ publish fails', async () => {
      rabbitMQClient.publish.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.publishUserCreated('user-1', 'test@test.com', ['USER'], 'trace-1'),
      ).resolves.not.toThrow();
    });

    it('should not propagate errors from any publish method', async () => {
      rabbitMQClient.publish.mockRejectedValue(new Error('Channel closed'));

      await expect(
        service.publishAccountLocked('user-1', 'reason', null, 'trace-1'),
      ).resolves.not.toThrow();

      await expect(
        service.publishCredentialsDeleted('user-1', 'trace-1'),
      ).resolves.not.toThrow();
    });
  });
});

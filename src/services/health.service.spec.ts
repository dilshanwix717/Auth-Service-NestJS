/**
 * @file health.service.spec.ts
 * @description Unit tests for HealthService — dependency health checks for
 *   PostgreSQL, Redis, and RabbitMQ with aggregate status determination.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';
import { RedisClient } from '../clients/redis.client';
import { RabbitMQClient } from '../clients/rabbitmq.client';

jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('HealthService', () => {
  let service: HealthService;
  let dataSource: jest.Mocked<DataSource>;
  let redisClient: jest.Mocked<RedisClient>;
  let rabbitMQClient: jest.Mocked<RabbitMQClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: RedisClient,
          useValue: {
            ping: jest.fn(),
          },
        },
        {
          provide: RabbitMQClient,
          useValue: {
            isConnected: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    dataSource = module.get(DataSource);
    redisClient = module.get(RedisClient);
    rabbitMQClient = module.get(RabbitMQClient);

    jest.clearAllMocks();
  });

  describe('checkHealth', () => {
    it('should return "healthy" when all dependencies are up', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockResolvedValue(true);
      (rabbitMQClient as any).isConnected.mockResolvedValue(true);

      const result = await service.checkHealth();

      expect(result.status).toBe('healthy');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.rabbitmq.status).toBe('up');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeDefined();
    });

    it('should return "unhealthy" when PostgreSQL is down', async () => {
      dataSource.query.mockRejectedValue(new Error('Connection refused'));
      redisClient.ping.mockResolvedValue(true);
      (rabbitMQClient as any).isConnected.mockResolvedValue(true);

      const result = await service.checkHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgresql.status).toBe('down');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.rabbitmq.status).toBe('up');
    });

    it('should return "degraded" when Redis is down', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockResolvedValue(false);
      (rabbitMQClient as any).isConnected.mockResolvedValue(true);

      const result = await service.checkHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should return "degraded" when RabbitMQ is down', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockResolvedValue(true);
      (rabbitMQClient as any).isConnected.mockResolvedValue(false);

      const result = await service.checkHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks.rabbitmq.status).toBe('down');
    });

    it('should return "unhealthy" when PostgreSQL is down even if others are also down', async () => {
      dataSource.query.mockRejectedValue(new Error('timeout'));
      redisClient.ping.mockResolvedValue(false);
      (rabbitMQClient as any).isConnected.mockResolvedValue(false);

      const result = await service.checkHealth();

      expect(result.status).toBe('unhealthy');
    });

    it('should include latency measurements for each check', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockResolvedValue(true);
      (rabbitMQClient as any).isConnected.mockResolvedValue(true);

      const result = await service.checkHealth();

      expect(result.checks.postgresql.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.checks.rabbitmq.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle Redis ping throwing an exception', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockRejectedValue(new Error('Redis connection error'));
      (rabbitMQClient as any).isConnected.mockResolvedValue(true);

      const result = await service.checkHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should handle RabbitMQ isConnected throwing an exception', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      redisClient.ping.mockResolvedValue(true);
      (rabbitMQClient as any).isConnected.mockRejectedValue(new Error('AMQP error'));

      const result = await service.checkHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks.rabbitmq.status).toBe('down');
    });
  });
});

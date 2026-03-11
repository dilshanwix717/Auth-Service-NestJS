/**
 * =============================================================================
 * Health Service — Dependency Health Checks
 * =============================================================================
 *
 * @file health.service.ts
 * @description Performs health checks on all Auth Service dependencies:
 *   PostgreSQL (via TypeORM DataSource), Redis (via ping), and RabbitMQ
 *   (via connection status check). Returns a structured HealthCheckResult
 *   used by Kubernetes liveness/readiness probes and load balancers.
 *
 * Architecture Role: Business Logic Layer — Infrastructure Health
 *   Called by the HealthController to serve the /health endpoint. Aggregates
 *   individual dependency health checks into a single status determination.
 *
 * Request Flow:
 *   1. Kubernetes/load balancer sends GET /health to the HealthController.
 *   2. HealthController calls HealthService.checkHealth().
 *   3. HealthService checks each dependency in parallel:
 *      - PostgreSQL: Executes `SELECT 1` via the TypeORM DataSource.
 *      - Redis: Sends a PING command via the RedisClient.
 *      - RabbitMQ: Checks connection status via the RabbitMQClient.
 *   4. Measures latency for each check.
 *   5. Aggregates results:
 *      - 'healthy': All dependencies are up.
 *      - 'degraded': At least one non-critical dependency is down.
 *      - 'unhealthy': A critical dependency (PostgreSQL) is down.
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisClient } from '../clients/redis.client';
import { RabbitMQClient } from '../clients/rabbitmq.client';
import { HealthCheckResult } from '../interfaces/health-check.interface';
import { logger } from '../utils/logger.util';

@Injectable()
export class HealthService {
  /** Process start time for uptime calculation */
  private readonly startTime = Date.now();

  constructor(
    private readonly redisClient: RedisClient,
    private readonly rabbitMQClient: RabbitMQClient,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Performs a comprehensive health check on all Auth Service dependencies.
   * Checks are executed in parallel for minimal latency. Each individual
   * check measures its own latency in milliseconds.
   *
   * Aggregate status logic:
   *   - 'healthy': All three dependencies (PostgreSQL, Redis, RabbitMQ) are up.
   *   - 'unhealthy': PostgreSQL is down (critical — cannot authenticate users).
   *   - 'degraded': PostgreSQL is up but Redis and/or RabbitMQ are down
   *     (service can function but with reduced capabilities).
   *
   * @returns Structured HealthCheckResult with per-dependency status, latency,
   *   process uptime, and ISO-8601 timestamp
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const [postgresCheck, redisCheck, rabbitmqCheck] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkRabbitMQ(),
    ]);

    // Determine aggregate status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (postgresCheck.status === 'down') {
      status = 'unhealthy';
    } else if (redisCheck.status === 'down' || rabbitmqCheck.status === 'down') {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const result: HealthCheckResult = {
      status,
      checks: {
        postgresql: postgresCheck,
        redis: redisCheck,
        rabbitmq: rabbitmqCheck,
      },
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
    };

    logger.debug('Health check completed', { status, checks: result.checks });

    return result;
  }

  /**
   * Checks PostgreSQL connectivity by executing a simple `SELECT 1` query
   * via the TypeORM DataSource. Measures query latency in milliseconds.
   *
   * @returns Object with 'up' or 'down' status and latency in ms
   */
  private async checkPostgres(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch (error) {
      logger.error('PostgreSQL health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  /**
   * Checks Redis connectivity by sending a PING command via the RedisClient.
   * Measures round-trip latency in milliseconds.
   *
   * @returns Object with 'up' or 'down' status and latency in ms
   */
  private async checkRedis(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
    const start = Date.now();
    try {
      const isHealthy = await this.redisClient.ping();
      return {
        status: isHealthy ? 'up' : 'down',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      logger.error('Redis health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  /**
   * Checks RabbitMQ connectivity by verifying the connection status via the
   * RabbitMQClient. Measures check latency in milliseconds.
   *
   * @returns Object with 'up' or 'down' status and latency in ms
   */
  private async checkRabbitMQ(): Promise<{ status: 'up' | 'down'; latencyMs: number }> {
    const start = Date.now();
    try {
      const isConnected = await (this.rabbitMQClient as any).isConnected();
      return {
        status: isConnected ? 'up' : 'down',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      logger.error('RabbitMQ health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}

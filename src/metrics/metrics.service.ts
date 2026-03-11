/**
 * @file metrics.service.ts
 * @description Injectable service that exposes custom Prometheus metrics for the
 *              Auth Service. Provides pre-configured counters, gauges, and
 *              histograms for authentication operations, session tracking,
 *              HTTP request durations, Redis operations, and RabbitMQ publishing.
 *
 *              Other services inject MetricsService and call the helper methods
 *              to record metric observations without touching prom-client directly.
 * @module metrics/metrics-service
 */

import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * Centralised Prometheus metrics for every observable surface of the Auth Service.
 *
 * @example
 * ```typescript
 * constructor(private readonly metrics: MetricsService) {}
 *
 * async login(dto: LoginDto): Promise<Tokens> {
 *   const end = this.metrics.startRequestTimer({ method: 'POST', route: '/auth/login' });
 *   try {
 *     // …login logic…
 *     this.metrics.incrementLogin('success');
 *     end({ status_code: '200' });
 *   } catch {
 *     this.metrics.incrementLogin('failure');
 *     end({ status_code: '401' });
 *     throw err;
 *   }
 * }
 * ```
 */
@Injectable()
export class MetricsService {
  /* ------------------------------------------------------------------ */
  /*  Counters                                                          */
  /* ------------------------------------------------------------------ */

  /** Total login attempts partitioned by outcome. */
  private readonly loginCounter: Counter<string>;

  /** Total registration attempts partitioned by outcome. */
  private readonly registerCounter: Counter<string>;

  /** Total token-refresh attempts partitioned by outcome. */
  private readonly tokenRefreshCounter: Counter<string>;

  /** Total token-validation checks partitioned by result. */
  private readonly tokenValidationCounter: Counter<string>;

  /** Total number of accounts that have been locked. */
  private readonly accountLockedCounter: Counter<string>;

  /** Total RabbitMQ publish operations partitioned by event type and outcome. */
  private readonly rabbitmqPublishCounter: Counter<string>;

  /* ------------------------------------------------------------------ */
  /*  Gauges                                                            */
  /* ------------------------------------------------------------------ */

  /** Current number of active (non-expired, non-revoked) sessions. */
  private readonly activeSessionsGauge: Gauge<string>;

  /* ------------------------------------------------------------------ */
  /*  Histograms                                                        */
  /* ------------------------------------------------------------------ */

  /** HTTP request duration in seconds. */
  private readonly requestDurationHistogram: Histogram<string>;

  /** Redis operation duration in seconds. */
  private readonly redisOperationHistogram: Histogram<string>;

  constructor() {
    /* ---------- Counters ---------- */

    this.loginCounter = new Counter({
      name: 'auth_login_total',
      help: 'Total number of login attempts',
      labelNames: ['status'],
    });

    this.registerCounter = new Counter({
      name: 'auth_register_total',
      help: 'Total number of registration attempts',
      labelNames: ['status'],
    });

    this.tokenRefreshCounter = new Counter({
      name: 'auth_token_refresh_total',
      help: 'Total number of token refresh attempts',
      labelNames: ['status'],
    });

    this.tokenValidationCounter = new Counter({
      name: 'auth_token_validation_total',
      help: 'Total number of token validation checks',
      labelNames: ['status'],
    });

    this.accountLockedCounter = new Counter({
      name: 'auth_account_locked_total',
      help: 'Total number of accounts locked due to failed login attempts',
    });

    this.rabbitmqPublishCounter = new Counter({
      name: 'auth_rabbitmq_publish_total',
      help: 'Total number of RabbitMQ publish operations',
      labelNames: ['event_type', 'status'],
    });

    /* ---------- Gauges ---------- */

    this.activeSessionsGauge = new Gauge({
      name: 'auth_active_sessions_gauge',
      help: 'Current number of active user sessions',
    });

    /* ---------- Histograms ---------- */

    this.requestDurationHistogram = new Histogram({
      name: 'auth_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    });

    this.redisOperationHistogram = new Histogram({
      name: 'auth_redis_operation_duration_seconds',
      help: 'Redis operation duration in seconds',
      labelNames: ['operation'],
    });
  }

  /* ================================================================== */
  /*  Helper methods                                                    */
  /* ================================================================== */

  /* ---------- Login ---------- */

  /**
   * Increment the login counter.
   *
   * @param status - `'success'` or `'failure'`
   */
  incrementLogin(status: 'success' | 'failure'): void {
    this.loginCounter.inc({ status });
  }

  /* ---------- Register ---------- */

  /**
   * Increment the registration counter.
   *
   * @param status - `'success'` or `'failure'`
   */
  incrementRegister(status: 'success' | 'failure'): void {
    this.registerCounter.inc({ status });
  }

  /* ---------- Token Refresh ---------- */

  /**
   * Increment the token-refresh counter.
   *
   * @param status - `'success'` or `'failure'`
   */
  incrementTokenRefresh(status: 'success' | 'failure'): void {
    this.tokenRefreshCounter.inc({ status });
  }

  /* ---------- Token Validation ---------- */

  /**
   * Increment the token-validation counter.
   *
   * @param status - Validation result: `'valid'`, `'invalid'`, `'expired'`, or `'blacklisted'`
   */
  incrementTokenValidation(
    status: 'valid' | 'invalid' | 'expired' | 'blacklisted',
  ): void {
    this.tokenValidationCounter.inc({ status });
  }

  /* ---------- Account Locked ---------- */

  /** Increment the account-locked counter by one. */
  incrementAccountLocked(): void {
    this.accountLockedCounter.inc();
  }

  /* ---------- Active Sessions ---------- */

  /**
   * Set the active-sessions gauge to an absolute value.
   *
   * @param count - Current number of active sessions
   */
  setActiveSessions(count: number): void {
    this.activeSessionsGauge.set(count);
  }

  /** Increment active sessions by one (e.g. on login). */
  incrementActiveSessions(): void {
    this.activeSessionsGauge.inc();
  }

  /** Decrement active sessions by one (e.g. on logout). */
  decrementActiveSessions(): void {
    this.activeSessionsGauge.dec();
  }

  /* ---------- Request Duration ---------- */

  /**
   * Record an HTTP request duration observation.
   *
   * @param labels - `{ method, route, status_code }`
   * @param durationSeconds - Elapsed time in seconds
   */
  observeRequestDuration(
    labels: { method: string; route: string; status_code: string },
    durationSeconds: number,
  ): void {
    this.requestDurationHistogram.observe(labels, durationSeconds);
  }

  /**
   * Start a timer for an HTTP request. Call the returned function with the
   * remaining labels when the request completes.
   *
   * @param labels - Partial labels known at request start (`method`, `route`)
   * @returns A function that stops the timer and records the observation.
   *          Pass `{ status_code }` when invoking it.
   */
  startRequestTimer(labels: {
    method: string;
    route: string;
  }): (endLabels: { status_code: string }) => number {
    return this.requestDurationHistogram.startTimer(labels);
  }

  /* ---------- Redis Operations ---------- */

  /**
   * Record a Redis operation duration observation.
   *
   * @param operation - Name of the Redis command (e.g. `'get'`, `'set'`, `'del'`)
   * @param durationSeconds - Elapsed time in seconds
   */
  observeRedisOperationDuration(
    operation: string,
    durationSeconds: number,
  ): void {
    this.redisOperationHistogram.observe({ operation }, durationSeconds);
  }

  /**
   * Start a timer for a Redis operation.
   *
   * @param operation - Name of the Redis command
   * @returns A function that stops the timer and records the observation
   */
  startRedisOperationTimer(operation: string): () => number {
    return this.redisOperationHistogram.startTimer({ operation });
  }

  /* ---------- RabbitMQ Publish ---------- */

  /**
   * Increment the RabbitMQ publish counter.
   *
   * @param eventType - The event type being published (e.g. `'user.created'`)
   * @param status - `'success'` or `'failure'`
   */
  incrementRabbitmqPublish(
    eventType: string,
    status: 'success' | 'failure',
  ): void {
    this.rabbitmqPublishCounter.inc({ event_type: eventType, status });
  }
}

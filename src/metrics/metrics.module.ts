/**
 * @file metrics.module.ts
 * @description NestJS module that bootstraps Prometheus metrics collection for
 *              the Auth Service. On initialisation it registers the default
 *              Node.js process metrics (CPU, memory, event-loop lag, etc.) via
 *              prom-client and wires up the {@link MetricsController} and
 *              {@link MetricsService}.
 *
 *              Import this module in `AppModule` to enable the `/metrics`
 *              endpoint and inject `MetricsService` into any provider.
 * @module metrics/metrics-module
 */

import { Module, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Provides Prometheus observability for the Auth Service.
 *
 * - Registers prom-client default metrics on module initialisation.
 * - Exposes `GET /metrics` via {@link MetricsController}.
 * - Exports {@link MetricsService} so other modules can record custom metrics.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule implements OnModuleInit {
  /**
   * Called once the host module has been initialised.
   * Registers prom-client's default Node.js metrics (GC, memory, CPU, etc.).
   */
  onModuleInit(): void {
    client.collectDefaultMetrics();
  }
}

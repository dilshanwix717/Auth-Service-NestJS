/**
 * @file metrics.controller.ts
 * @description Controller that exposes the Prometheus-compatible `/metrics`
 *              endpoint. The endpoint is marked with `@PublicInternal()` so it
 *              bypasses the InternalApiKeyGuard — Prometheus scrapers do not
 *              send an API key.
 * @module metrics/metrics-controller
 */

import { Controller, Get, Header } from '@nestjs/common';
import * as client from 'prom-client';
import { PublicInternal } from '../decorators/public-internal.decorator';

/**
 * Serves collected Prometheus metrics over HTTP.
 *
 * @example
 * ```
 * GET /metrics
 * # HELP auth_login_total Total number of login attempts
 * # TYPE auth_login_total counter
 * auth_login_total{status="success"} 42
 * ```
 */
@Controller('metrics')
export class MetricsController {
  /**
   * Return all registered Prometheus metrics in the exposition format.
   *
   * @returns Prometheus text exposition string
   */
  @PublicInternal()
  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }
}

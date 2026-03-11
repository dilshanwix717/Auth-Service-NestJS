/**
 * @file health.controller.ts
 * @description Health check controller — exposes liveness and readiness probes
 *   for Kubernetes / container orchestration. All endpoints bypass API key
 *   validation via the @PublicInternal() decorator.
 * @module controllers/health
 */

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { HealthService } from '../services/health.service';

import { PublicInternal } from '../decorators/public-internal.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe — indicates the service process is running.
   * Always returns HTTP 200 with { status: 'ok' }.
   * @returns Simple status object
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @PublicInternal()
  @ApiOperation({ summary: 'Liveness probe — confirms the service is running' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  async live(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  /**
   * Readiness probe — checks whether the service and its dependencies
   * (database, Redis, etc.) are ready to accept traffic.
   * @returns Health check result with individual dependency statuses
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @PublicInternal()
  @ApiOperation({ summary: 'Readiness probe — checks service and dependency health' })
  @ApiResponse({ status: 200, description: 'Service is ready and all dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'Service or one or more dependencies are unhealthy' })
  async ready(): Promise<any> {
    return this.healthService.checkHealth();
  }
}

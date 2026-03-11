/**
 * @file health-check.interface.ts
 * @description Health-check response structure for the Auth Service.
 *
 * The `/health` endpoint returns a `HealthCheckResult` so that orchestrators
 * (Kubernetes liveness/readiness probes, load balancers) can determine whether
 * the service and its dependencies are operational. Individual dependency checks
 * include latency measurements to aid in diagnosing performance degradation.
 */

export interface HealthCheckResult {
  /** Aggregate service status derived from individual dependency checks. */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /** Per-dependency health details. */
  checks: {
    postgresql: { status: 'up' | 'down'; latencyMs: number };
    redis: { status: 'up' | 'down'; latencyMs: number };
    rabbitmq: { status: 'up' | 'down'; latencyMs: number };
  };

  /** Process uptime in seconds. */
  uptime: number;

  /** ISO-8601 timestamp of when the check was performed. */
  timestamp: string;
}

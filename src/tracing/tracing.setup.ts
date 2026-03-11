/**
 * @file tracing.setup.ts
 * @description OpenTelemetry tracing bootstrap for the Auth Service. Must be
 *              called **before** NestJS creates the application so the
 *              auto-instrumentations can monkey-patch HTTP and Express before
 *              any modules are loaded.
 *
 *              If the tracing SDK fails to initialise (e.g. missing collector)
 *              the error is logged as a warning and the application continues
 *              without distributed tracing — observability should never prevent
 *              the service from starting.
 * @module tracing/tracing-setup
 *
 * @example
 * ```typescript
 * // main.ts
 * import { setupTracing } from './tracing/tracing.setup';
 * setupTracing();
 *
 * async function bootstrap() { … }
 * bootstrap();
 * ```
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

/** Singleton reference so the SDK can be shut down gracefully if needed. */
let sdk: NodeSDK | undefined;

/**
 * Initialise the OpenTelemetry Node SDK with OTLP export and
 * auto-instrumentation for HTTP and Express.
 *
 * Configuration is driven by environment variables:
 * - `AUTH_SERVICE_NAME`             — logical service name (default `'auth-service'`)
 * - `OTEL_EXPORTER_OTLP_ENDPOINT`  — collector endpoint   (default `'http://localhost:4318'`)
 *
 * @returns The initialised {@link NodeSDK} instance, or `undefined` if setup failed.
 */
export function setupTracing(): NodeSDK | undefined {
  try {
    const serviceName =
      process.env.AUTH_SERVICE_NAME ?? 'auth-service';
    const otlpEndpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

    const traceExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    });

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '1.0.0',
      }),
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable noisy FS instrumentation — we only care about HTTP / Express
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();

    // Graceful shutdown — flush pending spans before the process exits
    process.on('SIGTERM', async () => {
      try {
        await sdk?.shutdown();
      } catch (shutdownError) {
        console.warn(
          '[tracing] Error during OpenTelemetry SDK shutdown:',
          shutdownError,
        );
      }
    });

    console.log(
      `[tracing] OpenTelemetry initialised — service="${serviceName}" endpoint="${otlpEndpoint}"`,
    );

    return sdk;
  } catch (error) {
    console.warn(
      '[tracing] Failed to initialise OpenTelemetry — the application will continue without distributed tracing.',
      error,
    );
    return undefined;
  }
}

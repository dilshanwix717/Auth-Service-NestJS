/**
 * @file main.ts
 * @description Application entry point for the Auth Service. Bootstraps the NestJS
 * application with global configuration including pipes, filters, interceptors,
 * compression, Swagger documentation, and graceful shutdown.
 *
 * Architecture Role: Application Bootstrap — configures the runtime environment
 * and starts the HTTP server.
 *
 * Startup sequence:
 * 1. Create NestJS application from AppModule
 * 2. Enable CORS (for internal service communication)
 * 3. Apply Helmet for secure HTTP headers
 * 4. Apply compression for response size reduction
 * 5. Configure Swagger documentation at /api-docs
 * 6. Enable graceful shutdown hooks
 * 7. Start listening on configured port
 */

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger.config';
import { logger } from './utils/logger.util';

async function bootstrap(): Promise<void> {
  // Create the NestJS application
  const app = await NestFactory.create(AppModule, {
    // Use Winston logger instead of NestJS default console logger
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3001);
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  // ---------- Security: Helmet ----------
  // Sets secure HTTP headers to protect against common web vulnerabilities:
  // - X-Content-Type-Options: nosniff (prevents MIME sniffing)
  // - X-Frame-Options: DENY (prevents clickjacking)
  // - Strict-Transport-Security (enforces HTTPS)
  app.use(helmet());

  // ---------- Performance: Compression ----------
  // Compresses response bodies for all requests to reduce bandwidth
  app.use(compression());

  // ---------- CORS ----------
  // Enable CORS for internal service communication
  // In production, restrict to specific origins
  app.enableCors({
    origin: nodeEnv === 'production' ? false : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Internal-API-Key',
      'X-Request-ID',
      'X-User-Id',
      'X-User-Roles',
    ],
  });

  // ---------- Swagger Documentation ----------
  // Available at /api-docs (internal use only)
  if (nodeEnv !== 'production') {
    setupSwagger(app);
    logger.info('Swagger documentation available at /api-docs');
  }

  // ---------- Graceful Shutdown ----------
  // Enable shutdown hooks for clean resource cleanup:
  // - Close database connections
  // - Close Redis connections
  // - Close RabbitMQ channels
  // - Wait for in-flight requests to complete
  app.enableShutdownHooks();

  // ---------- Start Server ----------
  await app.listen(port);

  logger.info(`Auth Service started successfully`, {
    port,
    environment: nodeEnv,
    pid: process.pid,
  });
}

// Handle unhandled promise rejections globally
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Handle uncaught exceptions globally
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  // Exit with failure code — let process manager restart the service
  process.exit(1);
});

bootstrap();

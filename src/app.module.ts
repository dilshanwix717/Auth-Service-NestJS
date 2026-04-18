/**
 * @file app.module.ts
 * @description Root module for the Auth Service. Imports and configures all feature
 * modules, database connections, and cross-cutting concerns.
 *
 * Architecture Role: Application Composition Root — wires together all layers:
 * - ConfigModule: Environment validation and typed configuration
 * - TypeOrmModule: PostgreSQL connection with entity registration
 * - ScheduleModule: Cron job scheduling for cleanup tasks
 * - ThrottlerModule: Rate limiting for brute-force protection
 *
 * All controllers, services, repositories, clients, jobs, guards, interceptors,
 * filters, and middlewares are registered here.
 */

import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

// Configuration
import { validate } from './config/env.validation';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import rabbitmqConfig from './config/rabbitmq.config';
import securityConfig from './config/security.config';
import rateLimitConfig from './config/rate-limit.config';

// Entities
import { UserCredential } from './entities/user-credential.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Role } from './entities/role.entity';
import { AuditLog } from './entities/audit-log.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';

// Repositories
import { UserCredentialRepository } from './repositories/user-credential.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { RoleRepository } from './repositories/role.repository';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository';

// Clients (Integration Layer)
import { RedisClient } from './clients/redis.client';
import { RabbitMQClient } from './clients/rabbitmq.client';

// Services (Business Logic Layer)
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { CredentialService } from './services/credential.service';
import { BlacklistService } from './services/blacklist.service';
import { SessionService } from './services/session.service';
import { RoleService } from './services/role.service';
import { AccountService } from './services/account.service';
import { EventService } from './services/event.service';
import { HealthService } from './services/health.service';

// Controllers (Presentation Layer)
import { AuthController } from './controllers/auth.controller';
import { TokenController } from './controllers/token.controller';
import { RoleController } from './controllers/role.controller';
import { AccountController } from './controllers/account.controller';
import { HealthController } from './controllers/health.controller';

// Scheduled Jobs
import { ExpiredRefreshTokenCleanupJob } from './jobs/expired-refresh-token-cleanup.job';
import { ExpiredPasswordResetCleanupJob } from './jobs/expired-password-reset-cleanup.job';
import { UnlockExpiredLockoutsJob } from './jobs/unlock-expired-lockouts.job';

// Cross-Cutting Concerns
import { ApiKeyMiddleware } from './middlewares/api-key.middleware';
import { LoggingMiddleware } from './middlewares/logging.middleware';
import { InternalApiKeyGuard } from './guards/internal-api-key.guard';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { TypeOrmExceptionFilter } from './filters/typeorm-exception.filter';
import { CustomValidationPipe } from './pipes/validation.pipe';

@Module({
  imports: [
    // ---------- Configuration ----------
    // Load and validate all environment variables on startup (fail-fast)
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [
        appConfig,
        jwtConfig,
        databaseConfig,
        redisConfig,
        rabbitmqConfig,
        securityConfig,
        rateLimitConfig,
      ],
    }),

    // ---------- Database ----------
    // TypeORM with PostgreSQL, configured from environment variables
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        ssl: configService.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
        entities: [UserCredential, RefreshToken, Role, AuditLog, PasswordResetToken],
        // Use synchronize only in development — use migrations in production
        synchronize: configService.get<string>('app.nodeEnv') === 'development',
        // Connection pool settings
        extra: {
          min: configService.get<number>('database.poolMin', 2),
          max: configService.get<number>('database.poolMax', 10),
          idleTimeoutMillis: 30000,
        },
        // Log slow queries in development
        logging: configService.get<string>('app.nodeEnv') === 'development' ? ['query', 'error'] : ['error'],
      }),
    }),

    // Register entities for repository injection
    TypeOrmModule.forFeature([
      UserCredential,
      RefreshToken,
      Role,
      AuditLog,
      PasswordResetToken,
    ]),

    // ---------- Scheduled Jobs ----------
    ScheduleModule.forRoot(),

    // ---------- Rate Limiting ----------
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ([{
        ttl: configService.get<number>('rateLimit.general.ttlSeconds', 60) * 1000,
        limit: configService.get<number>('rateLimit.general.maxRequests', 60),
      }]),
    }),
  ],

  controllers: [
    AuthController,
    TokenController,
    RoleController,
    AccountController,
    HealthController,
  ],

  providers: [
    // Repositories
    UserCredentialRepository,
    RefreshTokenRepository,
    RoleRepository,
    AuditLogRepository,
    PasswordResetTokenRepository,

    // Integration Clients
    RedisClient,
    RabbitMQClient,

    // Services
    AuthService,
    TokenService,
    CredentialService,
    BlacklistService,
    SessionService,
    RoleService,
    AccountService,
    EventService,
    HealthService,

    // Scheduled Jobs
    ExpiredRefreshTokenCleanupJob,
    ExpiredPasswordResetCleanupJob,
    UnlockExpiredLockoutsJob,

    // Global Guard: Enforce internal API key on all routes (except @PublicInternal)
    {
      provide: APP_GUARD,
      useClass: InternalApiKeyGuard,
    },

    // Global Interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },

    // Global Exception Filters (order matters: most specific first)
    {
      provide: APP_FILTER,
      useClass: TypeOrmExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // Global Validation Pipe
    {
      provide: APP_PIPE,
      useClass: CustomValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Configure middleware for all routes.
   * Middleware execution order: LoggingMiddleware → ApiKeyMiddleware → Guards → Interceptors
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LoggingMiddleware)
      .forRoutes('*');
    consumer
      .apply(ApiKeyMiddleware)
      .exclude('health/(.*)', 'health')
      .forRoutes('*');
  }
}

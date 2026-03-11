/**
 * Database (PostgreSQL / TypeORM) Configuration Namespace
 *
 * Registers the 'database' configuration namespace with NestJS ConfigModule
 * AND exports a standalone DataSource instance for TypeORM CLI migrations.
 *
 * NestJS modules should inject the namespace config:
 *   @Inject(databaseConfig.KEY) or configService.get('database')
 *
 * The CLI DataSource (`AppDataSource`) is consumed by typeorm CLI commands:
 *   npx typeorm migration:run -d dist/config/database.config.js
 */

import { registerAs } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as path from 'path';

/** Build the TypeORM-compatible options object from environment variables. */
function buildDataSourceOptions(): PostgresConnectionOptions {
  return {
    /** Database engine */
    type: 'postgres',

    /** PostgreSQL server hostname or IP */
    host: process.env.DB_HOST ?? 'localhost',

    /** PostgreSQL server port */
    port: parseInt(process.env.DB_PORT ?? '5432', 10),

    /** Database login username */
    username: process.env.DB_USERNAME ?? 'postgres',

    /** Database login password */
    password: process.env.DB_PASSWORD ?? '',

    /** Name of the target PostgreSQL database */
    database: process.env.DB_NAME ?? 'auth',

    /** Enforce TLS when connecting (required for most cloud-hosted DBs) */
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,

    /** Auto-load all entity files discovered via the glob pattern */
    entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],

    /** Auto-load all migration files discovered via the glob pattern */
    migrations: [path.join(__dirname, '..', 'migrations', '*.{ts,js}')],

    /** Never auto-sync in production – use explicit migrations instead */
    synchronize: false,

    /** Log slow queries and errors for operational visibility */
    logging: process.env.NODE_ENV !== 'production' ? ['query', 'error'] : ['error'],

    /** Connection pool configuration */
    extra: {
      /** Minimum connections kept alive in the pool */
      min: parseInt(process.env.DB_POOL_MIN ?? '2', 10),
      /** Maximum connections the pool may open */
      max: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
    },
  };
}

/**
 * NestJS config namespace registration.
 * Provides typed access to DB settings throughout the application.
 */
const databaseConfig = registerAs('database', () => {
  const opts = buildDataSourceOptions();
  return {
    /** PostgreSQL server hostname or IP */
    host: opts.host,
    /** PostgreSQL server port */
    port: opts.port,
    /** Database login username */
    username: opts.username,
    /** Database login password */
    password: opts.password,
    /** Name of the PostgreSQL database */
    database: opts.database,
    /** SSL connection flag / options */
    ssl: opts.ssl,
    /** Minimum pool connections */
    poolMin: parseInt(process.env.DB_POOL_MIN ?? '2', 10),
    /** Maximum pool connections */
    poolMax: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
    /** Full TypeORM DataSourceOptions – pass directly to TypeOrmModule */
    typeOrmOptions: opts,
  };
});

export default databaseConfig;

/**
 * Standalone DataSource for TypeORM CLI commands (migrations, seeding).
 *
 * Usage:
 *   npx typeorm migration:generate -d dist/config/database.config.js -n MigrationName
 *   npx typeorm migration:run -d dist/config/database.config.js
 */
export const AppDataSource = new DataSource(buildDataSourceOptions());

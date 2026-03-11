/**
 * RabbitMQ Configuration Namespace
 *
 * Registers the 'rabbitmq' configuration namespace with NestJS ConfigModule.
 * Provides connection and channel settings for the RabbitMQ broker used to
 * publish auth domain events (user.registered, password.changed, etc.)
 * via the amqplib library.
 *
 * Inject via: @Inject(rabbitmqConfig.KEY) or configService.get('rabbitmq')
 */

import { registerAs } from '@nestjs/config';

const rabbitmqConfig = registerAs('rabbitmq', () => ({
  /** AMQP connection URL (e.g. amqp://guest:guest@localhost:5672) */
  url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',

  /** Topic exchange name for publishing auth domain events */
  exchange: process.env.RABBITMQ_EXCHANGE ?? 'auth.events',

  /** Max unacknowledged messages a consumer may hold – controls back-pressure */
  prefetchCount: parseInt(process.env.RABBITMQ_PREFETCH_COUNT ?? '10', 10),

  /** AMQP heartbeat interval in seconds – detects dead connections */
  heartbeatInterval: parseInt(
    process.env.RABBITMQ_HEARTBEAT_INTERVAL ?? '60',
    10,
  ),
}));

export default rabbitmqConfig;

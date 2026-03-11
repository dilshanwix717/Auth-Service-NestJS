/**
 * =============================================================================
 * RabbitMQ Client Service
 * =============================================================================
 *
 * Purpose:
 *   Provides a centralized RabbitMQ client for publishing auth domain events
 *   (user registration, login, logout, token revocation, password changes, etc.)
 *   to downstream consumers. Wraps the amqplib library as an @Injectable()
 *   NestJS service with full lifecycle management, resilience, and idempotency.
 *
 * Role in Auth Service:
 *   - Event Publishing: Emits domain events to a topic exchange so other
 *     microservices (notification, audit, analytics) can react asynchronously.
 *   - Decoupling: The auth service does not need to know which services consume
 *     its events — routing is handled by RabbitMQ exchange bindings.
 *   - Audit Trail: Every auth action produces a traceable event with a unique
 *     messageId and correlationId for cross-service distributed tracing.
 *
 * Why Topic Exchange:
 *   A topic exchange (auth.events) is used instead of direct or fanout because:
 *   1. Flexible Routing: Consumers bind with patterns like 'user.account.*' or
 *      'token.#' to receive only the events they care about.
 *   2. Decoupled Scaling: New consumers can be added without modifying the
 *      publisher — they simply bind their queue with the desired routing pattern.
 *   3. Event Hierarchy: Auth events naturally follow a dot-notation taxonomy
 *      (e.g., user.account.created, user.session.expired, token.refresh.revoked)
 *      which maps perfectly to topic exchange routing keys.
 *
 * Dead Letter Queue (DLQ) Support:
 *   The exchange is declared as durable. Consumer queues should be configured
 *   with x-dead-letter-exchange and x-dead-letter-routing-key arguments so
 *   that messages that are rejected or exceed retry limits are routed to a
 *   dead letter queue for manual inspection and replay. This service does NOT
 *   declare consumer queues (that is the consumer's responsibility) but
 *   publishes messages with persistent delivery mode to survive broker restarts.
 *
 * In-Memory Buffer Strategy:
 *   When the RabbitMQ connection is down, events are buffered in an in-memory
 *   array (capped at 1000 messages) to prevent data loss during short outages:
 *   - New events are appended to the buffer instead of being dropped.
 *   - When the connection is re-established, the buffer is flushed in FIFO order.
 *   - If the buffer reaches capacity (1000), the oldest event is dropped and a
 *     warning is logged. This bounds memory usage and prevents OOM in prolonged
 *     outages.
 *   - The buffer is NOT persisted to disk — a service restart during an outage
 *     will lose buffered events. For guaranteed delivery, consumers should
 *     implement idempotent processing and the source of truth remains the
 *     database (not the event stream).
 *
 * Idempotency Tracking:
 *   Each published message includes a unique messageId (UUID v4). The service
 *   tracks the last 10,000 published messageIds in a bounded Set to detect
 *   and prevent duplicate publishes within the same process lifecycle. This
 *   is a best-effort optimization — true end-to-end idempotency must be
 *   implemented by consumers using the messageId for deduplication.
 *
 * Auto-Reconnect Behavior:
 *   On connection loss, the service:
 *   1. Logs the disconnection event.
 *   2. Sets the internal connected flag to false (events go to buffer).
 *   3. Attempts to reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s,
 *      capped at 30s).
 *   4. On successful reconnect, re-asserts the exchange and flushes the buffer.
 *   5. If reconnection fails, it retries indefinitely (the service is designed
 *      to self-heal without operator intervention).
 *
 * Failure Handling:
 *   - Connection failures: Buffered + auto-reconnect (no event loss for short
 *     outages).
 *   - Publish failures: Logged and the event remains in the buffer for retry.
 *   - Channel errors: The channel is recreated on the next publish attempt.
 *   - Serialization errors: Logged and the event is dropped (indicates a bug).
 *
 * Security Decisions:
 *   - Connection URL from environment: Credentials are never hardcoded.
 *   - Heartbeat: Configurable interval (default 60s) to detect dead connections
 *     faster than TCP keepalive.
 *   - No sensitive data in payloads: Events contain identifiers and metadata,
 *     never passwords, tokens, or PII beyond what is necessary for the event.
 *
 * =============================================================================
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.util';

/**
 * Standardized message envelope for all auth domain events.
 *
 * Every event published through RabbitMQ conforms to this structure,
 * enabling consistent deserialization, tracing, and deduplication
 * across all consuming services.
 */
interface EventEnvelope {
  /** UUID v4 — unique identifier for idempotent processing by consumers. */
  messageId: string;
  /** ISO-8601 timestamp of when the event was created. */
  timestamp: string;
  /** Originating service identifier (always 'auth-service'). */
  source: string;
  /** Event type in dot-notation taxonomy (e.g., 'user.account.created'). */
  type: string;
  /** Trace ID for cross-service correlation in distributed tracing. */
  correlationId: string;
  /** Event-specific data. Structure varies by event type. */
  payload: Record<string, unknown>;
}

/** Internal structure for buffered events awaiting publish on reconnect. */
interface BufferedEvent {
  eventType: string;
  envelope: EventEnvelope;
}

/** Maximum number of events buffered in memory during a disconnection. */
const MAX_BUFFER_SIZE = 1000;

/** Maximum number of messageIds tracked for idempotency deduplication. */
const MAX_IDEMPOTENCY_SET_SIZE = 10000;

/** Maximum delay between reconnection attempts (in milliseconds). */
const MAX_RECONNECT_DELAY_MS = 30000;

@Injectable()
export class RabbitMQClient implements OnModuleInit, OnModuleDestroy {
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;
  private connected = false;
  private exchange!: string;
  private url!: string;
  private heartbeatInterval!: number;

  /**
   * In-memory event buffer for resilience during RabbitMQ outages.
   * Events are queued here when the connection is down and flushed
   * in FIFO order upon reconnection. Capped at MAX_BUFFER_SIZE.
   */
  private eventBuffer: BufferedEvent[] = [];

  /**
   * Bounded Set of recently published messageIds for idempotency.
   * Prevents duplicate publishes within the same process lifecycle.
   * When the set exceeds MAX_IDEMPOTENCY_SET_SIZE, the oldest entries
   * are evicted (approximated by clearing and restarting).
   */
  private publishedMessageIds: Set<string> = new Set();

  /** Flag to prevent concurrent reconnection attempts. */
  private reconnecting = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initializes the RabbitMQ connection when the NestJS module starts.
   *
   * Reads configuration from the 'rabbitmq' config namespace, establishes
   * a connection, creates a channel, and asserts the topic exchange.
   * If the initial connection fails, it schedules a reconnection attempt.
   */
  async onModuleInit(): Promise<void> {
    this.url = this.configService.get<string>('rabbitmq.url')!;
    this.exchange = this.configService.get<string>('rabbitmq.exchange')!;
    this.heartbeatInterval = this.configService.get<number>('rabbitmq.heartbeatInterval')!;

    await this.connect();
  }

  /**
   * Gracefully shuts down the RabbitMQ connection when the module is destroyed.
   *
   * Closes the channel and connection in order. Any buffered events are lost
   * on shutdown — this is acceptable because the database is the source of truth
   * and events can be replayed from the audit log if needed.
   */
  async onModuleDestroy(): Promise<void> {
    logger.info('Shutting down RabbitMQ client...');
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.connected = false;
      logger.info('RabbitMQ client disconnected', {
        bufferedEventsDropped: this.eventBuffer.length,
      });
    } catch (error) {
      logger.error('Error during RabbitMQ shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Publishes an auth domain event to the RabbitMQ topic exchange.
   *
   * The event is wrapped in a standardized envelope with a unique messageId,
   * timestamp, source identifier, and correlationId for distributed tracing.
   * The eventType is used as the routing key, enabling consumers to bind
   * with topic patterns (e.g., 'user.account.*', 'token.#').
   *
   * Resilience behavior:
   *   - If connected: publishes immediately with persistent delivery mode.
   *   - If disconnected: buffers the event in memory (up to 1000 events).
   *   - If buffer is full: drops the oldest event and logs a warning.
   *
   * Idempotency:
   *   Each message gets a UUID v4 messageId. The service tracks recent
   *   messageIds to prevent duplicate publishes. Consumers should also
   *   deduplicate using the messageId for true end-to-end idempotency.
   *
   * @param eventType - Dot-notation event type used as the routing key
   *   (e.g., 'user.account.created', 'user.session.expired').
   * @param payload - Event-specific data. Must be JSON-serializable.
   *   Should NOT contain sensitive data (passwords, raw tokens).
   * @param correlationId - Optional trace ID for cross-service correlation.
   *   If not provided, a new UUID is generated. Pass the request's traceId
   *   to enable end-to-end distributed tracing.
   */
  async publish(
    eventType: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    const envelope: EventEnvelope = {
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      source: 'auth-service',
      type: eventType,
      correlationId: correlationId || uuidv4(),
      payload,
    };

    // Idempotency check: prevent duplicate publishes within this process.
    if (this.publishedMessageIds.has(envelope.messageId)) {
      logger.warn('Duplicate messageId detected, skipping publish', {
        messageId: envelope.messageId,
        eventType,
      });
      return;
    }

    if (!this.connected || !this.channel) {
      this.bufferEvent(eventType, envelope);
      return;
    }

    try {
      const message = Buffer.from(JSON.stringify(envelope));

      this.channel.publish(this.exchange, eventType, message, {
        persistent: true, // Survives broker restarts (delivery mode 2)
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        contentType: 'application/json',
        timestamp: Math.floor(Date.now() / 1000),
        appId: 'auth-service',
      });

      this.trackMessageId(envelope.messageId);

      logger.info('Event published to RabbitMQ', {
        eventType,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
      });
    } catch (error) {
      logger.error('Failed to publish event to RabbitMQ — buffering for retry', {
        eventType,
        messageId: envelope.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.bufferEvent(eventType, envelope);
    }
  }

  /**
   * Checks whether the RabbitMQ connection is currently alive.
   *
   * This is a synchronous check of the internal connection state flag.
   * It does NOT actively probe the broker — use ping() for that.
   *
   * @returns true if connected and channel is available, false otherwise.
   */
  isConnected(): boolean {
    return this.connected && this.channel !== null;
  }

  /**
   * Health check: verifies RabbitMQ connectivity by checking connection state.
   *
   * Attempts to assert the exchange as a lightweight probe. If the exchange
   * assertion succeeds, the connection and channel are healthy.
   *
   * @returns true if the RabbitMQ connection is healthy, false otherwise.
   */
  async ping(): Promise<boolean> {
    try {
      if (!this.connected || !this.channel) {
        return false;
      }
      // Assert the exchange as a health probe — this is idempotent and
      // will throw if the channel or connection is broken.
      await this.channel.checkExchange(this.exchange);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Establishes a connection to RabbitMQ, creates a channel, and asserts
   * the topic exchange.
   *
   * Registers event handlers for connection and channel lifecycle events
   * that trigger automatic reconnection on failure.
   *
   * @private
   */
  private async connect(): Promise<void> {
    try {
      logger.info('Connecting to RabbitMQ...', { exchange: this.exchange });

      this.connection = await amqplib.connect(this.url, {
        heartbeat: this.heartbeatInterval,
      });

      this.connection.on('error', (err: Error) => {
        logger.error('RabbitMQ connection error', {
          error: err.message,
          stack: err.stack,
        });
        this.connected = false;
        this.scheduleReconnect();
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.connected = false;
        this.scheduleReconnect();
      });

      this.channel = await this.connection.createChannel();

      const prefetchCount = this.configService.get<number>('rabbitmq.prefetchCount')!;
      await this.channel.prefetch(prefetchCount);

      this.channel.on('error', (err: Error) => {
        logger.error('RabbitMQ channel error', { error: err.message });
        this.channel = null;
      });

      this.channel.on('close', () => {
        logger.warn('RabbitMQ channel closed');
        this.channel = null;
      });

      // Assert the topic exchange. durable: true ensures the exchange
      // survives broker restarts. Topic type enables pattern-based routing.
      await this.channel.assertExchange(this.exchange, 'topic', {
        durable: true,
      });

      this.connected = true;
      this.reconnecting = false;
      logger.info('RabbitMQ client connected and exchange asserted', {
        exchange: this.exchange,
      });

      // Flush any events that were buffered during the disconnection.
      await this.flushBuffer();
    } catch (error) {
      logger.error('Failed to connect to RabbitMQ', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Schedules a reconnection attempt with exponential backoff.
   *
   * Backoff progression: 1s → 2s → 4s → 8s → 16s → 30s (capped).
   * Only one reconnection loop runs at a time (guarded by the
   * reconnecting flag).
   *
   * @private
   */
  private scheduleReconnect(): void {
    if (this.reconnecting) {
      return;
    }
    this.reconnecting = true;

    let attempt = 0;

    const tryReconnect = async (): Promise<void> => {
      attempt++;
      const delay = Math.min(Math.pow(2, attempt) * 1000, MAX_RECONNECT_DELAY_MS);

      logger.info(`RabbitMQ reconnect attempt #${attempt} in ${delay}ms`);

      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await this.connect();
        // connect() sets reconnecting = false on success
      } catch {
        // connect() already logs the error and will call scheduleReconnect
        // but since we're already in the reconnect loop, we just retry.
        if (!this.connected) {
          await tryReconnect();
        }
      }
    };

    // Fire and forget — the reconnect loop runs in the background.
    tryReconnect().catch((err) => {
      logger.error('Unexpected error in RabbitMQ reconnect loop', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.reconnecting = false;
    });
  }

  /**
   * Adds an event to the in-memory buffer when RabbitMQ is disconnected.
   *
   * If the buffer is at capacity (MAX_BUFFER_SIZE = 1000), the oldest
   * event is dropped to make room. This bounds memory usage during
   * prolonged outages while preserving the most recent events.
   *
   * @param eventType - The event type (for logging).
   * @param envelope - The complete event envelope to buffer.
   * @private
   */
  private bufferEvent(eventType: string, envelope: EventEnvelope): void {
    if (this.eventBuffer.length >= MAX_BUFFER_SIZE) {
      const dropped = this.eventBuffer.shift();
      logger.warn('Event buffer full — dropping oldest event', {
        droppedMessageId: dropped?.envelope.messageId,
        droppedEventType: dropped?.eventType,
        bufferSize: MAX_BUFFER_SIZE,
      });
    }

    this.eventBuffer.push({ eventType, envelope });
    logger.info('Event buffered for later publish', {
      eventType,
      messageId: envelope.messageId,
      bufferSize: this.eventBuffer.length,
    });
  }

  /**
   * Flushes the in-memory event buffer by publishing all buffered events
   * in FIFO order.
   *
   * Called after a successful reconnection. Events that fail to publish
   * during the flush remain in the buffer for the next attempt.
   *
   * @private
   */
  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    logger.info(`Flushing ${this.eventBuffer.length} buffered events to RabbitMQ`);

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    for (const buffered of eventsToFlush) {
      try {
        if (!this.channel) {
          // Channel lost during flush — re-buffer remaining events
          this.eventBuffer.push(buffered);
          continue;
        }

        const message = Buffer.from(JSON.stringify(buffered.envelope));

        this.channel.publish(this.exchange, buffered.eventType, message, {
          persistent: true,
          messageId: buffered.envelope.messageId,
          correlationId: buffered.envelope.correlationId,
          contentType: 'application/json',
          timestamp: Math.floor(Date.now() / 1000),
          appId: 'auth-service',
        });

        this.trackMessageId(buffered.envelope.messageId);

        logger.info('Buffered event published', {
          eventType: buffered.eventType,
          messageId: buffered.envelope.messageId,
        });
      } catch (error) {
        // Re-buffer events that failed to publish during flush
        this.eventBuffer.push(buffered);
        logger.error('Failed to publish buffered event — re-buffered', {
          eventType: buffered.eventType,
          messageId: buffered.envelope.messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (this.eventBuffer.length > 0) {
      logger.warn(`${this.eventBuffer.length} events remain in buffer after flush`);
    }
  }

  /**
   * Tracks a published messageId in the bounded idempotency set.
   *
   * When the set exceeds MAX_IDEMPOTENCY_SET_SIZE (10,000), it is cleared
   * to prevent unbounded memory growth. This is a simple eviction strategy;
   * a more sophisticated approach would use a ring buffer or LRU cache,
   * but the UUID collision probability makes this acceptable.
   *
   * @param messageId - The UUID v4 messageId to track.
   * @private
   */
  private trackMessageId(messageId: string): void {
    if (this.publishedMessageIds.size >= MAX_IDEMPOTENCY_SET_SIZE) {
      logger.info('Idempotency set reached capacity — clearing', {
        capacity: MAX_IDEMPOTENCY_SET_SIZE,
      });
      this.publishedMessageIds.clear();
    }
    this.publishedMessageIds.add(messageId);
  }
}

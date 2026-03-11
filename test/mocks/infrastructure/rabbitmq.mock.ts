/**
 * @file rabbitmq.mock.ts
 * @description Mock RabbitMQ client for standalone testing. Captures published events
 * in an array for assertion in tests, without requiring a real RabbitMQ connection.
 *
 * Architecture Role: Test Infrastructure — replaces the real RabbitMQClient in unit
 * and integration tests to eliminate external RabbitMQ dependency.
 *
 * How it works:
 * - Published events are captured in an array (publishedEvents)
 * - Each captured event includes the full envelope (messageId, type, payload, etc.)
 * - Tests can assert on published events to verify domain event emission
 * - Connection state can be toggled for testing resilience scenarios
 *
 * Usage in tests:
 * ```ts
 * const mockRabbit = new MockRabbitMQClient();
 * // ... trigger some action ...
 * expect(mockRabbit.getPublishedEvents()).toHaveLength(1);
 * expect(mockRabbit.getPublishedEvents()[0].type).toBe('user.account.created');
 * ```
 */

export interface CapturedEvent {
  messageId: string;
  timestamp: string;
  source: string;
  type: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export class MockRabbitMQClient {
  private publishedEvents: CapturedEvent[] = [];
  private connected = true;
  private messageCounter = 0;

  /**
   * Simulate publish — captures the event in memory instead of sending to RabbitMQ.
   * Matches the real client's method signature.
   */
  async publish(
    eventType: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    if (!this.connected) {
      throw new Error('MockRabbitMQ: Not connected');
    }

    this.messageCounter++;
    const event: CapturedEvent = {
      messageId: `mock-msg-${this.messageCounter}`,
      timestamp: new Date().toISOString(),
      source: 'auth-service',
      type: eventType,
      correlationId: correlationId || `mock-trace-${this.messageCounter}`,
      payload,
    };

    this.publishedEvents.push(event);
  }

  /**
   * Simulate isConnected — returns current connection state.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Simulate ping — returns connection state.
   */
  async ping(): Promise<boolean> {
    return this.connected;
  }

  // ==================== Test Helper Methods ====================

  /** Get all published events for assertions */
  getPublishedEvents(): CapturedEvent[] {
    return [...this.publishedEvents];
  }

  /** Get events filtered by type */
  getEventsByType(eventType: string): CapturedEvent[] {
    return this.publishedEvents.filter((e) => e.type === eventType);
  }

  /** Get the most recently published event */
  getLastEvent(): CapturedEvent | undefined {
    return this.publishedEvents[this.publishedEvents.length - 1];
  }

  /** Check if a specific event type was published */
  wasEventPublished(eventType: string): boolean {
    return this.publishedEvents.some((e) => e.type === eventType);
  }

  /** Reset mock state between tests */
  reset(): void {
    this.publishedEvents = [];
    this.messageCounter = 0;
    this.connected = true;
  }

  /** Simulate connection failure */
  setConnected(connected: boolean): void {
    this.connected = connected;
  }
}

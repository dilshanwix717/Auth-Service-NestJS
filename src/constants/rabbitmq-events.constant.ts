/**
 * @file rabbitmq-events.constant.ts
 * @description RabbitMQ event names, exchange, and routing key constants for the Auth Service.
 *
 * Every domain event published by the Auth Service flows through a single topic exchange
 * (`auth.events`). Consumers bind queues using the routing keys defined here.
 * Keeping all event identifiers in one place prevents typos and makes it easy to
 * discover the full catalogue of events the service emits.
 */

export enum RabbitMQEvents {
  USER_ACCOUNT_CREATED = 'user.account.created',
  USER_LOGGED_IN = 'user.logged.in',
  USER_LOGGED_OUT = 'user.logged.out',
  TOKEN_REVOKED = 'token.revoked',
  ALL_TOKENS_REVOKED = 'token.all.revoked',
  ACCOUNT_LOCKED = 'account.locked',
  ACCOUNT_UNLOCKED = 'account.unlocked',
  ACCOUNT_BANNED = 'account.banned',
  CREDENTIALS_DELETED = 'credentials.deleted',
  PASSWORD_RESET_REQUESTED = 'password.reset.requested',
  PASSWORD_RESET_COMPLETED = 'password.reset.completed',
  ROLE_ASSIGNED = 'role.assigned',
  ROLE_REVOKED = 'role.revoked',
  LOGIN_FAILED = 'login.failed',
  SUSPICIOUS_ACTIVITY_DETECTED = 'suspicious.activity.detected',
  EMAIL_CHANGE_REQUESTED = 'email.change.requested',
  EMAIL_CHANGED = 'email.changed',
}

/** Topic exchange all auth events are published to. */
export const RabbitMQExchange = 'auth.events';

/**
 * Routing key constants aligned with the `RabbitMQEvents` enum values.
 * Consumers can bind with wildcards (e.g., `user.*`, `token.#`).
 */
export const RoutingKeys = {
  USER_ACCOUNT_CREATED: RabbitMQEvents.USER_ACCOUNT_CREATED,
  USER_LOGGED_IN: RabbitMQEvents.USER_LOGGED_IN,
  USER_LOGGED_OUT: RabbitMQEvents.USER_LOGGED_OUT,
  TOKEN_REVOKED: RabbitMQEvents.TOKEN_REVOKED,
  ALL_TOKENS_REVOKED: RabbitMQEvents.ALL_TOKENS_REVOKED,
  ACCOUNT_LOCKED: RabbitMQEvents.ACCOUNT_LOCKED,
  ACCOUNT_UNLOCKED: RabbitMQEvents.ACCOUNT_UNLOCKED,
  ACCOUNT_BANNED: RabbitMQEvents.ACCOUNT_BANNED,
  CREDENTIALS_DELETED: RabbitMQEvents.CREDENTIALS_DELETED,
  PASSWORD_RESET_REQUESTED: RabbitMQEvents.PASSWORD_RESET_REQUESTED,
  PASSWORD_RESET_COMPLETED: RabbitMQEvents.PASSWORD_RESET_COMPLETED,
  ROLE_ASSIGNED: RabbitMQEvents.ROLE_ASSIGNED,
  ROLE_REVOKED: RabbitMQEvents.ROLE_REVOKED,
  LOGIN_FAILED: RabbitMQEvents.LOGIN_FAILED,
  SUSPICIOUS_ACTIVITY_DETECTED: RabbitMQEvents.SUSPICIOUS_ACTIVITY_DETECTED,
  EMAIL_CHANGE_REQUESTED: RabbitMQEvents.EMAIL_CHANGE_REQUESTED,
  EMAIL_CHANGED: RabbitMQEvents.EMAIL_CHANGED,
} as const;

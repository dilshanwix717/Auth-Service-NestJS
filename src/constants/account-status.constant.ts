/**
 * @file account-status.constant.ts
 * @description Account lifecycle status definitions for the Auth Service.
 *
 * Every user account transitions through one of these statuses. The enum is used by
 * the User entity, authentication guards, and admin endpoints to determine whether
 * a login attempt should be permitted, denied, or result in a specific error message.
 */

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  BANNED = 'BANNED',
  DELETED = 'DELETED',
}

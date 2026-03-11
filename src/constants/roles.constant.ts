/**
 * @file roles.constant.ts
 * @description Role definitions for the Auth Service RBAC system.
 *
 * Defines the set of roles that can be assigned to user accounts. The `Roles` enum
 * is referenced by guards, decorators, and the role-management service to enforce
 * access control. `DEFAULT_ROLE` specifies the role automatically assigned to
 * newly registered accounts.
 */

export enum Roles {
  USER = 'USER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
}

/** Role assigned to every new account upon registration. */
export const DEFAULT_ROLE = Roles.USER;

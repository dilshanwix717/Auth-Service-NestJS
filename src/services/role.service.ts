/**
 * =============================================================================
 * Role Service — RBAC Role Management
 * =============================================================================
 *
 * @file role.service.ts
 * @description Manages Role-Based Access Control (RBAC) operations: assigning
 *   roles to users, revoking roles, querying user roles, and listing all
 *   available role definitions. Publishes domain events for role changes.
 *
 * Architecture Role: Business Logic Layer — Role Management
 *   Sits between controllers/admin endpoints and the data layer (RoleRepository
 *   for role definitions, UserCredentialRepository for user role assignments).
 *   Coordinates with EventService to publish role change events for downstream
 *   consumers.
 *
 * Request Flow (role assignment):
 *   1. Admin endpoint receives a request to assign a role to a user.
 *   2. Controller calls RoleService.assignRole(userId, role, assignedBy).
 *   3. RoleService validates the role exists in the roles table.
 *   4. RoleService fetches the user's current roles and adds the new one.
 *   5. RoleService updates the user's roles array via UserCredentialRepository.
 *   6. RoleService publishes a ROLE_ASSIGNED event via EventService.
 *
 * Request Flow (role revocation):
 *   1. Admin endpoint receives a request to revoke a role from a user.
 *   2. Controller calls RoleService.revokeRole(userId, role, revokedBy).
 *   3. RoleService removes the role from the user's roles array.
 *   4. RoleService publishes a ROLE_REVOKED event via EventService.
 *
 * Important: After role changes, the caller (typically AdminController) should
 *   also revoke the user's active tokens to force re-authentication with the
 *   updated role claims in the new JWT.
 *
 * =============================================================================
 */

import { Injectable } from '@nestjs/common';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { RoleRepository } from '../repositories/role.repository';
import { Role } from '../entities/role.entity';
import { EventService } from './event.service';
import { ErrorMessages } from '../constants/error-messages.constant';
import { logger } from '../utils/logger.util';
import { generateTraceId } from '../utils/trace-id.util';

@Injectable()
export class RoleService {
  constructor(
    private readonly userCredentialRepository: UserCredentialRepository,
    private readonly roleRepository: RoleRepository,
    private readonly eventService: EventService,
  ) {}

  /**
   * Assigns a role to a user. The role must exist in the roles table.
   * If the user already has the role, this is a no-op (idempotent).
   * Publishes a ROLE_ASSIGNED domain event on success.
   *
   * @param userId - UUID of the user receiving the role
   * @param role - Name of the role to assign (e.g., 'ADMIN', 'MODERATOR')
   * @param assignedBy - UUID of the admin performing the assignment
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when the role has been assigned
   * @throws Error if the user is not found
   * @throws Error if the role does not exist in the roles table
   */
  async assignRole(
    userId: string,
    role: string,
    assignedBy: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    const user = await this.userCredentialRepository.findById(userId);
    if (!user) {
      throw new Error(ErrorMessages.AUTH_USER_NOT_FOUND);
    }

    const roleEntity = await this.roleRepository.findByName(role);
    if (!roleEntity) {
      throw new Error(`Role '${role}' does not exist`);
    }

    // Idempotent: skip if the user already has this role
    if (user.roles.includes(role)) {
      logger.info('Role already assigned — no-op', { userId, role, traceId: trace });
      return;
    }

    const updatedRoles = [...user.roles, role];
    await this.userCredentialRepository.updateRoles(userId, updatedRoles);

    logger.info('Role assigned to user', { userId, role, assignedBy, traceId: trace });

    await this.eventService.publishRoleAssigned(userId, role, assignedBy, trace);
  }

  /**
   * Revokes a role from a user. If the user does not have the role, this is a
   * no-op (idempotent). Publishes a ROLE_REVOKED domain event on success.
   *
   * @param userId - UUID of the user losing the role
   * @param role - Name of the role to revoke (e.g., 'ADMIN')
   * @param revokedBy - UUID of the admin performing the revocation
   * @param traceId - Optional trace ID for distributed tracing; generated if not provided
   * @returns Promise that resolves when the role has been revoked
   * @throws Error if the user is not found
   */
  async revokeRole(
    userId: string,
    role: string,
    revokedBy: string,
    traceId?: string,
  ): Promise<void> {
    const trace = traceId ?? generateTraceId();

    const user = await this.userCredentialRepository.findById(userId);
    if (!user) {
      throw new Error(ErrorMessages.AUTH_USER_NOT_FOUND);
    }

    // Idempotent: skip if the user doesn't have this role
    if (!user.roles.includes(role)) {
      logger.info('Role not present — no-op', { userId, role, traceId: trace });
      return;
    }

    const updatedRoles = user.roles.filter((r) => r !== role);
    await this.userCredentialRepository.updateRoles(userId, updatedRoles);

    logger.info('Role revoked from user', { userId, role, revokedBy, traceId: trace });

    await this.eventService.publishRoleRevoked(userId, role, revokedBy, trace);
  }

  /**
   * Retrieves the current roles assigned to a user.
   *
   * @param userId - UUID of the user whose roles to retrieve
   * @returns Array of role name strings (e.g., ['USER', 'ADMIN'])
   * @throws Error if the user is not found
   */
  async getUserRoles(userId: string): Promise<string[]> {
    const user = await this.userCredentialRepository.findById(userId);
    if (!user) {
      throw new Error(ErrorMessages.AUTH_USER_NOT_FOUND);
    }
    return user.roles;
  }

  /**
   * Retrieves all role definitions from the database, including names,
   * descriptions, and permissions arrays.
   *
   * @returns Array of all Role entities
   */
  async getAllRoles(): Promise<Role[]> {
    return this.roleRepository.findAll();
  }
}

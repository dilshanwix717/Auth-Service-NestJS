/**
 * @file role.repository.ts
 * @description Repository layer for the Role entity. Abstracts all database access
 * for role CRUD operations used in Role-Based Access Control (RBAC).
 *
 * Architecture Role: Data Access Layer — Injectable NestJS service that wraps a
 * TypeORM Repository<Role>. Contains no business logic; only data access patterns.
 *
 * Consumed by: RoleService for role management and permission lookups.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../entities/role.entity';

@Injectable()
export class RoleRepository {
  constructor(
    @InjectRepository(Role)
    private readonly repo: Repository<Role>,
  ) {}

  /**
   * Retrieve all role definitions from the database.
   * @returns Array of all Role entities
   */
  async findAll(): Promise<Role[]> {
    return this.repo.find();
  }

  /**
   * Find a role by its unique name (e.g., 'USER', 'ADMIN', 'MODERATOR').
   * @param name - The role name to search for
   * @returns The matching Role or null if not found
   */
  async findByName(name: string): Promise<Role | null> {
    return this.repo.findOne({ where: { name } });
  }

  /**
   * Create a new role definition.
   * @param data - Object containing the role name, optional description, and optional permissions array
   * @returns The newly created Role entity with generated UUID
   */
  async create(data: {
    name: string;
    description?: string;
    permissions?: string[];
  }): Promise<Role> {
    const role = this.repo.create({
      name: data.name,
      description: data.description ?? null,
      permissions: data.permissions ?? null,
    });
    return this.repo.save(role);
  }

  /**
   * Update an existing role's description and/or permissions.
   * @param id - UUID of the role to update
   * @param data - Partial object containing fields to update (description and/or permissions)
   */
  async update(
    id: string,
    data: Partial<{ description: string; permissions: string[] }>,
  ): Promise<void> {
    await this.repo.update(id, data);
  }

  /**
   * Delete a role definition from the database.
   * @param id - UUID of the role to delete
   * @returns true if the role was found and deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}

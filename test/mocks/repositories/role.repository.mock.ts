/**
 * @file role.repository.mock.ts
 * @description Mock RoleRepository for standalone testing. Uses an in-memory Map
 * to simulate role CRUD operations without a database connection.
 *
 * Architecture Role: Test Infrastructure — replaces the real repository in unit tests.
 */

export interface MockRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

let roleCounter = 0;

export class MockRoleRepository {
  private store = new Map<string, MockRole>();

  async findAll(): Promise<MockRole[]> {
    return Array.from(this.store.values());
  }

  async findByName(name: string): Promise<MockRole | null> {
    for (const role of this.store.values()) {
      if (role.name === name) return role;
    }
    return null;
  }

  async create(data: {
    name: string;
    description?: string;
    permissions?: string[];
  }): Promise<MockRole> {
    roleCounter++;
    const role: MockRole = {
      id: `mock-role-${roleCounter}`,
      name: data.name,
      description: data.description ?? null,
      permissions: data.permissions ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(role.id, role);
    return role;
  }

  async update(
    id: string,
    data: Partial<{ description: string; permissions: string[] }>,
  ): Promise<void> {
    const role = this.store.get(id);
    if (role) {
      if (data.description !== undefined) role.description = data.description;
      if (data.permissions !== undefined) role.permissions = data.permissions;
      role.updatedAt = new Date();
    }
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /** Reset mock state between tests */
  reset(): void {
    this.store.clear();
    roleCounter = 0;
  }

  /** Seed a role directly for test setup */
  seed(role: MockRole): void {
    this.store.set(role.id, role);
  }
}

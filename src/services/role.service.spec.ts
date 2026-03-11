/**
 * @file role.service.spec.ts
 * @description Unit tests for RoleService — RBAC role assignment, revocation,
 *   role queries, and idempotent behavior.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RoleService } from './role.service';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { RoleRepository } from '../repositories/role.repository';
import { EventService } from './event.service';
import { UserStatus } from '../entities/user-credential.entity';
import { ErrorMessages } from '../constants/error-messages.constant';

jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../utils/trace-id.util', () => ({
  generateTraceId: jest.fn().mockReturnValue('mock-trace-id'),
}));

describe('RoleService', () => {
  let service: RoleService;
  let userCredentialRepository: jest.Mocked<UserCredentialRepository>;
  let roleRepository: jest.Mocked<RoleRepository>;
  let eventService: jest.Mocked<EventService>;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$hash',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    passwordChangedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminRole = {
    id: 'role-uuid-1',
    name: 'ADMIN',
    description: 'Administrator role',
    permissions: ['users:read', 'users:write'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        {
          provide: UserCredentialRepository,
          useValue: {
            findById: jest.fn(),
            updateRoles: jest.fn(),
          },
        },
        {
          provide: RoleRepository,
          useValue: {
            findByName: jest.fn(),
            findAll: jest.fn(),
          },
        },
        {
          provide: EventService,
          useValue: {
            publishRoleAssigned: jest.fn(),
            publishRoleRevoked: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
    userCredentialRepository = module.get(UserCredentialRepository);
    roleRepository = module.get(RoleRepository);
    eventService = module.get(EventService);

    jest.clearAllMocks();
  });

  describe('assignRole', () => {
    it('should add the role to user roles array and publish event', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);
      roleRepository.findByName.mockResolvedValue(mockAdminRole as any);
      userCredentialRepository.updateRoles.mockResolvedValue(undefined);
      eventService.publishRoleAssigned.mockResolvedValue(undefined);

      await service.assignRole('user-uuid-1', 'ADMIN', 'admin-uuid-1');

      expect(userCredentialRepository.updateRoles).toHaveBeenCalledWith('user-uuid-1', [
        'USER',
        'ADMIN',
      ]);
      expect(eventService.publishRoleAssigned).toHaveBeenCalledWith(
        'user-uuid-1',
        'ADMIN',
        'admin-uuid-1',
        'mock-trace-id',
      );
    });

    it('should be idempotent when user already has the role', async () => {
      const userWithAdmin = { ...mockUser, roles: ['USER', 'ADMIN'] };
      userCredentialRepository.findById.mockResolvedValue(userWithAdmin as any);
      roleRepository.findByName.mockResolvedValue(mockAdminRole as any);

      await service.assignRole('user-uuid-1', 'ADMIN', 'admin-uuid-1');

      expect(userCredentialRepository.updateRoles).not.toHaveBeenCalled();
      expect(eventService.publishRoleAssigned).not.toHaveBeenCalled();
    });

    it('should throw when user is not found', async () => {
      userCredentialRepository.findById.mockResolvedValue(null);

      await expect(
        service.assignRole('nonexistent', 'ADMIN', 'admin-uuid-1'),
      ).rejects.toThrow(ErrorMessages.AUTH_USER_NOT_FOUND);
    });

    it('should throw when role does not exist', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);
      roleRepository.findByName.mockResolvedValue(null);

      await expect(
        service.assignRole('user-uuid-1', 'NONEXISTENT', 'admin-uuid-1'),
      ).rejects.toThrow("Role 'NONEXISTENT' does not exist");
    });
  });

  describe('revokeRole', () => {
    it('should remove the role from user roles array and publish event', async () => {
      const userWithMultipleRoles = { ...mockUser, roles: ['USER', 'ADMIN'] };
      userCredentialRepository.findById.mockResolvedValue(userWithMultipleRoles as any);
      userCredentialRepository.updateRoles.mockResolvedValue(undefined);
      eventService.publishRoleRevoked.mockResolvedValue(undefined);

      await service.revokeRole('user-uuid-1', 'ADMIN', 'admin-uuid-1');

      expect(userCredentialRepository.updateRoles).toHaveBeenCalledWith('user-uuid-1', ['USER']);
      expect(eventService.publishRoleRevoked).toHaveBeenCalledWith(
        'user-uuid-1',
        'ADMIN',
        'admin-uuid-1',
        'mock-trace-id',
      );
    });

    it('should be idempotent when user does not have the role (no-op)', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);

      await service.revokeRole('user-uuid-1', 'ADMIN', 'admin-uuid-1');

      expect(userCredentialRepository.updateRoles).not.toHaveBeenCalled();
      expect(eventService.publishRoleRevoked).not.toHaveBeenCalled();
    });

    it('should throw when user is not found', async () => {
      userCredentialRepository.findById.mockResolvedValue(null);

      await expect(
        service.revokeRole('nonexistent', 'ADMIN', 'admin-uuid-1'),
      ).rejects.toThrow(ErrorMessages.AUTH_USER_NOT_FOUND);
    });
  });

  describe('getUserRoles', () => {
    it('should return the user roles array', async () => {
      const userWithRoles = { ...mockUser, roles: ['USER', 'ADMIN', 'MODERATOR'] };
      userCredentialRepository.findById.mockResolvedValue(userWithRoles as any);

      const roles = await service.getUserRoles('user-uuid-1');

      expect(roles).toEqual(['USER', 'ADMIN', 'MODERATOR']);
    });

    it('should throw when user is not found', async () => {
      userCredentialRepository.findById.mockResolvedValue(null);

      await expect(service.getUserRoles('nonexistent')).rejects.toThrow(
        ErrorMessages.AUTH_USER_NOT_FOUND,
      );
    });
  });

  describe('getAllRoles', () => {
    it('should return all role definitions', async () => {
      const mockRoles = [mockAdminRole, { ...mockAdminRole, id: 'role-2', name: 'USER' }];
      roleRepository.findAll.mockResolvedValue(mockRoles as any);

      const roles = await service.getAllRoles();

      expect(roles).toHaveLength(2);
      expect(roleRepository.findAll).toHaveBeenCalled();
    });
  });
});

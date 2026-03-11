/**
 * @file credential.service.spec.ts
 * @description Unit tests for CredentialService — password hashing, verification,
 *   credential CRUD operations, and dual-algorithm hash strategy.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CredentialService } from './credential.service';
import { UserCredentialRepository } from '../repositories/user-credential.repository';
import { UserStatus } from '../entities/user-credential.entity';
import * as hashUtil from '../utils/hash.util';

// Mock the hash utility module
jest.mock('../utils/hash.util');
jest.mock('../utils/logger.util', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CredentialService', () => {
  let service: CredentialService;
  let userCredentialRepository: jest.Mocked<UserCredentialRepository>;
  let configService: jest.Mocked<ConfigService>;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hashedpassword',
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CredentialService,
        {
          provide: UserCredentialRepository,
          useValue: {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            createCredential: jest.fn(),
            updatePassword: jest.fn(),
            deleteCredential: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CredentialService>(CredentialService);
    userCredentialRepository = module.get(UserCredentialRepository);
    configService = module.get(ConfigService);

    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash password with argon2id using config parameters', async () => {
      configService.get.mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'hashing.argon2.memoryCost': 65536,
          'hashing.argon2.timeCost': 3,
          'hashing.argon2.parallelism': 4,
        };
        return map[key];
      });
      (hashUtil.hashPasswordArgon2 as jest.Mock).mockResolvedValue('$argon2id$hashed');

      const result = await service.hashPassword('MySecret123!');

      expect(hashUtil.hashPasswordArgon2).toHaveBeenCalledWith('MySecret123!', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
      expect(result).toBe('$argon2id$hashed');
    });

    it('should use default argon2 parameters when config is missing', async () => {
      configService.get.mockReturnValue(undefined);
      (hashUtil.hashPasswordArgon2 as jest.Mock).mockResolvedValue('$argon2id$hashed');

      await service.hashPassword('password');

      expect(hashUtil.hashPasswordArgon2).toHaveBeenCalledWith('password', {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
    });

    it('should fall back to bcrypt when argon2 fails', async () => {
      configService.get.mockReturnValue(undefined);
      (hashUtil.hashPasswordArgon2 as jest.Mock).mockRejectedValue(
        new Error('argon2 native bindings missing'),
      );
      (hashUtil.hashPasswordBcrypt as jest.Mock).mockResolvedValue('$2b$10$bcrypthash');

      const result = await service.hashPassword('password');

      expect(hashUtil.hashPasswordBcrypt).toHaveBeenCalledWith('password');
      expect(result).toBe('$2b$10$bcrypthash');
    });
  });

  describe('verifyPassword', () => {
    it('should verify argon2 hash when prefix is $argon2', async () => {
      (hashUtil.verifyPasswordArgon2 as jest.Mock).mockResolvedValue(true);

      const result = await service.verifyPassword('$argon2id$v=19$hash', 'password');

      expect(hashUtil.verifyPasswordArgon2).toHaveBeenCalledWith('$argon2id$v=19$hash', 'password');
      expect(result).toBe(true);
    });

    it('should verify bcrypt hash when prefix is $2b', async () => {
      (hashUtil.verifyPasswordBcrypt as jest.Mock).mockResolvedValue(true);

      const result = await service.verifyPassword('$2b$10$somehash', 'password');

      expect(hashUtil.verifyPasswordBcrypt).toHaveBeenCalledWith('$2b$10$somehash', 'password');
      expect(result).toBe(true);
    });

    it('should verify bcrypt hash when prefix is $2a (legacy)', async () => {
      (hashUtil.verifyPasswordBcrypt as jest.Mock).mockResolvedValue(true);

      const result = await service.verifyPassword('$2a$10$somehash', 'password');

      expect(hashUtil.verifyPasswordBcrypt).toHaveBeenCalledWith('$2a$10$somehash', 'password');
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      (hashUtil.verifyPasswordArgon2 as jest.Mock).mockResolvedValue(false);

      const result = await service.verifyPassword('$argon2id$hash', 'wrong-password');

      expect(result).toBe(false);
    });

    it('should return false for unrecognized hash format', async () => {
      const result = await service.verifyPassword('unknown-hash-format', 'password');

      expect(result).toBe(false);
    });
  });

  describe('createCredential', () => {
    it('should hash the password and persist the credential', async () => {
      configService.get.mockReturnValue(undefined);
      (hashUtil.hashPasswordArgon2 as jest.Mock).mockResolvedValue('$argon2id$hashed');
      userCredentialRepository.createCredential.mockResolvedValue(mockUser as any);

      const result = await service.createCredential('test@example.com', 'Password123!');

      expect(userCredentialRepository.createCredential).toHaveBeenCalledWith({
        email: 'test@example.com',
        passwordHash: '$argon2id$hashed',
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findByEmail', () => {
    it('should return user when found', async () => {
      userCredentialRepository.findByEmail.mockResolvedValue(mockUser as any);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(userCredentialRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should return null when user not found', async () => {
      userCredentialRepository.findByEmail.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      userCredentialRepository.findById.mockResolvedValue(mockUser as any);

      const result = await service.findById('user-uuid-1');

      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      userCredentialRepository.findById.mockResolvedValue(null);

      const result = await service.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('updatePassword', () => {
    it('should re-hash the new password and update the repository', async () => {
      configService.get.mockReturnValue(undefined);
      (hashUtil.hashPasswordArgon2 as jest.Mock).mockResolvedValue('$argon2id$new-hash');
      userCredentialRepository.updatePassword.mockResolvedValue(undefined);

      await service.updatePassword('user-uuid-1', 'NewPassword456!');

      expect(hashUtil.hashPasswordArgon2).toHaveBeenCalledWith('NewPassword456!', expect.any(Object));
      expect(userCredentialRepository.updatePassword).toHaveBeenCalledWith(
        'user-uuid-1',
        '$argon2id$new-hash',
      );
    });
  });

  describe('deleteCredential', () => {
    it('should return true when credential is found and deleted', async () => {
      userCredentialRepository.deleteCredential.mockResolvedValue(true);

      const result = await service.deleteCredential('user-uuid-1');

      expect(result).toBe(true);
    });

    it('should return false when credential not found (idempotent)', async () => {
      userCredentialRepository.deleteCredential.mockResolvedValue(false);

      const result = await service.deleteCredential('nonexistent-id');

      expect(result).toBe(false);
    });
  });
});

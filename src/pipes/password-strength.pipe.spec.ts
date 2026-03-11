/**
 * @file password-strength.pipe.spec.ts
 * @description Unit tests for PasswordStrengthPipe — validates password complexity rules.
 * Tests all 6 password strength requirements.
 */

import { BadRequestException } from '@nestjs/common';
import { PasswordStrengthPipe } from './password-strength.pipe';

describe('PasswordStrengthPipe', () => {
  let pipe: PasswordStrengthPipe;

  beforeEach(() => {
    pipe = new PasswordStrengthPipe();
  });

  describe('valid passwords', () => {
    it('should accept a strong password', () => {
      expect(pipe.transform('MyStr0ng!Pass')).toBe('MyStr0ng!Pass');
    });

    it('should accept password with all required character types', () => {
      expect(pipe.transform('Abcdef1!')).toBe('Abcdef1!');
    });
  });

  describe('invalid passwords', () => {
    it('should reject passwords shorter than 8 characters', () => {
      expect(() => pipe.transform('Ab1!xyz')).toThrow(BadRequestException);
    });

    it('should reject passwords without uppercase letters', () => {
      expect(() => pipe.transform('abcdefg1!')).toThrow(BadRequestException);
    });

    it('should reject passwords without lowercase letters', () => {
      expect(() => pipe.transform('ABCDEFG1!')).toThrow(BadRequestException);
    });

    it('should reject passwords without numbers', () => {
      expect(() => pipe.transform('Abcdefgh!')).toThrow(BadRequestException);
    });

    it('should reject passwords without special characters', () => {
      expect(() => pipe.transform('Abcdefg1x')).toThrow(BadRequestException);
    });

    it('should reject passwords with whitespace', () => {
      expect(() => pipe.transform('Abc def1!')).toThrow(BadRequestException);
    });

    it('should reject empty passwords', () => {
      expect(() => pipe.transform('')).toThrow(BadRequestException);
    });
  });
});

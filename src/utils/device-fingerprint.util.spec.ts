/**
 * @file device-fingerprint.util.spec.ts
 * @description Unit tests for device fingerprint generation.
 */

import { generateDeviceFingerprint } from './device-fingerprint.util';

describe('DeviceFingerprintUtil', () => {
  describe('generateDeviceFingerprint', () => {
    it('should generate a 64-char hex hash', () => {
      const fp = generateDeviceFingerprint('Mozilla/5.0', '192.168.1.1');
      expect(fp).toHaveLength(64);
      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent results for the same inputs', () => {
      const fp1 = generateDeviceFingerprint('Mozilla/5.0', '192.168.1.1');
      const fp2 = generateDeviceFingerprint('Mozilla/5.0', '192.168.1.1');
      expect(fp1).toBe(fp2);
    });

    it('should produce different results for different inputs', () => {
      const fp1 = generateDeviceFingerprint('Mozilla/5.0', '192.168.1.1');
      const fp2 = generateDeviceFingerprint('Chrome/100', '10.0.0.1');
      expect(fp1).not.toBe(fp2);
    });

    it('should handle null/undefined inputs gracefully', () => {
      const fp = generateDeviceFingerprint(null, undefined);
      expect(fp).toHaveLength(64);
    });

    it('should be case-insensitive for user agent', () => {
      const fp1 = generateDeviceFingerprint('Mozilla/5.0', '192.168.1.1');
      const fp2 = generateDeviceFingerprint('MOZILLA/5.0', '192.168.1.1');
      expect(fp1).toBe(fp2);
    });
  });
});

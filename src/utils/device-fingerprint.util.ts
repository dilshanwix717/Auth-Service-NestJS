/**
 * @file device-fingerprint.util.ts
 * @description Generates a normalized device fingerprint from User-Agent and IP address.
 * Used for session tracking to identify unique client devices. Enables features like
 * "revoke session on this device" and detecting suspicious activity from new devices.
 *
 * Architecture Role: Cross-Cutting Utility — used by TokenService and SessionService
 * when creating refresh token sessions.
 *
 * Key Concepts:
 * - Fingerprint is a SHA-256 hash of normalized User-Agent + IP
 * - Not meant to be a strong device identifier (those require client-side fingerprinting)
 * - Sufficient for server-side session management and anomaly detection
 * - Normalized to handle minor User-Agent variations
 */

import { createHash } from 'crypto';

/**
 * Generate a device fingerprint from User-Agent and IP address.
 * The fingerprint is a SHA-256 hash of the combined, normalized inputs.
 *
 * @param userAgent - The User-Agent header string (can be undefined/null)
 * @param ipAddress - The client IP address (can be undefined/null)
 * @returns A 64-character hex string (SHA-256 hash) representing the device
 *
 * @example
 * const fingerprint = generateDeviceFingerprint(
 *   'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
 *   '192.168.1.100'
 * );
 * // Returns: 'a1b2c3d4...' (64 hex chars)
 */
export function generateDeviceFingerprint(
  userAgent?: string | null,
  ipAddress?: string | null,
): string {
  // Normalize inputs: lowercase, trim whitespace, use empty string as fallback
  const normalizedUA = (userAgent || '').toLowerCase().trim();
  const normalizedIP = (ipAddress || '').trim();

  const raw = `${normalizedUA}|${normalizedIP}`;

  return createHash('sha256').update(raw).digest('hex');
}

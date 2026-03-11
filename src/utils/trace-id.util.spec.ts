/**
 * @file trace-id.util.spec.ts
 * @description Unit tests for trace ID generation and extraction.
 */

import { extractOrGenerateTraceId, generateTraceId, TRACE_ID_HEADER } from './trace-id.util';

describe('TraceIdUtil', () => {
  describe('generateTraceId', () => {
    it('should generate a UUID v4', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate unique IDs', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('extractOrGenerateTraceId', () => {
    it('should extract existing trace ID from headers', () => {
      const mockRequest = {
        headers: { [TRACE_ID_HEADER]: 'existing-trace-id-123' },
      } as any;

      const traceId = extractOrGenerateTraceId(mockRequest);
      expect(traceId).toBe('existing-trace-id-123');
    });

    it('should generate new trace ID when header is missing', () => {
      const mockRequest = { headers: {} } as any;

      const traceId = extractOrGenerateTraceId(mockRequest);
      expect(traceId).toBeDefined();
      expect(traceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should generate new trace ID when header is not a string', () => {
      const mockRequest = {
        headers: { [TRACE_ID_HEADER]: ['array-value'] },
      } as any;

      const traceId = extractOrGenerateTraceId(mockRequest);
      expect(traceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('TRACE_ID_HEADER', () => {
    it('should be x-request-id', () => {
      expect(TRACE_ID_HEADER).toBe('x-request-id');
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalId } from './id';

describe('createLocalId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the browser UUID implementation when available', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '12345678-1234-4234-9234-123456789abc'
    });
    expect(createLocalId()).toBe('12345678-1234-4234-9234-123456789abc');
  });

  it('creates a compatible UUID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(17);
        return bytes;
      }
    });
    expect(createLocalId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

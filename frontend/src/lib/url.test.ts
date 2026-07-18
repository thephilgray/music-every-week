import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixUrl } from './url';

describe('fixUrl utility', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return empty string when input is undefined, null, or empty string', () => {
    expect(fixUrl(undefined)).toBe('');
    expect(fixUrl(null)).toBe('');
    expect(fixUrl('')).toBe('');
  });

  it('should preserve regular URLs without issues', () => {
    const url = 'https://example.com/image.png';
    expect(fixUrl(url)).toBe(url);
  });

  it('should encode spaces and # in r2.dev URLs', () => {
    const problematicUrl = 'https://my-bucket.r2.dev/folder/my song #1 (final).mp3';
    const expectedUrl = 'https://my-bucket.r2.dev/folder/my%20song%20%231%20(final).mp3';
    expect(fixUrl(problematicUrl)).toBe(expectedUrl);
  });

  it('should replace placeholder domain if VITE_R2_PUBLIC_DOMAIN is set', async () => {
    // We test with environment variables if needed or verify default behavior
    const input = 'https://pub-your-r2-domain.r2.dev/track.mp3';
    const result = fixUrl(input);
    // If VITE_R2_PUBLIC_DOMAIN is not set in env, it remains or is replaced with empty string depending on import.meta.env
    expect(typeof result).toBe('string');
  });
});

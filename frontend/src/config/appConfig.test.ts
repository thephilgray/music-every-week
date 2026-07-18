import { describe, it, expect } from 'vitest';
import { BRAND_INFO } from './appConfig';

describe('appConfig', () => {
  it('should export BRAND_INFO with required properties', () => {
    expect(BRAND_INFO).toBeDefined();
    expect(typeof BRAND_INFO.name).toBe('string');
    expect(typeof BRAND_INFO.shortName).toBe('string');
    expect(typeof BRAND_INFO.logoUrl).toBe('string');
    expect(typeof BRAND_INFO.supportEmail).toBe('string');
    expect(typeof BRAND_INFO.tagline).toBe('string');
  });

  it('should have non-empty values for default configuration', () => {
    expect(BRAND_INFO.name.length).toBeGreaterThan(0);
    expect(BRAND_INFO.shortName.length).toBeGreaterThan(0);
    expect(BRAND_INFO.logoUrl.length).toBeGreaterThan(0);
  });
});

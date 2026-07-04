import { describe, expect, it } from 'vitest';
import { validateBaseUrl } from './security.js';

describe('validateBaseUrl', () => {
  it('accepts a bare host:port and adds http://', () => {
    expect(validateBaseUrl('192.168.1.23:8080')).toBe('http://192.168.1.23:8080');
  });

  it('accepts an explicit http:// URL and normalizes it to origin only', () => {
    expect(validateBaseUrl('http://phone.local:8080/some/path?x=1')).toBe(
      'http://phone.local:8080',
    );
  });

  it('rejects https', () => {
    expect(() => validateBaseUrl('https://192.168.1.23:8080')).toThrow(/http/);
  });

  it('rejects non-http schemes', () => {
    expect(() => validateBaseUrl('file:///etc/passwd')).toThrow();
  });

  it('rejects embedded credentials', () => {
    expect(() => validateBaseUrl('http://user:pass@192.168.1.23:8080')).toThrow(/credentials/);
  });

  it('rejects an invalid hostname', () => {
    expect(() => validateBaseUrl('http://not a host')).toThrow();
  });
});

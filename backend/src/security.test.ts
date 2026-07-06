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

  it('rejects localhost', () => {
    expect(() => validateBaseUrl('localhost:8080')).toThrow(/loopback/);
  });

  it('rejects 127.0.0.0/8 loopback addresses', () => {
    expect(() => validateBaseUrl('127.0.0.1:8080')).toThrow(/loopback/);
    expect(() => validateBaseUrl('127.5.5.5')).toThrow(/loopback/);
  });

  it('rejects 169.254.0.0/16 link-local addresses, including the cloud metadata IP', () => {
    expect(() => validateBaseUrl('169.254.169.254')).toThrow(/loopback/);
    expect(() => validateBaseUrl('169.254.1.1:8080')).toThrow(/loopback/);
  });

  it('rejects 0.0.0.0/8', () => {
    expect(() => validateBaseUrl('0.0.0.0:8080')).toThrow(/loopback/);
  });

  it('still accepts private LAN ranges phones actually use', () => {
    expect(validateBaseUrl('192.168.1.23:8080')).toBe('http://192.168.1.23:8080');
    expect(validateBaseUrl('10.0.0.5:8080')).toBe('http://10.0.0.5:8080');
    expect(validateBaseUrl('172.16.0.5:8080')).toBe('http://172.16.0.5:8080');
  });
});

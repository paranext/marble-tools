// NOTE: Most code in this file is AI generated. Some human adjustments were made.
import { transformDomainCode } from '../helpers';

describe('transformDomainCode function', () => {
  // Test for basic transformation
  test('should transform concatenated 3-digit codes to period-delimited format', () => {
    // Basic case
    expect(transformDomainCode('001002003')).toBe('1.2.3');
    // Larger numbers
    expect(transformDomainCode('123456789')).toBe('123.456.789');
    // Mixed values
    expect(transformDomainCode('001042099')).toBe('1.42.99');
  });

  // Test for edge cases
  test('should handle edge cases', () => {
    // Empty string
    expect(transformDomainCode('')).toBe('');
    // Single part (less than 3 chars)
    expect(transformDomainCode('12')).toBe('');
    // Exactly 3 chars
    expect(transformDomainCode('123')).toBe('123');
  });

  // Test for incomplete chunks
  test('should ignore incomplete chunks', () => {
    // Missing digits at the end
    expect(transformDomainCode('00100212')).toBe('1.2');
    // Single incomplete chunk
    expect(transformDomainCode('12')).toBe('');
  });
});

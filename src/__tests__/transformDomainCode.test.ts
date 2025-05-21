// NOTE: Most code in this file is AI generated. Some human adjustments were made.
import { transformDomainCode } from '../helpers';

describe('transformDomainCode function', () => {
  // Test for basic transformation
  test('should transform concatenated 3-digit codes to period-delimited format', () => {
    // Basic case
    expect(transformDomainCode('001002003')).toEqual(['1.2.3']);
    // Larger numbers
    expect(transformDomainCode('123456789')).toEqual(['123.456.789']);
    // Mixed values
    expect(transformDomainCode('001042099')).toEqual(['1.42.99']);
  });

  test('should transform concatenated 3-digit with other characters mixed in', () => {
    // Alphabetical characters
    expect(transformDomainCode('001ABCDEFG002003')).toEqual(['2.3']);
    // HTML
    expect(transformDomainCode('123&gt;456789')).toEqual(['456.789']);
    // Extra periods
    expect(transformDomainCode('123.456')).toEqual(['123', '456']);
    expect(transformDomainCode('.123456')).toEqual(['123.456']);
    expect(transformDomainCode('123456.')).toEqual(['123.456']);
    // Colons
    expect(transformDomainCode('123:456')).toEqual(['456']);
  });

  // Test for edge cases
  test('should handle edge cases', () => {
    // Empty string
    expect(transformDomainCode('')).toEqual([]);
    // Exactly 3 chars
    expect(transformDomainCode('123')).toEqual(['123']);
  });

  // Test for incomplete chunks
  test('should ignore incomplete chunks', () => {
    // Missing digits at the end
    expect(transformDomainCode('00100212')).toEqual(['00100212']);
    // Single incomplete chunk
    expect(transformDomainCode('12')).toEqual(['12']);
  });
});

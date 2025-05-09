// NOTE: Most code in this file is AI generated. Some human adjustments were made.
import { marbleLinkIdToU23003 } from '../helpers';

describe('marbleLinkIdToU23003 function', () => {
  // Test for valid conversions
  test('should convert valid MARBLE link IDs to U23003 format', () => {
    // Basic Luke reference
    expect(marbleLinkIdToU23003('04200100100002')).toBe('LUK 1:1!1');
    // Genesis reference
    expect(marbleLinkIdToU23003('00100100100012')).toBe('GEN 1:1!6');
    // Revelation reference
    expect(marbleLinkIdToU23003('06602200500020')).toBe('REV 22:5!10');
    // John reference with higher word count
    expect(marbleLinkIdToU23003('04301001000200')).toBe('JHN 10:10!100');
  });

  // Test for invalid inputs
  test('should handle invalid inputs', () => {
    // Empty string
    expect(marbleLinkIdToU23003('')).toBe('');
    // Wrong length
    expect(marbleLinkIdToU23003('042001001')).toBe('');
    // Invalid book ID
    expect(marbleLinkIdToU23003('99900100100002')).toBe('');
  });

  // Test edge cases
  test('should handle edge cases properly', () => {
    // Zero chapter/verse/word
    expect(marbleLinkIdToU23003('04200000000000')).toBe('LUK 0:0!0');
    // Various non-standard but valid inputs
    expect(marbleLinkIdToU23003('04299999900198')).toBe('LUK 999:999!99');
  });
});

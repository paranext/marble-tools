// NOTE: Most code in this file is AI generated. Some human adjustments were made.
import { condenseSenseId, SENSE_PREFIX } from '../helpers';

describe('condenseSenseId function', () => {
  // Test for invalid inputs
  test('should return the original ID for invalid inputs', () => {
    // Non-sense ID
    expect(condenseSenseId('entry-12345')).toBe('entry-12345');
    // Single part ID
    expect(condenseSenseId('sense')).toBe('sense');
    // Non-numeric parts
    expect(condenseSenseId('sense-abc-123')).toBe('sense-abc-123');
  });

  // Test pattern 1: equal-length segments with hierarchical zeros
  test('should handle same-length segments with hierarchical zeros', () => {
    // Basic case
    expect(condenseSenseId('sense-12300-12345')).toBe('sense-12345');
    // Multiple levels
    expect(condenseSenseId('sense-10000-12000-12300-12345')).toBe('sense-12345');
    // Non-hierarchical pattern should return original
    expect(condenseSenseId('sense-12345-67890')).toBe('sense-12345-67890');
  });

  // Test pattern 2: different-length segments applied from right
  test('should handle different-length segments applied from right', () => {
    // Basic case with decreasing length segments
    expect(condenseSenseId('sense-1234-56')).toBe('sense-1256');
    // Multiple segments with same or decreasing length
    expect(condenseSenseId('sense-1234-56-78')).toBe('sense-1278');

    // Longer later segment should return original
    expect(condenseSenseId('sense-12-3456')).toBe('sense-12-3456');
    // Multiple segments with one longer segment should return original
    expect(condenseSenseId('sense-1234-56-7890')).toBe('sense-1234-56-7890');
  });

  // Edge cases
  test('should handle edge cases', () => {
    // Empty string
    expect(condenseSenseId('')).toBe('');
    // Just the prefix
    expect(condenseSenseId(`${SENSE_PREFIX}`)).toBe(`${SENSE_PREFIX}`);
    // Missing prefix
    expect(condenseSenseId('12345-67890')).toBe('12345-67890');
  });
});

import { buildSenseId, SENSE_PREFIX } from '../helpers';

describe('buildSenseId', () => {
  test('uses the entry number plus the last 9 digits of a 15-digit lexical meaning ID', () => {
    expect(buildSenseId('000583000000000', '000583001002000')).toBe(`${SENSE_PREFIX}000583001002000`);
  });

  test('uses the entry number plus a 9-digit lexical meaning ID as is', () => {
    expect(buildSenseId('000583000000000', '001002000')).toBe(`${SENSE_PREFIX}000583001002000`);
  });

  test('builds the same ID from both lengths of one meaning ID', () => {
    expect(buildSenseId('000583000000000', '000583001002003')).toBe(
      buildSenseId('000583000000000', '001002003')
    );
  });

  test('keeps the three trailing zeros of a lexical meaning', () => {
    expect(buildSenseId('000583000000000', '001002000')).toMatch(/000$/);
  });

  test('builds contextual meaning IDs of both lengths', () => {
    expect(buildSenseId('000583000000000', '000583001002003')).toBe(`${SENSE_PREFIX}000583001002003`);
    expect(buildSenseId('000583000000000', '001002003')).toBe(`${SENSE_PREFIX}000583001002003`);
  });

  test('accepts a 6-digit entry ID', () => {
    expect(buildSenseId('000583', '001002003')).toBe(`${SENSE_PREFIX}000583001002003`);
  });

  test.each([
    ['', '001002003'],
    ['00058', '001002003'],
    ['00058x000000000', '001002003'],
    ['000583000000000', ''],
    ['000583000000000', '00100200'],
    ['000583000000000', '00100200x'],
    ['000583000000000', '0058300100200'],
  ])('throws for entry ID %p and meaning ID %p', (entryId, meaningId) => {
    expect(() => buildSenseId(entryId, meaningId)).toThrow();
  });
});

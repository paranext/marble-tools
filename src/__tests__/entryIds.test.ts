import { cleanId, parseEntryVersion, verifyUniqueEntryAndSenseIds } from '../helpers';

describe('parseEntryVersion', () => {
  test('parses a whole number', () => {
    expect(parseEntryVersion('3', 'e1')).toBe(3);
    expect(parseEntryVersion(' 12 ', 'e1')).toBe(12);
  });

  test.each([[null], [undefined], [''], ['x'], ['3.5'], ['-1']])('throws for %p', raw => {
    expect(() => parseEntryVersion(raw, 'e1')).toThrow(/e1/);
  });
});

describe('cleanId', () => {
  test('keeps the 6-digit entry number of an entry ID', () => {
    expect(cleanId('entry-000583000000000')).toBe('000583');
  });

  test('keeps the 15 digits of a sense ID', () => {
    expect(cleanId('sense-000583001002000')).toBe('000583001002000');
  });

  test('returns any other ID as is', () => {
    expect(cleanId('other')).toBe('other');
  });
});

describe('verifyUniqueEntryAndSenseIds', () => {
  const entry = (id: string, senseIds: string[]) => ({
    id,
    senses: senseIds.map(i => ({ id: i })),
  });

  test('accepts distinct entries and senses', () => {
    expect(() =>
      verifyUniqueEntryAndSenseIds({
        en: {
          a: entry('entry-000001000000000', ['sense-000001001001000']),
          b: entry('entry-000002000000000', ['sense-000002001001000']),
        },
      })
    ).not.toThrow();
  });

  test('throws for two entries that share the 6-digit entry number the output keeps', () => {
    expect(() =>
      verifyUniqueEntryAndSenseIds({
        en: { a: entry('entry-000001000000000', []), b: entry('entry-000001000000001', []) },
      })
    ).toThrow(/000001/);
  });

  test('throws for a duplicate sense ID', () => {
    expect(() =>
      verifyUniqueEntryAndSenseIds({
        en: {
          a: entry('entry-000001000000000', ['sense-000001001001000', 'sense-000001001001000']),
        },
      })
    ).toThrow(/sense/i);
  });

  test('allows the same IDs in different languages', () => {
    expect(() =>
      verifyUniqueEntryAndSenseIds({
        en: { a: entry('entry-000001000000000', ['sense-000001001001000']) },
        fr: { a: entry('entry-000001000000000', ['sense-000001001001000']) },
      })
    ).not.toThrow();
  });
});

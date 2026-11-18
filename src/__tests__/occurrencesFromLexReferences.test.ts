import { occurrencesFromLexReferences } from '../helpers';

describe('occurrencesFromLexReferences', () => {
  test('converts valid references to U23003 occurrences in source order', () => {
    expect(occurrencesFromLexReferences(['04200100100002', '00100100100012'])).toEqual({
      occurrences: ['LUK 1:1!1', 'GEN 1:1!6'],
      invalid: [],
      odd: [],
      wordZero: [],
      unknownBook: [],
    });
  });

  test('ignores a note suffix and surrounding whitespace', () => {
    expect(occurrencesFromLexReferences([' 04200100100002{N:001}\n']).occurrences).toEqual([
      'LUK 1:1!1',
    ]);
  });

  test('skips odd word IDs, which are apparatus readings', () => {
    const result = occurrencesFromLexReferences(['04200100100003', '04200100100004']);
    expect(result.occurrences).toEqual(['LUK 1:1!2']);
    expect(result.odd).toEqual(['04200100100003']);
  });

  test('skips references to word 0, which point at a verse rather than a word', () => {
    const result = occurrencesFromLexReferences(['04600100000000', '04200600300000']);
    expect(result.occurrences).toEqual([]);
    expect(result.wordZero).toEqual(['04600100000000', '04200600300000']);
  });

  test.each([[''], ['0420010010000'], ['04200100100x02'], ['{N:001}04200100100002']])(
    'skips the invalid reference %p',
    reference => {
      const result = occurrencesFromLexReferences([reference]);
      expect(result.occurrences).toEqual([]);
      expect(result.invalid).toEqual([reference]);
    }
  );

  test('skips references to an unknown book', () => {
    const result = occurrencesFromLexReferences(['99900100100002', '00000100100002']);
    expect(result.occurrences).toEqual([]);
    expect(result.unknownBook).toEqual(['99900100100002', '00000100100002']);
  });

  test('reports an unknown book even when the word ID is odd', () => {
    const result = occurrencesFromLexReferences(['99900100100003']);
    expect(result.unknownBook).toEqual(['99900100100003']);
    expect(result.odd).toEqual([]);
  });

  test('keeps each occurrence once, including references that differ only by a note', () => {
    expect(
      occurrencesFromLexReferences(['04200100100002', '04200100100002{N:001}', '04200100100004'])
        .occurrences
    ).toEqual(['LUK 1:1!1', 'LUK 1:1!2']);
  });

  test('returns nothing for no references', () => {
    expect(occurrencesFromLexReferences([])).toEqual({
      occurrences: [],
      invalid: [],
      odd: [],
      wordZero: [],
      unknownBook: [],
    });
  });
});

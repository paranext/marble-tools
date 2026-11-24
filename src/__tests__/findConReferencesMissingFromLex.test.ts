import { findConReferencesMissingFromLex as findMissing, referenceKeys } from '../helpers';

describe('findConReferencesMissingFromLex', () => {
  test('returns nothing when every contextual reference is in the lexical references', () => {
    expect(
      findMissing(
        ['00100100100010', '00100100200020'],
        referenceKeys(['00100100200020', '00100100100010', '00100100300030'])
      )
    ).toEqual([]);
  });

  test('returns the contextual references that are not in the lexical references', () => {
    expect(
      findMissing(['00100100100010', '00100100200020'], referenceKeys(['00100100100010']))
    ).toEqual(['00100100200020']);
  });

  test('compares only the first 14 digits, ignoring trailing notes and whitespace', () => {
    expect(
      findMissing(
        [' 00100100100010{N:001}', '00100100200020'],
        referenceKeys(['00100100100010', '00100100200020{N:002}\n'])
      )
    ).toEqual([]);
  });

  test('reports every contextual reference when the lexical references are empty', () => {
    expect(findMissing(['00100100100010'], referenceKeys([]))).toEqual(['00100100100010']);
  });

  test('returns nothing when there are no contextual references', () => {
    expect(findMissing([], referenceKeys(['00100100100010']))).toEqual([]);
  });
});

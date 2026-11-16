import {
  cleanUpDefinitions,
  createLemmaLookup,
  LemmaIndexEntry,
  replaceMeaningLetters,
  rewriteCrossReferenceTargets,
  stripStructureSymbols,
} from '../definition-cleanup';

// Synthetic test strings. Hebrew points: sheva U+05B0, hataf segol U+05B1, hataf patah U+05B2,
// hataf qamats U+05B3, segol U+05B6, patah U+05B7, qamats U+05B8.
const ALEF = '\u05d0';
const BET = '\u05d1';
const GIMEL = '\u05d2';
const NBSP = '\u00a0';

function entry(id: string, lemma: string, alternateLemmas: string[] = []): LemmaIndexEntry {
  return { id, lemma, alternateLemmas };
}

describe('createLemmaLookup', () => {
  test('finds an exact lemma', () => {
    const lookup = createLemmaLookup([entry('1', 'abc'), entry('2', 'abd')]);
    expect(lookup('abd')).toEqual({ kind: 'found', entry: entry('2', 'abd'), step: 'exact' });
  });

  test('finds a lemma that is equal after NFD and returns its exact spelling', () => {
    // Precomposed alpha with tonos (U+03AC) in the lemma, alpha + combining acute in the target
    const lookup = createLemmaLookup([entry('1', '\u03ac\u03b2')]);
    expect(lookup('\u03b1\u0301\u03b2')).toMatchObject({
      kind: 'found',
      entry: { lemma: '\u03ac\u03b2' },
      step: 'nfd',
    });
  });

  test('reads a no-break space as a space', () => {
    const lookup = createLemmaLookup([entry('1', `${ALEF} ${BET}`)]);
    expect(lookup(`${ALEF}${NBSP}${BET}`)).toMatchObject({ kind: 'found', step: 'noBreakSpace' });
  });

  test.each([
    ['exactly', 'xyz', 'xyz'],
    ['after NFD', '\u03ac', '\u03b1\u0301'],
    ['with a no-break space read as a space', 'x y', `x${NBSP}y`],
  ])('finds an entry by an alternate lemma that matches %s', (_, alternateLemma, target) => {
    const lookup = createLemmaLookup([entry('1', 'abc', [alternateLemma])]);
    expect(lookup(target)).toEqual({
      kind: 'found',
      entry: entry('1', 'abc', [alternateLemma]),
      step: 'alternateLemma',
    });
  });

  test.each([
    ['patah', '\u05b7', '\u05b2'],
    ['segol', '\u05b6', '\u05b1'],
    ['qamats', '\u05b8', '\u05b3'],
  ])('reads sheva + %s as the matching hataf vowel', (_, vowel, hataf) => {
    const lookup = createLemmaLookup([entry('1', `${ALEF}${hataf}${BET}`)]);
    expect(lookup(`${ALEF}\u05b0${vowel}${BET}`)).toMatchObject({
      kind: 'found',
      entry: { lemma: `${ALEF}${hataf}${BET}` },
      step: 'hataf',
    });
  });

  test('reads sheva + vowel as hataf when comparing alternate lemmas too', () => {
    const lookup = createLemmaLookup([entry('1', 'abc', [`${ALEF}\u05b2${BET}`])]);
    expect(lookup(`${ALEF}\u05b0\u05b7${BET}`)).toMatchObject({
      kind: 'found',
      entry: { id: '1' },
      step: 'hataf',
    });
  });

  test('prefers an earlier step: an exact lemma wins over another entry’s alternate lemma', () => {
    const lookup = createLemmaLookup([entry('1', 'abc'), entry('2', 'xyz', ['abc'])]);
    expect(lookup('abc')).toMatchObject({ kind: 'found', entry: { id: '1' }, step: 'exact' });
  });

  test('reports more than one entry found by the same step as ambiguous', () => {
    const lookup = createLemmaLookup([entry('1', 'abc', ['q']), entry('2', 'abd', ['q'])]);
    expect(lookup('q')).toMatchObject({ kind: 'ambiguous', step: 'alternateLemma' });
  });

  test('counts an entry found by its lemma and by its own alternate lemma once', () => {
    const lookup = createLemmaLookup([entry('1', 'abc', ['abc'])]);
    expect(lookup('abc')).toMatchObject({ kind: 'found', step: 'exact' });
  });

  test('finds nothing for an unknown target', () => {
    expect(createLemmaLookup([entry('1', 'abc')])('zzz')).toEqual({ kind: 'notFound' });
  });
});

describe('rewriteCrossReferenceTargets', () => {
  test('replaces only the target lemma and keeps a trailing meaning position', () => {
    const rewrite = jest.fn(() => 'NEW');
    expect(
      rewriteCrossReferenceTargets('see {L:text<SDBG:old:000000>} and {L:t2<SDBH:old2>}.', rewrite)
    ).toBe('see {L:text<SDBG:NEW:000000>} and {L:t2<SDBH:NEW>}.');
    expect(rewrite.mock.calls).toEqual([
      ['SDBG', 'old'],
      ['SDBH', 'old2'],
    ]);
  });

  test('leaves a target unchanged when the rewrite returns undefined', () => {
    const text = 'see {L:text<SDBH:old>}';
    expect(rewriteCrossReferenceTargets(text, () => undefined)).toBe(text);
  });

  test('leaves a cross-reference without a target alone', () => {
    const rewrite = jest.fn(() => 'NEW');
    expect(rewriteCrossReferenceTargets('see {L:text} here', rewrite)).toBe('see {L:text} here');
    expect(rewrite).not.toHaveBeenCalled();
  });
});

describe('stripStructureSymbols', () => {
  test('removes each structure symbol that is followed by a space, wherever it is', () => {
    expect(stripStructureSymbols('= one ► two ◄ three ≈ four = five')).toEqual({
      text: 'one two three four five',
      counts: { '= ': 2, '► ': 1, '◄ ': 1, '≈ ': 1 },
    });
  });

  test('keeps a symbol not followed by a space, and line breaks', () => {
    expect(stripStructureSymbols('a=b|c ►')).toEqual({
      text: 'a=b|c ►',
      counts: { '= ': 0, '► ': 0, '◄ ': 0, '≈ ': 0 },
    });
  });

  test('trims the result', () => {
    expect(stripStructureSymbols('text ≈ ').text).toBe('text');
  });
});

describe('replaceMeaningLetters', () => {
  test('replaces each letter with its position in the alphabet, as Paratext 9 does', () => {
    expect(replaceMeaningLetters('see {L:x<SDBG:y:000001>}[b] and [c]', 3)).toEqual({
      text: 'see {L:x<SDBG:y:000001>}(2) and (3)',
      replaced: 2,
      singleMeaning: 0,
      outOfRange: 0,
    });
  });

  test('leaves a letter beyond the number of meanings of the base form', () => {
    expect(replaceMeaningLetters('[b] [c]', 2)).toMatchObject({
      text: '(2) [c]',
      replaced: 1,
      outOfRange: 1,
    });
  });

  test.each([[0], [1]])('leaves letters alone when the base form has %p meanings', count => {
    expect(replaceMeaningLetters('[a]', count)).toMatchObject({ text: '[a]', singleMeaning: 1 });
  });

  test('ignores brackets around anything but one lowercase letter', () => {
    expect(replaceMeaningLetters('[A] [ab] [1]', 5).text).toBe('[A] [ab] [1]');
  });
});

describe('cleanUpDefinitions', () => {
  function sense(id: string, definition: string) {
    return { id, definition };
  }

  test('cleans every definition and reports what it did per language', () => {
    const lemmaA = `${ALEF}\u05b2${BET}`; // with hataf patah
    const lemmaB = `${GIMEL}${BET}`;
    const entriesByLanguage = {
      en: {
        [lemmaA]: {
          id: 'entry-1',
          lemma: lemmaA,
          senses: [
            sense('s1a', `= first ► {L:x<SDBH:${ALEF}\u05b0\u05b7${BET}>} [b]`),
            sense('s1b', `{L:y<SDBH:${lemmaB}>} {L:z<SDBH:gone>} {L:w<SDBH:missing>}`),
            sense('s1c', '{L:v<BT-OT:abc>} {L:u<SDBH:onlyFr>}'),
          ],
        },
        [lemmaB]: { id: 'entry-2', lemma: lemmaB, senses: [sense('s2a', '[a]')] },
      },
      fr: {
        onlyFr: { id: 'entry-4', lemma: 'onlyFr', senses: [sense('s4a', 'texte')] },
      },
    };
    const report = cleanUpDefinitions({
      dictionaryId: 'SDBH',
      entriesByLanguage,
      sourceEntries: [
        entry('1', lemmaA),
        entry('2', lemmaB),
        { ...entry('3', 'gone'), excludedByDesign: 'all meanings are marked N or X' },
        entry('4', 'onlyFr'),
      ],
      baseFormMeaningCountBySenseId: new Map([
        ['s1a', 2],
        ['s1b', 2],
        ['s1c', 1],
        ['s2a', 1],
      ]),
    });

    expect(entriesByLanguage.en[lemmaA].senses.map(s => s.definition)).toEqual([
      `first {L:x<SDBH:${lemmaA}>} (2)`,
      `{L:y<SDBH:${lemmaB}>} {L:z<SDBH:gone>} {L:w<SDBH:missing>}`,
      '{L:v<BT-OT:abc>} {L:u<SDBH:onlyFr>}',
    ]);
    expect(entriesByLanguage.en[lemmaB].senses[0].definition).toBe('[a]');

    expect(report.byLanguage.en).toEqual({
      crossReferences: {
        exact: 1,
        nfd: 0,
        noBreakSpace: 0,
        alternateLemma: 0,
        hataf: 1,
        otherDictionary: 1,
        ambiguous: 0,
        notEmitted: 1,
        excludedByDesign: 1,
        unresolved: 1,
      },
      symbols: { '= ': 1, '► ': 1, '◄ ': 0, '≈ ': 0 },
      meaningLetters: { replaced: 1, singleMeaning: 1, outOfRange: 0 },
    });
    expect(report.excludedByDesign).toEqual([
      {
        language: 'en',
        entryId: 'entry-1',
        dictionaryId: 'SDBH',
        target: 'gone',
        count: 1,
        reason: 'entry 3: all meanings are marked N or X',
      },
    ]);
    expect(report.unresolved).toEqual([
      {
        language: 'en',
        entryId: 'entry-1',
        dictionaryId: 'SDBH',
        target: 'missing',
        count: 1,
        reason: 'not found',
      },
      {
        language: 'en',
        entryId: 'entry-1',
        dictionaryId: 'SDBH',
        target: 'onlyFr',
        count: 1,
        reason: 'entry 4 is not output in this language',
      },
    ]);
  });

  test('counts repeated problem targets in one entry together', () => {
    const entriesByLanguage = {
      en: {
        a: {
          id: 'entry-1',
          lemma: 'a',
          senses: [sense('s1', '{L:x<SDBG:q:000000>} {L:y<SDBG:q:000001>}')],
        },
      },
    };
    const report = cleanUpDefinitions({
      dictionaryId: 'SDBG',
      entriesByLanguage,
      sourceEntries: [entry('1', 'a')],
      baseFormMeaningCountBySenseId: new Map([['s1', 1]]),
    });
    expect(report.unresolved).toEqual([
      {
        language: 'en',
        entryId: 'entry-1',
        dictionaryId: 'SDBG',
        target: 'q',
        count: 2,
        reason: 'not found',
      },
    ]);
  });

  test('leaves an ambiguous target unchanged and names the entries it could mean', () => {
    const entriesByLanguage = {
      en: {
        a: { id: 'entry-1', lemma: 'a', senses: [sense('s1', '{L:x<SDBG:q:000000>}')] },
        b: { id: 'entry-2', lemma: 'b', senses: [sense('s2', 'text')] },
      },
    };
    const report = cleanUpDefinitions({
      dictionaryId: 'SDBG',
      entriesByLanguage,
      sourceEntries: [entry('1', 'a', ['q']), entry('2', 'b', ['q'])],
      baseFormMeaningCountBySenseId: new Map(),
    });
    expect(entriesByLanguage.en.a.senses[0].definition).toBe('{L:x<SDBG:q:000000>}');
    expect(report.byLanguage.en.crossReferences.ambiguous).toBe(1);
    expect(report.unresolved).toEqual([
      {
        language: 'en',
        entryId: 'entry-1',
        dictionaryId: 'SDBG',
        target: 'q',
        count: 1,
        reason: 'ambiguous (alternateLemma): entries 1, 2',
      },
    ]);
  });
});

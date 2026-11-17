import {
  cleanUpDefinitions,
  createLemmaLookup,
  findMalformedCrossReferences,
  LemmaIndexEntry,
  LinkedMeaningNumber,
  rewriteOverlongBibleReferences,
  replaceMeaningLetters,
  rewriteCrossReferenceTargets,
  stripLeadingEquals,
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
    const rewrite = jest.fn((dictionaryId: string) => ({ dictionaryId, lemma: 'NEW' }));
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

  test('writes the dictionary the rewrite returns', () => {
    expect(
      rewriteCrossReferenceTargets('{L:t<sdbh:old>}', () => ({
        dictionaryId: 'SDBH',
        lemma: 'new',
      }))
    ).toBe('{L:t<SDBH:new>}');
  });

  test('leaves a cross-reference without a target alone', () => {
    const rewrite = jest.fn(() => ({ dictionaryId: 'SDBG', lemma: 'NEW' }));
    expect(rewriteCrossReferenceTargets('see {L:text} here', rewrite)).toBe('see {L:text} here');
    expect(rewrite).not.toHaveBeenCalled();
  });
});

describe('findMalformedCrossReferences', () => {
  test.each([
    ['has no target', 'see {L:abc} here', '{L:abc} here'],
    ['has no closing brace', 'see {L:abc<SDBH:x> here', '{L:abc<SDBH:x> here'],
    ['has a prefix that is not letters', 'see {L:abc<SD BH:x>} here', '{L:abc<SD BH:x>} here'],
    ['has no prefix', '{L:abc<:x>}', '{L:abc<:x>}'],
  ])('finds a marker that %s', (_, text, excerpt) => {
    expect(findMalformedCrossReferences(text)).toEqual([excerpt]);
  });

  test('finds each malformed marker and skips the well-formed one between them', () => {
    expect(findMalformedCrossReferences('{L:a} {L:b<SDBH:x>} {L:c}')).toEqual([
      '{L:a} {L:b<SDBH:x>} {L:c}',
      '{L:c}',
    ]);
  });

  test('finds nothing in well-formed cross-references', () => {
    expect(findMalformedCrossReferences('{L:a<SDBH:x>} {L:b<SDBG:y:000000>} text')).toEqual([]);
  });

  test('quotes a bounded excerpt', () => {
    expect(findMalformedCrossReferences(`{L:${'x'.repeat(200)}`)[0]).toHaveLength(60);
  });
});

const noUnspaced = { '=': 0, '►': 0, '◄': 0, '≈': 0 };

describe('stripStructureSymbols', () => {
  test('removes each structure symbol that is followed by a space, wherever it is', () => {
    expect(stripStructureSymbols('= one ► two ◄ three ≈ four = five')).toEqual({
      text: 'one two three four five',
      counts: { '= ': 2, '► ': 1, '◄ ': 1, '≈ ': 1 },
      unspaced: noUnspaced,
    });
  });

  test('keeps an equals sign inside a word, and line breaks', () => {
    expect(stripStructureSymbols('a=b|c')).toEqual({
      text: 'a=b|c',
      counts: { '= ': 0, '► ': 0, '◄ ': 0, '≈ ': 0 },
      unspaced: noUnspaced,
    });
  });

  test('removes every ►, ◄ and ≈ whatever follows it, and leaves the text around it', () => {
    expect(stripStructureSymbols('a; ►b ◄c≈d ►')).toEqual({
      text: 'a; b cd',
      counts: { '= ': 0, '► ': 0, '◄ ': 0, '≈ ': 0 },
      unspaced: { '=': 0, '►': 2, '◄': 1, '≈': 1 },
    });
  });

  test('removes an equals sign at the start or after whitespace when a non-space follows it', () => {
    expect(stripStructureSymbols('=man; humans =make an effort; a=b')).toEqual({
      text: 'man; humans make an effort; a=b',
      counts: { '= ': 0, '► ': 0, '◄ ': 0, '≈ ': 0 },
      unspaced: { ...noUnspaced, '=': 2 },
    });
  });

  test('keeps an equals sign that has nothing after it, or only spaces', () => {
    expect(stripStructureSymbols('a =').text).toBe('a =');
    expect(stripStructureSymbols('=').text).toBe('=');
  });

  test('keeps an equals sign inside cross-reference markup', () => {
    const text = '{L:a =b<SDBH:c =d>} =e';
    expect(stripStructureSymbols(text).text).toBe('{L:a =b<SDBH:c =d>} e');
  });

  test('trims the result', () => {
    expect(stripStructureSymbols('text ≈ ').text).toBe('text');
  });
});

describe('stripLeadingEquals', () => {
  test('removes a leading equals sign and the spaces after it', () => {
    expect(stripLeadingEquals('= to speak much')).toBe('to speak much');
    expect(stripLeadingEquals('=word')).toBe('word');
  });

  test('keeps every other equals sign, and all other text, as it is', () => {
    expect(stripLeadingEquals('a = b')).toBe('a = b');
    expect(stripLeadingEquals(' ► x =y ')).toBe(' ► x =y ');
  });
});

describe('replaceMeaningLetters', () => {
  test('replaces each letter with its position in the alphabet, as Paratext 9 does', () => {
    expect(replaceMeaningLetters('see [b] and [c]', 3)).toEqual({
      ...noLetters,
      text: 'see (2) and (3)',
      replaced: 2,
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

  describe('a letter directly after a link', () => {
    // The linked entry's second meaning is shown as number 5
    const numbers: LinkedMeaningNumber = (target, meaningIndex) =>
      target.lemma === 'known' ? (meaningIndex === 1 ? 5 : 'noMeaning') : 'unresolved';

    test('is numbered by the linked entry, not by the current one', () => {
      expect(replaceMeaningLetters('{L:x<SDBG:known:000001>}[b]', 1, numbers)).toEqual({
        ...noLetters,
        text: '{L:x<SDBG:known:000001>}(5)',
        linkedReplaced: 1,
        linkedPositionAgrees: 1,
      });
    });

    test('reports a meaning position that names another meaning, or none', () => {
      expect(
        replaceMeaningLetters('{L:x<SDBG:known:000000>}[b] {L:y<SDBG:known>}[b]', 1, numbers)
      ).toMatchObject({ linkedReplaced: 2, linkedPositionDiffers: 1, linkedPositionAbsent: 1 });
    });

    test('is left alone when the linked entry has no such meaning', () => {
      expect(replaceMeaningLetters('{L:x<SDBG:known>}[c]', 9, numbers)).toEqual({
        ...noLetters,
        text: '{L:x<SDBG:known>}[c]',
        linkedNoMeaning: 1,
      });
    });

    test('is left alone when the link does not resolve, whatever the current entry has', () => {
      expect(replaceMeaningLetters('{L:x<SDBG:other>}[a]', 9, numbers)).toEqual({
        ...noLetters,
        text: '{L:x<SDBG:other>}[a]',
        linkedUnresolved: 1,
      });
    });

    test('does not affect a letter that is not directly after a link', () => {
      expect(replaceMeaningLetters('{L:x<SDBG:known>} [b] [a]', 2, numbers)).toMatchObject({
        text: '{L:x<SDBG:known>} (2) (1)',
        replaced: 2,
      });
    });
  });
});

const noLetters = {
  replaced: 0,
  singleMeaning: 0,
  outOfRange: 0,
  linkedReplaced: 0,
  linkedUnresolved: 0,
  linkedNoMeaning: 0,
  linkedPositionAgrees: 0,
  linkedPositionDiffers: 0,
  linkedPositionAbsent: 0,
};

const emptyReferenceCounts = {
  exact: 0,
  nfd: 0,
  noBreakSpace: 0,
  alternateLemma: 0,
  hataf: 0,
  otherDictionary: 0,
  unknownDictionary: 0,
  ambiguous: 0,
  notEmitted: 0,
  excludedByDesign: 0,
  unresolved: 0,
};

describe('rewriteOverlongBibleReferences', () => {
  test('rewrites a 17-digit run to a whole-verse reference', () => {
    expect(rewriteOverlongBibleReferences('see {S:01300301900000000} here')).toEqual({
      text: 'see {S:01300301900000} here',
      rewritten: [{ original: '01300301900000000', rewritten: '01300301900000' }],
      unresolved: [],
    });
  });

  test('keeps only the verse of a run whose trailing digits are not zero', () => {
    expect(rewriteOverlongBibleReferences('{S:00101903800100200}').text).toBe('{S:00101903800000}');
  });

  test('rewrites a run of any length over 14 digits', () => {
    expect(rewriteOverlongBibleReferences('{S:0010190381234567}').text).toBe('{S:00101903800000}');
    expect(rewriteOverlongBibleReferences('{S:001019038123456}').text).toBe('{S:00101903800000}');
  });

  test('leaves a valid 14-digit reference, a range and shorter runs untouched', () => {
    const text = '{S:00101903800100} {S:00101903800100-00101903900200} {S:0010190380010}';
    expect(rewriteOverlongBibleReferences(text)).toEqual({ text, rewritten: [], unresolved: [] });
  });

  test('leaves a run whose verse, chapter or book is not valid, and lists it', () => {
    for (const run of [
      '00101900000000000',
      '00100003800000000',
      '99901903800000000',
      '00001903800000000',
    ]) {
      const text = `{S:${run}}`;
      expect(rewriteOverlongBibleReferences(text)).toEqual({
        text,
        rewritten: [],
        unresolved: [run],
      });
    }
  });

  test('rewrites only the over-long run of a multi-reference marker', () => {
    expect(
      rewriteOverlongBibleReferences('{S:00101903800100 01300301900000000-00201900100200}')
    ).toEqual({
      text: '{S:00101903800100 01300301900000-00201900100200}',
      rewritten: [{ original: '01300301900000000', rewritten: '01300301900000' }],
      unresolved: [],
    });
  });

  test('rewrites each over-long run in a marker, and other markers in the text', () => {
    const result = rewriteOverlongBibleReferences(
      '{S:0010190380010020 00101903800100} {L:x<SDBH:y>} {S:00201900100200000}'
    );
    expect(result.text).toBe('{S:00101903800000 00101903800100} {L:x<SDBH:y>} {S:00201900100000}');
    expect(result.rewritten).toHaveLength(2);
  });

  test('does not touch digit runs outside a {S:} marker', () => {
    const text = 'number 01300301900000000 and {N:01300301900000000}';
    expect(rewriteOverlongBibleReferences(text).text).toBe(text);
  });
});

describe('cleanUpDefinitions', () => {
  function sense(id: string, definition: string) {
    return { id, definition };
  }

  test('rewrites over-long Bible references in definitions and glosses and reports them', () => {
    const entriesByLanguage = {
      en: {
        abc: {
          id: 'entry-1',
          senses: [
            {
              id: 's1',
              definition: 'in {S:01300301900000000} and {S:00100000000000000}',
              glosses: ['also {S:00101903800100200}', 'fine {S:00101903800100}'],
            },
          ],
        },
      },
    };
    const report = cleanUpDefinitions({
      dictionaryId: 'SDBH',
      entriesByLanguage,
      sourceEntries: [],
      baseFormMeaningCountBySenseId: new Map(),
      meaningSenseIdsByEntryId: new Map(),
    });
    const [sense] = entriesByLanguage.en.abc.senses;
    expect(sense.definition).toBe('in {S:01300301900000} and {S:00100000000000000}');
    expect(sense.glosses).toEqual(['also {S:00101903800000}', 'fine {S:00101903800100}']);
    expect(report.byLanguage.en.bibleReferences).toEqual({ rewritten: 2, unresolved: 1 });
    expect(report.rewrittenBibleReferences).toEqual([
      {
        language: 'en',
        field: 'definition',
        entryId: 'entry-1',
        original: '01300301900000000',
        rewritten: '01300301900000',
      },
      {
        language: 'en',
        field: 'gloss',
        entryId: 'entry-1',
        original: '00101903800100200',
        rewritten: '00101903800000',
      },
    ]);
    expect(report.unresolvedBibleReferences).toEqual([
      { language: 'en', field: 'definition', entryId: 'entry-1', original: '00100000000000000' },
    ]);
  });

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
      meaningSenseIdsByEntryId: new Map(),
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
        unknownDictionary: 0,
        ambiguous: 0,
        notEmitted: 1,
        excludedByDesign: 1,
        unresolved: 1,
      },
      glossCrossReferences: emptyReferenceCounts,
      malformedCrossReferences: 0,
      symbols: { '= ': 1, '► ': 1, '◄ ': 0, '≈ ': 0 },
      unspacedSymbols: noUnspaced,
      glossLeadingEquals: 0,
      bibleReferences: { rewritten: 0, unresolved: 0 },
      meaningLetters: { ...noLetters, replaced: 1, singleMeaning: 1 },
    });
    expect(report.excludedByDesign).toEqual([
      {
        language: 'en',
        field: 'definition',
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
        field: 'definition',
        entryId: 'entry-1',
        dictionaryId: 'SDBH',
        target: 'missing',
        count: 1,
        reason: 'not found',
      },
      {
        language: 'en',
        field: 'definition',
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
      meaningSenseIdsByEntryId: new Map(),
    });
    expect(report.unresolved).toEqual([
      {
        language: 'en',
        field: 'definition',
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
      meaningSenseIdsByEntryId: new Map(),
    });
    expect(entriesByLanguage.en.a.senses[0].definition).toBe('{L:x<SDBG:q:000000>}');
    expect(report.byLanguage.en.crossReferences.ambiguous).toBe(1);
    expect(report.unresolved).toEqual([
      {
        language: 'en',
        field: 'definition',
        entryId: 'entry-1',
        dictionaryId: 'SDBG',
        target: 'q',
        count: 1,
        reason: 'ambiguous (alternateLemma): entries 1, 2',
      },
    ]);
  });

  describe('dictionary prefixes', () => {
    function clean(dictionaryId: string, definition: string, glosses: string[] = []) {
      const entriesByLanguage = {
        en: { a: { id: 'entry-1', senses: [{ id: 's1', definition, glosses }] } },
      };
      const report = cleanUpDefinitions({
        dictionaryId,
        entriesByLanguage,
        sourceEntries: [entry('1', 'a')],
        baseFormMeaningCountBySenseId: new Map(),
        meaningSenseIdsByEntryId: new Map(),
      });
      return { sense: entriesByLanguage.en.a.senses[0], report };
    }

    test('resolves a prefix that differs from the dictionary ID only in case and writes the canonical one', () => {
      const { sense, report } = clean('SDBH', '{L:x<sdbh:a>}', ['{L:y<Sdbh:a>}']);
      expect(sense.definition).toBe('{L:x<SDBH:a>}');
      expect(sense.glosses).toEqual(['{L:y<SDBH:a>}']);
      expect(report.byLanguage.en.crossReferences.exact).toBe(1);
      expect(report.byLanguage.en.glossCrossReferences.exact).toBe(1);
    });

    test("strips a gloss's leading equals sign and counts it, leaving other gloss text alone", () => {
      const { sense, report } = clean('SDBH', '=a ►b', ['= x', '►y = z']);
      expect(sense.definition).toBe('a b');
      expect(sense.glosses).toEqual(['x', '►y = z']);
      expect(report.byLanguage.en.glossLeadingEquals).toBe(1);
      expect(report.byLanguage.en.unspacedSymbols).toEqual({ ...noUnspaced, '=': 1, '►': 1 });
    });

    test('lists a lower-case target that matches no entry as unresolved', () => {
      const { sense, report } = clean('SDBG', '{L:x<sdbg:missing:000000>}');
      expect(sense.definition).toBe('{L:x<sdbg:missing:000000>}');
      expect(report.unresolved).toMatchObject([{ dictionaryId: 'sdbg', target: 'missing' }]);
    });

    test.each(['BT-OT', 'REALIA', 'SDBG'])(
      'leaves a target in the known dictionary %s alone',
      id => {
        const { sense, report } = clean('SDBH', `{L:x<${id}:a>}`);
        expect(sense.definition).toBe(`{L:x<${id}:a>}`);
        expect(report.byLanguage.en.crossReferences.otherDictionary).toBe(1);
        expect(report.unresolved).toEqual([]);
      }
    );

    test.each(['aSDBH', 'SDB', 'SD', 'sdbg'])(
      'reports a target with the unknown dictionary %s and leaves it unchanged',
      id => {
        const { sense, report } = clean('SDBH', `{L:x<${id}:a>}`);
        expect(sense.definition).toBe(`{L:x<${id}:a>}`);
        expect(report.byLanguage.en.crossReferences.unknownDictionary).toBe(1);
        expect(report.unresolved).toMatchObject([
          { dictionaryId: id, target: 'a', reason: 'unknown dictionary' },
        ]);
      }
    );
  });

  test('rewrites cross-reference targets in glosses and counts them apart from definitions', () => {
    const lemmaA = `${ALEF}\u05b2${BET}`;
    const entriesByLanguage = {
      en: {
        [lemmaA]: {
          id: 'entry-1',
          senses: [
            {
              id: 's1',
              definition: '{L:x<SDBH:abc>}',
              glosses: [`{L:y<SDBH:${ALEF}\u05b0\u05b7${BET}>}`, '{L:z<SDBH:missing>}', 'plain'],
            },
          ],
        },
        abc: { id: 'entry-2', senses: [{ id: 's2', definition: 'text' }] },
      },
    };
    const report = cleanUpDefinitions({
      dictionaryId: 'SDBH',
      entriesByLanguage,
      sourceEntries: [entry('1', lemmaA), entry('2', 'abc')],
      baseFormMeaningCountBySenseId: new Map(),
      meaningSenseIdsByEntryId: new Map(),
    });
    expect(entriesByLanguage.en[lemmaA].senses[0].glosses).toEqual([
      `{L:y<SDBH:${lemmaA}>}`,
      '{L:z<SDBH:missing>}',
      'plain',
    ]);
    expect(report.byLanguage.en.glossCrossReferences).toEqual({
      ...emptyReferenceCounts,
      hataf: 1,
      unresolved: 1,
    });
    expect(report.byLanguage.en.crossReferences.exact).toBe(1);
    expect(report.unresolved).toMatchObject([{ field: 'gloss', target: 'missing' }]);
  });

  test('does not strip symbols or number letters in glosses', () => {
    const entriesByLanguage = {
      en: {
        a: { id: 'entry-1', senses: [{ id: 's1', definition: 'd', glosses: ['a = that is [b]'] }] },
      },
    };
    cleanUpDefinitions({
      dictionaryId: 'SDBH',
      entriesByLanguage,
      sourceEntries: [entry('1', 'a')],
      baseFormMeaningCountBySenseId: new Map([['s1', 3]]),
      meaningSenseIdsByEntryId: new Map(),
    });
    expect(entriesByLanguage.en.a.senses[0].glosses).toEqual(['a = that is [b]']);
  });

  test('lists malformed markers per language and entry and leaves the text unchanged', () => {
    const entriesByLanguage = {
      en: {
        a: {
          id: 'entry-1',
          senses: [{ id: 's1', definition: '{L:x} and {L:y<SDBH:a>} and {L:x}' }],
        },
      },
    };
    const report = cleanUpDefinitions({
      dictionaryId: 'SDBH',
      entriesByLanguage,
      sourceEntries: [entry('1', 'a')],
      baseFormMeaningCountBySenseId: new Map(),
      meaningSenseIdsByEntryId: new Map(),
    });
    expect(entriesByLanguage.en.a.senses[0].definition).toBe('{L:x} and {L:y<SDBH:a>} and {L:x}');
    expect(report.byLanguage.en.malformedCrossReferences).toBe(2);
    expect(report.malformed).toEqual([
      {
        language: 'en',
        entryId: 'entry-1',
        excerpt: '{L:x} and {L:y<SDBH:a>} and {L:x}',
        count: 1,
      },
      { language: 'en', entryId: 'entry-1', excerpt: '{L:x}', count: 1 },
    ]);
  });

  describe('meaning letters after a link', () => {
    // Linked entry "multi" has two base forms; base form 1 has three meanings, the middle one is
    // not output, so the panel numbers the output senses 1 to 4 across the whole entry
    const multiSenses = ['m00', 'm10', 'm12', 'm01'].map(id => sense(id, 'meaning'));
    const meaningSenseIdsByEntryId = new Map([
      [
        '2',
        [
          ['m00', 'm01'],
          ['m10', 'm11', 'm12'],
        ],
      ],
    ]);

    function clean(definition: string, currentEntryMeanings = 1) {
      const entriesByLanguage = {
        en: {
          current: { id: 'entry-1', lemma: 'current', senses: [sense('c0', definition)] },
          multi: { id: 'entry-2', lemma: 'multi', senses: multiSenses },
        },
      };
      const report = cleanUpDefinitions({
        dictionaryId: 'SDBG',
        entriesByLanguage,
        sourceEntries: [entry('1', 'current'), entry('2', 'multi')],
        baseFormMeaningCountBySenseId: new Map([['c0', currentEntryMeanings]]),
        meaningSenseIdsByEntryId,
      });
      return { definition: entriesByLanguage.en.current.senses[0].definition, report };
    }

    test('numbers a letter by the linked entry when the current entry has one meaning', () => {
      const { definition, report } = clean('{L:x<SDBG:multi:000001>}[b]');
      expect(definition).toBe('{L:x<SDBG:multi:000001>}(4)');
      expect(report.byLanguage.en.meaningLetters).toMatchObject({
        linkedReplaced: 1,
        linkedPositionAgrees: 1,
      });
    });

    test('uses the base form the target names', () => {
      expect(clean('{L:x<SDBG:multi:001002>}[c]').definition).toBe('{L:x<SDBG:multi:001002>}(3)');
    });

    test('uses the first base form when the target names none', () => {
      expect(clean('{L:x<SDBG:multi>}[a]').definition).toBe('{L:x<SDBG:multi>}(1)');
    });

    test('leaves a letter beyond the linked entry meanings, or for a meaning not output', () => {
      const { definition, report } = clean(
        '{L:x<SDBG:multi:000000>}[c] {L:y<SDBG:multi:001000>}[b]'
      );
      expect(definition).toBe('{L:x<SDBG:multi:000000>}[c] {L:y<SDBG:multi:001000>}[b]');
      expect(report.byLanguage.en.meaningLetters.linkedNoMeaning).toBe(2);
    });

    test('leaves a letter after a link that does not resolve', () => {
      const { definition, report } = clean('{L:x<SDBG:missing:000000>}[a]');
      expect(definition).toBe('{L:x<SDBG:missing:000000>}[a]');
      expect(report.byLanguage.en.meaningLetters.linkedUnresolved).toBe(1);
    });

    test('numbers a letter with no link before it by the current entry, as Paratext 9 does', () => {
      expect(clean('see [b]').definition).toBe('see [b]');
      expect(clean('see [b]', 2).definition).toBe('see (2)');
    });
  });
});

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

/**
 * A `ContextualMeaning` (under `CONMeanings`) of a lexical meaning, with its own references
 * and sense
 */
interface ContextualMeaningSpec {
  id: string;
  references?: string[];
  definition?: string;
}

interface MeaningSpec {
  id: string;
  /** Extra attributes on the LEXMeaning, such as `IsBiblicalTerm="N"` */
  attributes?: string;
  references?: string[];
  definition?: string;
  glosses?: string[];
  contextualMeanings?: ContextualMeaningSpec[];
}

interface BaseFormSpec {
  id: string;
  meanings: MeaningSpec[];
}

interface FixtureOptions {
  entryAttributes?: string;
  baseFormAttributes?: string;
  meaningAttributes?: string;
  senseAttributes?: string;
  references?: string[];
  /** The English definition of the default meaning */
  definition?: string;
  /** The English glosses of the default meaning */
  glosses?: string[];
  /** Contextual meanings of the default meaning */
  contextualMeanings?: ContextualMeaningSpec[];
  /** The Lemma of a second entry (Id 000002000000000) to add to the file */
  secondEntryLemma?: string;
  /** Replaces the default single base form of the first entry */
  baseForms?: BaseFormSpec[];
  /** The base forms of the second entry, which has one meaning by default */
  secondEntryBaseForms?: BaseFormSpec[];
}

const referencesXml = (tag: string, container: string, references: string[]): string =>
  `<${container}>${references.map(ref => `<${tag}>${ref}</${tag}>`).join('')}</${container}>`;

/** `kind` is `LEX` for a lexical meaning's senses and `CON` for a contextual meaning's */
function senseXml(
  kind: 'LEX' | 'CON',
  attributes: string,
  definition: string,
  glosses = ['a gloss']
): string {
  return `<${kind}Senses>
              <${kind}Sense ${attributes}>
                <DefinitionShort>${definition}</DefinitionShort>
                <Glosses>${glosses.map(gloss => `<Gloss>${gloss}</Gloss>`).join('')}</Glosses>
              </${kind}Sense>
            </${kind}Senses>`;
}

function meaningXml(meaning: MeaningSpec, senseAttributes: string): string {
  const contextual = (meaning.contextualMeanings ?? [])
    .map(
      con => `<ContextualMeaning Id="${con.id}">
              ${referencesXml('CONReference', 'CONReferences', con.references ?? [])}
              ${senseXml('CON', senseAttributes, con.definition ?? 'a contextual definition')}
            </ContextualMeaning>`
    )
    .join('');
  return `<LEXMeaning ${meaning.attributes ?? ''}>
            ${referencesXml('LEXReference', 'LEXReferences', meaning.references ?? [])}
            ${senseXml('LEX', senseAttributes, meaning.definition ?? 'a definition', meaning.glosses)}
            <CONMeanings>${contextual}</CONMeanings>
          </LEXMeaning>`;
}

function lexiconFile(options: FixtureOptions = {}): string {
  const {
    entryAttributes = 'Id="000001000000000" Lemma="lemma" Version="3"',
    baseFormAttributes = 'Id="000001001000000"',
    meaningAttributes = 'Id="000001001001000"',
    senseAttributes = 'LanguageCode="en"',
    references = ['04200100100002'],
    definition,
    glosses,
    contextualMeanings,
    secondEntryLemma,
    baseForms,
    secondEntryBaseForms,
  } = options;
  const baseFormsXml = (forms: BaseFormSpec[]) =>
    forms
      .map(
        form => `<BaseForm Id="${form.id}">
        <LEXMeanings>${form.meanings
          .map(meaning =>
            meaningXml(
              { ...meaning, attributes: `Id="${meaning.id}" ${meaning.attributes ?? ''}` },
              senseAttributes
            )
          )
          .join('')}</LEXMeanings>
      </BaseForm>`
      )
      .join('');
  const entryXml = (attributes: string, forms: string) => `
  <Lexicon_Entry ${attributes}>
    <BaseForms>${forms}</BaseForms>
  </Lexicon_Entry>`;
  const defaultBaseForm = (baseFormId: string, meaning: MeaningSpec) =>
    `<BaseForm ${baseFormId}>
        <LEXMeanings>${meaningXml(meaning, senseAttributes)}</LEXMeanings>
      </BaseForm>`;
  const firstForms = baseForms
    ? baseFormsXml(baseForms)
    : defaultBaseForm(baseFormAttributes, {
        id: '',
        attributes: meaningAttributes,
        references,
        definition,
        glosses,
        contextualMeanings,
      });
  const secondForms = secondEntryBaseForms
    ? baseFormsXml(secondEntryBaseForms)
    : defaultBaseForm('Id="000002001000000"', {
        id: '',
        attributes: 'Id="000002001001000"',
        references,
      });
  const secondEntry = secondEntryLemma
    ? entryXml(`Id="000002000000000" Lemma="${secondEntryLemma}" Version="3"`, secondForms)
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<Lexicon>${entryXml(entryAttributes, firstForms)}${secondEntry}
</Lexicon>`;
}

/**
 * The `Id` of each Entry, the `Id` of each Sense and the text of each Occurrence in a converted
 * language file
 */
function readOutput(outputDir: string): {
  entryIds: string[];
  senseIds: string[];
  occurrences: string[];
} {
  const xml = fs.readFileSync(path.join(outputDir, 'lexicon_en.xml'), 'utf-8');
  return {
    entryIds: Array.from(xml.matchAll(/<Entry [^>]*\bId="([^"]*)"/g), match => match[1]),
    senseIds: Array.from(xml.matchAll(/<Sense [^>]*\bId="([^"]*)"/g), match => match[1]),
    occurrences: Array.from(xml.matchAll(/<Occurrence [^>]*>([^<]*)</g), match => match[1]),
  };
}

/** The text of each Definition in a converted language file, in order */
function readDefinitions(outputDir: string): string[] {
  const xml = fs.readFileSync(path.join(outputDir, 'lexicon_en.xml'), 'utf-8');
  return Array.from(xml.matchAll(/<Definition>([^<]*)<\/Definition>/g), match => match[1]);
}

describe('convert-marble-lexicon', () => {
  let tempDir: string;
  let inputDir: string;
  let outputDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-lexicon-test-'));
    inputDir = path.join(tempDir, 'input');
    outputDir = path.join(tempDir, 'output');
    fs.mkdirSync(inputDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function convert(dictionaryType: 'SDBG' | 'SDBH', options: FixtureOptions | undefined) {
    if (options)
      fs.writeFileSync(path.join(inputDir, `${dictionaryType}-01.XML`), lexiconFile(options));
    // Run ts-node through node itself: the .bin shim cannot be spawned directly on Windows
    const result = spawnSync(
      process.execPath,
      [
        require.resolve('ts-node/dist/bin.js'),
        '--transpile-only',
        'src/convert-marble-lexicon.ts',
        '--dictionary-type',
        dictionaryType,
        '--input',
        inputDir,
        '--output',
        outputDir,
        '--version',
        '1',
      ],
      { cwd: repoRoot, encoding: 'utf-8' }
    );
    // A spawn failure (such as a missing executable) must not pass as a conversion failure
    expect(result.error).toBeUndefined();
    return result;
  }

  test('converts a valid entry', () => {
    const result = convert('SDBG', {});

    expect(result.status).toBe(0);
    expect(readOutput(outputDir)).toEqual({
      entryIds: ['000001'],
      senseIds: ['000001001001000'],
      occurrences: ['LUK 1:1!1'],
    });
  }, 60000);

  test('fails and names the directory when it holds no lexicon files', () => {
    const result = convert('SDBG', undefined);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No lexicon files');
    expect(result.stderr).toContain(inputDir);
    expect(fs.existsSync(path.join(outputDir, 'lexicon_en.xml'))).toBe(false);
  }, 60000);

  test('fails and names the reference, entry and file for an invalid LEXReference', () => {
    const result = convert('SDBG', { references: ['04200100100002', 'olumn1'] });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('olumn1');
    expect(result.stderr).toContain('000001000000000');
    expect(result.stderr).toContain('SDBG-01.XML');
  }, 60000);

  test('fails and names the reference for an unknown book number', () => {
    const result = convert('SDBG', { references: ['99900100100002'] });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('99900100100002');
  }, 60000);

  test('skips odd word IDs and word-0 references', () => {
    const result = convert('SDBG', {
      references: ['04200100100002', '04200100100003', '04200100100000'],
    });

    expect(result.status).toBe(0);
    expect(readOutput(outputDir).occurrences).toEqual(['LUK 1:1!1']);
  }, 60000);

  test.each([
    ['an entry without an Id', { entryAttributes: 'Lemma="lemma" Version="3"' }],
    ['an entry without a Lemma', { entryAttributes: 'Id="000001000000000" Version="3"' }],
    ['a base form without an Id', { baseFormAttributes: '' }],
    ['a lexical meaning without an Id', { meaningAttributes: '' }],
    ['a sense without a LanguageCode', { senseAttributes: '' }],
  ])(
    'fails for %s',
    (_description, options: FixtureOptions) => {
      const result = convert('SDBG', options);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('SDBG-01.XML');
      // The error is printed once, and without a stack trace: it is a data error
      expect(result.stderr.match(/Error processing file/g)).toHaveLength(1);
      expect(result.stderr).not.toMatch(/^\s+at /m);
    },
    60000
  );

  test('fails for an SDBH entry whose Version is missing', () => {
    const result = convert('SDBH', { entryAttributes: 'Id="000001000000000" Lemma="lemma"' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('000001000000000');
  }, 60000);

  test('fails for an SDBH entry whose Version is not a number', () => {
    const result = convert('SDBH', {
      entryAttributes: 'Id="000001000000000" Lemma="lemma" Version="x"',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('000001000000000');
    expect(result.stderr).toContain('Version');
  }, 60000);

  test('leaves out an SDBH entry with a version below the minimum', () => {
    const result = convert('SDBH', {
      entryAttributes: 'Id="000001000000000" Lemma="lemma" Version="2"',
      secondEntryLemma: 'other',
    });

    expect(result.status).toBe(0);
    expect(readOutput(outputDir).entryIds).toEqual(['000002']);
  }, 60000);

  test('does not use the version of an SDBG entry', () => {
    const result = convert('SDBG', { entryAttributes: 'Id="000001000000000" Lemma="lemma"' });

    expect(result.status).toBe(0);
    expect(readOutput(outputDir).entryIds).toEqual(['000001']);
  }, 60000);

  test('fails for a meaning ID that starts with another entry number', () => {
    const result = convert('SDBG', { meaningAttributes: 'Id="000002001001000"' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('000002001001000');
  }, 60000);

  test('fails for two entries with the same lemma and different Ids', () => {
    const result = convert('SDBG', { secondEntryLemma: 'lemma' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('000001000000000');
    expect(result.stderr).toContain('000002000000000');
    expect(result.stderr).toContain('lemma');
  }, 60000);

  test('keeps two entries with different lemmas apart', () => {
    const result = convert('SDBG', { secondEntryLemma: 'other' });

    expect(result.status).toBe(0);
    expect(readOutput(outputDir).entryIds).toEqual(['000001', '000002']);
  }, 60000);

  const CONTEXTUAL_ONLY_REFERENCE = '04200100200002';

  test('does not output a contextual meaning as a sense', () => {
    const result = convert('SDBG', {
      contextualMeanings: [{ id: '000001001001001', references: ['04200100100002'] }],
    });

    expect(result.status).toBe(0);
    expect(readOutput(outputDir).senseIds).toEqual(['000001001001000']);
  }, 60000);

  test('takes occurrences only from the lexical meaning, not from its contextual meanings', () => {
    const result = convert('SDBG', {
      references: ['04200100100002'],
      contextualMeanings: [
        { id: '000001001001001', references: ['04200100100002', CONTEXTUAL_ONLY_REFERENCE] },
      ],
    });

    expect(result.status).toBe(0);
    expect(readOutput(outputDir).occurrences).toEqual(['LUK 1:1!1']);
  }, 60000);

  test('warns about a CONReference missing from its lexical meaning and still exits 0', () => {
    const result = convert('SDBG', {
      references: ['04200100100002'],
      contextualMeanings: [{ id: '000001001001001', references: [CONTEXTUAL_ONLY_REFERENCE] }],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(`CONReference ${CONTEXTUAL_ONLY_REFERENCE}`);
    expect(result.stderr).toContain('000001001001001');
    expect(result.stderr).toContain('is not in the lexical meaning');
  }, 60000);

  test('does not warn when every CONReference is in its lexical meaning', () => {
    const result = convert('SDBG', {
      references: ['04200100100002'],
      contextualMeanings: [{ id: '000001001001001', references: ['04200100100002'] }],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('CONReference');
  }, 60000);

  describe('IsBiblicalTerm', () => {
    const baseForms = (flag: string): BaseFormSpec[] => [
      {
        id: '000001001000000',
        meanings: [
          { id: '000001001001000', attributes: `IsBiblicalTerm="${flag}"` },
          { id: '000001001002000', references: ['04200100300002'] },
        ],
      },
    ];

    test.each(['N', 'X'])(
      'SDBH leaves out a meaning marked %s',
      flag => {
        const result = convert('SDBH', { baseForms: baseForms(flag) });

        expect(result.status).toBe(0);
        expect(readOutput(outputDir).senseIds).toEqual(['000001001002000']);
        expect(readOutput(outputDir).occurrences).toEqual(['LUK 1:3!1']);
      },
      60000
    );

    test('SDBH keeps a meaning marked Y', () => {
      const result = convert('SDBH', { baseForms: baseForms('Y') });

      expect(result.status).toBe(0);
      expect(readOutput(outputDir).senseIds).toEqual(['000001001001000', '000001001002000']);
    }, 60000);

    test.each(['N', 'X'])(
      'SDBG keeps a meaning marked %s as a sense with no occurrences',
      flag => {
        const result = convert('SDBG', { baseForms: baseForms(flag) });

        expect(result.status).toBe(0);
        const output = readOutput(outputDir);
        expect(output.senseIds).toEqual(['000001001001000', '000001001002000']);
        // Only the second meaning's occurrence; the marked meaning's own is not linked
        expect(output.occurrences).toEqual(['LUK 1:3!1']);
      },
      60000
    );

    test('SDBG gives a marked meaning no occurrences even when it has references', () => {
      const result = convert('SDBG', {
        baseForms: [
          {
            id: '000001001000000',
            meanings: [
              {
                id: '000001001001000',
                attributes: 'IsBiblicalTerm="N"',
                references: ['04200100100002'],
              },
            ],
          },
        ],
      });

      expect(result.status).toBe(0);
      expect(readOutput(outputDir).senseIds).toEqual(['000001001001000']);
      expect(readOutput(outputDir).occurrences).toEqual([]);
    }, 60000);
  });

  describe('definition clean-up', () => {
    test('removes a structure symbol and numbers a letter by the linked entry', () => {
      const result = convert('SDBG', {
        definition: '= first sense {L:x&lt;SDBG:otherlemma&gt;}[b]',
        secondEntryLemma: 'otherlemma',
        secondEntryBaseForms: [
          {
            id: '000002001000000',
            meanings: [{ id: '000002001001000' }, { id: '000002001002000' }],
          },
        ],
      });

      expect(result.status).toBe(0);
      // The symbol is removed and `[b]` is numbered by the linked entry's second meaning
      expect(readDefinitions(outputDir)[0]).toBe('first sense {L:x&lt;SDBG:otherlemma&gt;}(2)');
    }, 60000);

    test('numbers a bare letter by its panel position, not its alphabet position', () => {
      const result = convert('SDBG', {
        baseForms: [
          { id: '000001001000000', meanings: [{ id: '000001001001000' }] },
          {
            id: '000001002000000',
            meanings: [
              { id: '000001002001000', definition: 'see [a]' },
              { id: '000001002002000', definition: 'plain' },
            ],
          },
        ],
      });

      expect(result.status).toBe(0);
      expect(readDefinitions(outputDir)).toEqual(['a definition', 'see (2)', 'plain']);
    }, 60000);

    test('counts a meaning marked N when numbering a letter, so [b] can be the first output sense', () => {
      const result = convert('SDBH', {
        baseForms: [
          {
            id: '000001001000000',
            meanings: [
              { id: '000001001001000', attributes: 'IsBiblicalTerm="N"' },
              { id: '000001001002000', attributes: 'IsBiblicalTerm="Y"' },
              {
                id: '000001001003000',
                attributes: 'IsBiblicalTerm="Y"',
                definition: 'see [b]',
              },
            ],
          },
        ],
      });

      expect(result.status).toBe(0);
      // The meaning marked N is not output, but still counts as `[a]`, so `[b]` is the first
      // output sense
      expect(readDefinitions(outputDir)).toEqual(['a definition', 'see (1)']);
    }, 60000);

    test.each([
      ['no glosses', []],
      ['only a gloss that the clean-up empties', ['=']],
    ])(
      'fails when the clean-up leaves a sense with no definition and %s',
      (_description, glosses: string[]) => {
        const result = convert('SDBG', { definition: '&#x25C4;', glosses });

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('000001001001000');
        expect(result.stderr).toContain('no definition and no non-empty gloss');
        expect(fs.existsSync(path.join(outputDir, 'lexicon_en.xml'))).toBe(false);
      },
      60000
    );
  });
});

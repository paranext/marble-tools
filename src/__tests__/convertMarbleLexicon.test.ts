import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

interface FixtureOptions {
  entryAttributes?: string;
  baseFormAttributes?: string;
  meaningAttributes?: string;
  senseAttributes?: string;
  references?: string[];
}

function lexiconFile(options: FixtureOptions = {}): string {
  const {
    entryAttributes = 'Id="000001000000000" Lemma="lemma" Version="3"',
    baseFormAttributes = 'Id="000001001000000"',
    meaningAttributes = 'Id="000001001001000"',
    senseAttributes = 'LanguageCode="en"',
    references = ['04200100100002'],
  } = options;
  const referenceXml = references.map(ref => `<LEXReference>${ref}</LEXReference>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<Lexicon>
  <Lexicon_Entry ${entryAttributes}>
    <BaseForms>
      <BaseForm ${baseFormAttributes}>
        <LEXMeanings>
          <LEXMeaning ${meaningAttributes}>
            <LEXReferences>${referenceXml}</LEXReferences>
            <LEXSenses>
              <LEXSense ${senseAttributes}>
                <DefinitionShort>a definition</DefinitionShort>
                <Glosses><Gloss>a gloss</Gloss></Glosses>
              </LEXSense>
            </LEXSenses>
          </LEXMeaning>
        </LEXMeanings>
      </BaseForm>
    </BaseForms>
  </Lexicon_Entry>
</Lexicon>`;
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

  function convert(dictionaryType: 'SDBG' | 'SDBH', options: FixtureOptions) {
    fs.writeFileSync(path.join(inputDir, `${dictionaryType}-01.XML`), lexiconFile(options));
    return spawnSync(
      path.join(repoRoot, 'node_modules/.bin/ts-node'),
      [
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
  }

  test('converts a valid entry', () => {
    const result = convert('SDBG', {});

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'lexicon_en.xml'))).toBe(true);
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

  test('still skips odd word IDs and word-0 references', () => {
    const result = convert('SDBG', {
      references: ['04200100100002', '04200100100003', '04200100100000'],
    });

    expect(result.status).toBe(0);
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
  }, 60000);

  test('leaves out an SDBH entry with a version below the minimum', () => {
    const result = convert('SDBH', {
      entryAttributes: 'Id="000001000000000" Lemma="lemma" Version="2"',
    });

    expect(result.status).toBe(0);
  }, 60000);

  test('does not use the version of an SDBG entry', () => {
    const result = convert('SDBG', { entryAttributes: 'Id="000001000000000" Lemma="lemma"' });

    expect(result.status).toBe(0);
  }, 60000);

  test('fails for a meaning ID that starts with another entry number', () => {
    const result = convert('SDBG', { meaningAttributes: 'Id="000002001001000"' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('000002001001000');
  }, 60000);
});

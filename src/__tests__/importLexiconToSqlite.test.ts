import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';

const repoRoot = path.resolve(__dirname, '../..');

function lexiconXml(entries: string, attributes = '', language = 'en', taxonomies = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<LexicalReferenceText Id="TEST" DataVersion="1" SchemaVersion="1.0" Language="${language}" ${attributes}>
  ${taxonomies ? `<Taxonomies>${taxonomies}</Taxonomies>` : ''}
  <Entries>${entries}</Entries>
</LexicalReferenceText>`;
}

function entryXml(id: string, lemma: string, senseIds: string[]): string {
  const senses = senseIds
    .map(senseId => `<Sense Id="${senseId}"><Definition>d</Definition></Sense>`)
    .join('');
  return `<Entry Id="${id}" Lemma="${lemma}"><Senses>${senses}</Senses></Entry>`;
}

/** An entry with one sense whose body (Occurrences, Domains, ...) is given as XML */
function entryWithSenseBodyXml(id: string, lemma: string, senseBody: string): string {
  return `<Entry Id="${id}" Lemma="${lemma}"><Senses><Sense Id="S-${id}"><Definition>d</Definition>${senseBody}</Sense></Senses></Entry>`;
}

const occurrencesXml = (corpusAttributes: string, occurrences: string): string =>
  `<Occurrences><Corpus ${corpusAttributes}>${occurrences}</Corpus></Occurrences>`;

const occurrence = (text: string, type = 'U23003'): string =>
  `<Occurrence Type="${type}">${text}</Occurrence>`;

function runImport(inputDir: string, outputFile: string) {
  return spawnSync(
    path.join(repoRoot, 'node_modules/.bin/ts-node'),
    [
      '--transpile-only',
      'src/import-lexicon-to-sqlite.ts',
      '--input',
      inputDir,
      '--output',
      outputFile,
    ],
    { cwd: repoRoot, encoding: 'utf-8' }
  );
}

function countRows(dbFile: string, table: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, openError => {
      if (openError) return reject(openError);
      db.get(`SELECT COUNT(*) AS count FROM ${table}`, (getError, row: { count: number }) => {
        db.close();
        if (getError) reject(getError);
        else resolve(row.count);
      });
    });
  });
}

function queryRows<T>(dbFile: string, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, openError => {
      if (openError) return reject(openError);
      db.all(sql, (allError, rows: T[]) => {
        db.close();
        if (allError) reject(allError);
        else resolve(rows);
      });
    });
  });
}

describe('import-lexicon-to-sqlite', () => {
  let tempDir: string;
  let inputDir: string;
  let outputFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-lexicon-test-'));
    inputDir = path.join(tempDir, 'input');
    fs.mkdirSync(inputDir);
    outputFile = path.join(tempDir, 'out.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('imports a valid file, exits 0 and reports success', async () => {
    fs.writeFileSync(
      path.join(inputDir, 'ok.xml'),
      lexiconXml(entryXml('E1', 'one', ['S1']) + entryXml('E2', 'two', ['S2']))
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Import completed successfully!');
    expect(await countRows(outputFile, 'Senses')).toBe(2);
  }, 60000);

  test('exits non-zero, names the sense, and leaves no database when a sense Id is duplicated', () => {
    fs.writeFileSync(
      path.join(inputDir, 'dup.xml'),
      lexiconXml(entryXml('E1', 'one', ['S1', 'S1']))
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('Import completed successfully!');
    expect(result.stderr).toContain('S1');
    expect(result.stderr).toContain('dup.xml');
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 60000);

  test('exits non-zero when an entry Id is duplicated', () => {
    fs.writeFileSync(
      path.join(inputDir, 'dup.xml'),
      lexiconXml(entryXml('E1', 'one', ['S1']) + entryXml('E1', 'uno', ['S2']))
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 60000);

  test('exits non-zero for an .xml file that is not a LexicalReferenceText', () => {
    fs.writeFileSync(path.join(inputDir, 'other.xml'), '<Other/>');

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('other.xml');
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 60000);

  test('exits non-zero for an unsupported schema version', () => {
    fs.writeFileSync(
      path.join(inputDir, 'v2.xml'),
      lexiconXml(entryXml('E1', 'one', ['S1'])).replace(
        'SchemaVersion="1.0"',
        'SchemaVersion="2.0"'
      )
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('v2.xml');
  }, 60000);

  test('exits non-zero when a sense has no Id', () => {
    fs.writeFileSync(
      path.join(inputDir, 'noid.xml'),
      lexiconXml(
        '<Entry Id="E1" Lemma="one"><Senses><Sense><Definition>d</Definition></Sense></Senses></Entry>'
      )
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('E1');
  }, 60000);

  test('does not replace an existing database when the import fails', async () => {
    fs.writeFileSync(path.join(inputDir, 'ok.xml'), lexiconXml(entryXml('E1', 'one', ['S1'])));
    expect(runImport(inputDir, outputFile).status).toBe(0);
    fs.writeFileSync(path.join(inputDir, 'bad.xml'), '<Other/>');

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(await countRows(outputFile, 'Senses')).toBe(1);
  }, 60000);

  test('imports two language files of one dictionary into shared entries', async () => {
    const entries = entryXml('E1', 'one', ['S1']) + entryXml('E2', 'two', ['S2']);
    fs.writeFileSync(path.join(inputDir, 'en.xml'), lexiconXml(entries, '', 'en'));
    fs.writeFileSync(path.join(inputDir, 'fr.xml'), lexiconXml(entries, '', 'fr'));

    const result = runImport(inputDir, outputFile);

    expect(result.status).toBe(0);
    expect(await countRows(outputFile, 'Entries')).toBe(2);
    expect(await countRows(outputFile, 'Senses')).toBe(4);
    expect(await countRows(outputFile, 'Languages')).toBe(2);
  }, 60000);

  test('exits non-zero when a second language gives an entry Id a different lemma', () => {
    fs.writeFileSync(
      path.join(inputDir, 'en.xml'),
      lexiconXml(entryXml('E1', 'one', ['S1']), '', 'en')
    );
    fs.writeFileSync(
      path.join(inputDir, 'fr.xml'),
      lexiconXml(entryXml('E1', 'uno', ['S1']), '', 'fr')
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('E1');
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 60000);

  test('exits non-zero when a second language gives a lemma to a different entry Id', () => {
    fs.writeFileSync(
      path.join(inputDir, 'en.xml'),
      lexiconXml(entryXml('E1', 'one', ['S1']), '', 'en')
    );
    fs.writeFileSync(
      path.join(inputDir, 'fr.xml'),
      lexiconXml(entryXml('E2', 'one', ['S1']), '', 'fr')
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('E2');
  }, 60000);

  test('exits non-zero when a lemma is duplicated within one file', () => {
    fs.writeFileSync(
      path.join(inputDir, 'dup.xml'),
      lexiconXml(entryXml('E1', 'one', ['S1']) + entryXml('E2', 'one', ['S2']))
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Duplicate lemma');
  }, 60000);

  test('keeps the finished temporary database when moving it into place fails', () => {
    fs.writeFileSync(path.join(inputDir, 'ok.xml'), lexiconXml(entryXml('E1', 'one', ['S1'])));
    // A non-empty directory at the output path makes the final rename fail
    fs.mkdirSync(outputFile);
    fs.writeFileSync(path.join(outputFile, 'blocker'), 'x');

    const result = runImport(inputDir, outputFile);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${outputFile}.tmp`);
    expect(fs.existsSync(`${outputFile}.tmp`)).toBe(true);
  }, 60000);

  test('imports a sense occurrence into SenseOccurrences', async () => {
    fs.writeFileSync(
      path.join(inputDir, 'ok.xml'),
      lexiconXml(
        entryWithSenseBodyXml(
          'E1',
          'one',
          occurrencesXml('Id="SBLGNT"', occurrence('ACT 7:22!7') + occurrence('HEB 11:29!14'))
        )
      )
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).toBe(0);
    const rows = await queryRows<{
      Sense: string;
      Corpus: string;
      ChapterNum: number;
      VerseNum: number;
      WordNum: number;
    }>(
      outputFile,
      `SELECT s.Id AS Sense, c.Id AS Corpus, o.ChapterNum, o.VerseNum, o.WordNum
       FROM SenseOccurrences o
       JOIN Senses s ON s.SenseKey = o.SenseKey
       JOIN Corpora c ON c.CorpusKey = o.CorpusKey
       ORDER BY o.ChapterNum`
    );
    expect(rows).toEqual([
      { Sense: 'S-E1', Corpus: 'SBLGNT', ChapterNum: 7, VerseNum: 22, WordNum: 7 },
      { Sense: 'S-E1', Corpus: 'SBLGNT', ChapterNum: 11, VerseNum: 29, WordNum: 14 },
    ]);
  }, 60000);

  test('imports sense domains and the taxonomy tree they refer to', async () => {
    const taxonomy = `<Taxonomy Id="SDBG-Lexical" Title="Lexical Semantic Domains for Greek">
      <SubDomains>
        <SubDomain Code="001" Name="Parent"><SubDomains><SubDomain Code="001001" Name="Child"/></SubDomains></SubDomain>
      </SubDomains>
    </Taxonomy>`;
    fs.writeFileSync(
      path.join(inputDir, 'ok.xml'),
      lexiconXml(
        entryWithSenseBodyXml(
          'E1',
          'one',
          '<Domains><Domain Taxonomy="SDBG-Lexical" Code="001001">Child</Domain></Domains>'
        ),
        '',
        'en',
        taxonomy
      )
    );

    const result = runImport(inputDir, outputFile);

    expect(result.status).toBe(0);
    expect(
      await queryRows(
        outputFile,
        `SELECT t.Id AS Taxonomy, d.DomainCode AS Code FROM SenseDomains d
         JOIN Taxonomies t ON t.TaxonomyKey = d.TaxonomyKey`
      )
    ).toEqual([{ Taxonomy: 'SDBG-Lexical', Code: '001001' }]);
    expect(
      await queryRows(
        outputFile,
        `SELECT child.DomainCode AS Code, parent.DomainCode AS ParentCode
         FROM TaxonomyDomains child
         LEFT JOIN TaxonomyDomains parent
           ON parent.TaxonomyDomainKey = child.ParentTaxonomyDomainKey
         ORDER BY child.DomainCode`
      )
    ).toEqual([
      { Code: '001', ParentCode: null },
      { Code: '001001', ParentCode: '001' },
    ]);
  }, 60000);

  describe('rejects invalid occurrence, domain and taxonomy data', () => {
    const taxonomyWith = (inner: string, attributes = 'Id="T" Title="Title"') =>
      `<Taxonomy ${attributes}>${inner}</Taxonomy>`;

    test.each([
      [
        'an empty occurrence',
        occurrencesXml('Id="C"', '<Occurrence Type="U23003"></Occurrence>'),
        'S-E1',
        'has no text content',
      ],
      [
        'a malformed occurrence',
        occurrencesXml('Id="C"', occurrence('not a reference')),
        'S-E1',
        'not a reference',
      ],
      [
        'an occurrence of another type',
        occurrencesXml('Id="C"', occurrence('ACT 7:22!7', 'Other')),
        'S-E1',
        'type "Other" instead of U23003',
      ],
      [
        'a corpus without an Id',
        occurrencesXml('', occurrence('ACT 7:22!7')),
        'S-E1',
        'Corpus without an Id',
      ],
      [
        'a domain without a Taxonomy',
        '<Domains><Domain Code="001">x</Domain></Domains>',
        'S-E1',
        'missing required attributes (Taxonomy or Code)',
      ],
      [
        'a domain without a Code',
        '<Domains><Domain Taxonomy="T">x</Domain></Domains>',
        'S-E1',
        'missing required attributes (Taxonomy or Code)',
      ],
    ])(
      'exits non-zero and names the item for %s',
      (_description, senseBody, itemId, messagePart) => {
        fs.writeFileSync(
          path.join(inputDir, 'bad.xml'),
          lexiconXml(entryWithSenseBodyXml('E1', 'one', senseBody))
        );

        const result = runImport(inputDir, outputFile);

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(itemId);
        expect(result.stderr).toContain(messagePart);
        expect(fs.existsSync(outputFile)).toBe(false);
      },
      60000
    );

    test.each([
      [
        'a taxonomy without an Id',
        taxonomyWith('', 'Title="Title"'),
        'Taxonomy is missing required attributes (Id or Title)',
      ],
      [
        'a taxonomy without a Title',
        taxonomyWith('', 'Id="T"'),
        'Taxonomy is missing required attributes (Id or Title)',
      ],
      [
        'a subdomain without a Code',
        taxonomyWith('<SubDomains><SubDomain Name="No code"/></SubDomains>'),
        'Taxonomy T has a domain without a Code',
      ],
      [
        'a nested subdomain without a Code',
        taxonomyWith(
          '<SubDomains><SubDomain Code="001"><SubDomains><SubDomain Name="x"/></SubDomains></SubDomain></SubDomains>'
        ),
        'Taxonomy T has a domain without a Code',
      ],
    ])(
      'exits non-zero and names the problem for %s',
      (_description, taxonomy, messagePart) => {
        fs.writeFileSync(
          path.join(inputDir, 'bad.xml'),
          lexiconXml(entryXml('E1', 'one', ['S1']), '', 'en', taxonomy)
        );

        const result = runImport(inputDir, outputFile);

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(messagePart);
        expect(fs.existsSync(outputFile)).toBe(false);
      },
      60000
    );

    test('reports every failing entry of a batch, not only the first', () => {
      fs.writeFileSync(
        path.join(inputDir, 'bad.xml'),
        lexiconXml(
          entryWithSenseBodyXml('E1', 'one', occurrencesXml('Id="C"', occurrence('BADFIRST'))) +
            entryWithSenseBodyXml('E2', 'two', occurrencesXml('Id="C"', occurrence('BADSECOND')))
        )
      );

      const result = runImport(inputDir, outputFile);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('BADFIRST');
      expect(result.stderr).toContain('BADSECOND');
      expect(fs.existsSync(outputFile)).toBe(false);
    }, 60000);
  });
});

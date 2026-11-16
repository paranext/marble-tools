import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';

const repoRoot = path.resolve(__dirname, '../..');

function lexiconXml(entries: string, attributes = ''): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<LexicalReferenceText Id="TEST" DataVersion="1" SchemaVersion="1.0" Language="en" ${attributes}>
  <Entries>${entries}</Entries>
</LexicalReferenceText>`;
}

function entryXml(id: string, lemma: string, senseIds: string[]): string {
  const senses = senseIds
    .map(senseId => `<Sense Id="${senseId}"><Definition>d</Definition></Sense>`)
    .join('');
  return `<Entry Id="${id}" Lemma="${lemma}"><Senses>${senses}</Senses></Entry>`;
}

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
});

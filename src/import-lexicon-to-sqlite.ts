/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { Command } from 'commander';

// Parse command line arguments
const program = new Command();
program
  .name('import-lexicon-to-sqlite')
  .description('Import lexicon XML files into SQLite database')
  .requiredOption('-i, --input <directories...>', 'Input directories containing XML files')
  .option('-o, --output <file>', 'Output SQLite database file', 'lexicon.db')
  .option('-s, --schema <file>', 'SQL schema file', path.join(__dirname, '../sql/schema.sql'))
  .option('-v, --verbose', 'Enable verbose error logging')
  .parse(process.argv);

const options = program.opts();
const verbose = options.verbose || false;

// Helper function to log detailed error information
function logError(error: any, context: string, details: Record<string, any> = {}): void {
  console.error(`Error in ${context}:`);

  if (error && error.code === 'SQLITE_CONSTRAINT') {
    console.error('  Foreign key constraint failed:');

    // Log the details about the operation that failed
    Object.entries(details).forEach(([key, value]) => {
      console.error(`  ${key}: ${value}`);
    });

    // If we have the SQL statement, log it
    if (error.sql) {
      console.error('  SQL:', error.sql);
    }

    if (error.message) {
      console.error('  Message:', error.message);
    }
  } else {
    console.error('  ', error);
  }
}

// Helper function to parse U23003 format values
// Format example: "MAT 2:1!3" (third word of Matthew chapter 2 verse 1)
function parseU23003(occurrenceValue: string): {
  bookId: string;
  chapter: number;
  verse: number;
  wordIndex: number;
} | null {
  // Basic U23003 format: BOOK CHAPTER:VERSE!WORD
  // Example: "MAT 2:1!3" or "GEN 1:1!2"

  // Regex to match the format
  const regex = /^([A-Z0-9]{3})\s+(\d+):(\d+)!(\d+)$/i;
  const match = occurrenceValue.match(regex);

  if (!match) {
    console.warn(`Could not parse U23003 value: ${occurrenceValue}`);
    return null;
  }

  const [, bookId, chapterStr, verseStr, wordIndexStr] = match;

  return {
    bookId: bookId.toUpperCase(),
    chapter: parseInt(chapterStr, 10),
    verse: parseInt(verseStr, 10),
    wordIndex: parseInt(wordIndexStr, 10),
  };
}

async function initializeDatabase(dbPath: string, schemaPath: string): Promise<Database> {
  // Delete existing db file if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  console.log('Opening database with Unicode support...');

  // Open database with explicit configuration for international text support
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
    // Ensure proper handling of UTF-8 text in all database operations
    mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  });

  // Set pragmas for optimal Unicode handling
  await db.exec('PRAGMA encoding = "UTF-8";');

  // Enable foreign keys with enhanced error handling
  await db.exec('PRAGMA foreign_keys = ON;');

  // Enable extended error codes for more detailed error information
  await db.exec('PRAGMA foreign_keys_list;');

  // Read and execute schema
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await db.exec(schema);

  return db;
}

// Wrapper for database run operations to provide better error handling
async function safeRun(
  db: Database,
  sql: string,
  params: any[],
  context: string,
  details: Record<string, any> = {}
): Promise<any> {
  try {
    return await db.run(sql, ...params);
  } catch (error: any) {
    error.sql = sql;
    logError(error, context, {
      ...details,
      params: JSON.stringify(params),
    });
    throw error;
  }
}

// Wrapper for database get operations to provide better error handling
async function safeGet(
  db: Database,
  sql: string,
  params: any[],
  context: string,
  details: Record<string, any> = {}
): Promise<any> {
  try {
    return await db.get(sql, ...params);
  } catch (error: any) {
    error.sql = sql;
    logError(error, context, {
      ...details,
      params: JSON.stringify(params),
    });
    throw error;
  }
}

// Enhanced function to get Key of inserted or existing record
async function getKeyAfterInsert(
  db: Database,
  tableName: string,
  uniqueColumn: string,
  uniqueValue: string,
  result: sqlite3.RunResult,
  context: string
): Promise<number> {
  // If the insert was successful, return the last inserted ID
  if (result.changes) {
    return result.lastID;
  }

  // If insert was ignored due to UNIQUE constraint, get the existing Key
  const query = `SELECT Key FROM ${tableName} WHERE ${uniqueColumn} = ?`;
  const record = await safeGet(db, query, [uniqueValue], `Get existing ${tableName} key`, {
    uniqueColumn,
    uniqueValue,
  });

  if (!record || record.Key === undefined) {
    throw new Error(
      `Failed to get Key for ${tableName} with ${uniqueColumn} = ${uniqueValue} when ${context}`
    );
  }

  return record.Key;
}

async function processLexicalReference(filePath: string, db: Database): Promise<void> {
  console.log(`Processing ${filePath}...`);

  // Use utf-8 encoding explicitly when reading XML files
  const xml = fs.readFileSync(filePath, 'utf-8');

  // Configure XML parser to properly handle various scripts and encodings
  const parserOptions = {
    locator: {},
    errorHandler: {
      warning: (msg: string) => console.warn(`XML Warning: ${msg}`),
      error: (msg: string) => console.error(`XML Error: ${msg}`),
      fatalError: (msg: string) => {
        throw new Error(`Fatal XML Error: ${msg}`);
      },
    },
  };

  const doc = new DOMParser(parserOptions).parseFromString(xml, 'text/xml');

  const lexRef = doc.documentElement;
  if (!lexRef || lexRef.nodeName !== 'LexicalReferenceText') {
    console.warn(`Skipping ${filePath}: not a valid LexicalReferenceText file`);
    return;
  }

  const refTextName = lexRef.getAttribute('Id');
  const version = lexRef.getAttribute('Version');
  const language = lexRef.getAttribute('Language');

  if (!refTextName || !version || !language) {
    console.warn(`Skipping ${filePath}: missing required attributes`);
    return;
  }

  // Start a transaction
  await db.exec('BEGIN TRANSACTION');

  try {
    // Insert lexical reference text
    const lexRefResult = await safeRun(
      db,
      'INSERT OR IGNORE INTO LexicalReferenceTexts (Id, Version, LanguageBCP47) VALUES (?, ?, ?)',
      [refTextName, version, language],
      'Insert LexicalReferenceText',
      { refTextName, version, language, file: path.basename(filePath) }
    );

    // Get the internal Key of the lexical reference text
    const lexRefKey = await getKeyAfterInsert(
      db,
      'LexicalReferenceTexts',
      'Id',
      refTextName,
      lexRefResult,
      'Get LexicalReferenceText key'
    );

    // Process entries
    const entriesElement = lexRef.getElementsByTagName('Entries')[0];
    if (entriesElement) {
      const entryElements = entriesElement.getElementsByTagName('Entry');
      for (let i = 0; i < entryElements.length; i++) {
        await processEntry(entryElements[i], lexRefKey, db, filePath);
      }
    }

    // Commit the transaction
    await db.exec('COMMIT');
    console.log(`Successfully processed ${filePath}`);
  } catch (error: unknown) {
    // Rollback the transaction on error
    await db.exec('ROLLBACK');
    console.error(`Error processing ${filePath}:`, error instanceof Error ? error.message : error);

    if (verbose) {
      // Log additional info about the database state
      try {
        console.log('Current database tables and row counts:');
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        for (const table of tables) {
          const count = await db.get(`SELECT COUNT(*) as count FROM ${table.name}`);
          console.log(`  ${table.name}: ${count.count} rows`);
        }
      } catch (err) {
        console.error('Error getting database state:', err);
      }
    }
  }
}

async function processEntry(
  entryElement: Element,
  refTextKey: number,
  db: Database,
  filePath: string
): Promise<void> {
  const entrySourceId = entryElement.getAttribute('Id');
  const lemma = entryElement.getAttribute('Lemma');

  if (!entrySourceId || !lemma) {
    console.warn('Skipping entry: missing required attributes');
    return;
  }

  try {
    // Insert entry
    const entryResult = await safeRun(
      db,
      'INSERT OR IGNORE INTO Entries (Id, Lemma, LexicalReferenceTextKey) VALUES (?, ?, ?)',
      [entrySourceId, lemma, refTextKey],
      'Insert entry',
      { entrySourceId, lemma, refTextKey, file: path.basename(filePath) }
    );

    // Get the internal Key of the entry
    const entryKey = await getKeyAfterInsert(
      db,
      'Entries',
      'Id',
      entrySourceId,
      entryResult,
      'Get entry key'
    );

    // Process StrongsCodes if present
    const strongsCodesElement = entryElement.getElementsByTagName('StrongsCodes')[0];
    if (strongsCodesElement) {
      const strongsCodeElements = strongsCodesElement.getElementsByTagName('StrongsCode');
      for (let i = 0; i < strongsCodeElements.length; i++) {
        const code = strongsCodeElements[i].textContent;
        if (code) {
          await safeRun(
            db,
            'INSERT OR IGNORE INTO StrongsCodes (EntryKey, Code) VALUES (?, ?)',
            [entryKey, code],
            'Insert strong code',
            { entryKey, code, entrySourceId }
          );
        }
      }
    }

    // Process entry-level Occurrences if present
    const entryOccurrencesElement = entryElement.getElementsByTagName('Occurrences')[0];
    if (entryOccurrencesElement) {
      await processEntryOccurrences(entryOccurrencesElement, entryKey, db, entrySourceId);
    }

    // Process entry-level Domains if present
    const entryDomainsElement = entryElement.getElementsByTagName('Domains')[0];
    if (entryDomainsElement) {
      await processEntryDomains(entryDomainsElement, entryKey, db, entrySourceId);
    }

    // Process Senses if present
    const sensesElement = entryElement.getElementsByTagName('Senses')[0];
    if (sensesElement) {
      const senseElements = sensesElement.getElementsByTagName('Sense');
      for (let i = 0; i < senseElements.length; i++) {
        await processSense(senseElements[i], entryKey, db, entrySourceId);
      }
    }
  } catch (error: unknown) {
    console.error(
      `Error processing entry ${entrySourceId} (lemma: ${lemma}):`,
      error instanceof Error ? error.message : error
    );
    throw error; // Re-throw to handle at the transaction level
  }
}

async function processSense(
  senseElement: Element,
  entryKey: number,
  db: Database,
  parentSourceId: string
): Promise<void> {
  const senseSourceId = senseElement.getAttribute('Id');

  if (!senseSourceId) {
    console.warn('Skipping sense: missing required id attribute');
    return;
  }

  try {
    // Get definition if present
    let definition = null;
    const definitionElement = senseElement.getElementsByTagName('Definition')[0];
    if (definitionElement && definitionElement.textContent) {
      definition = definitionElement.textContent;
    }

    // Insert sense
    const senseResult = await safeRun(
      db,
      'INSERT OR IGNORE INTO Senses (Id, EntryKey, Definition) VALUES (?, ?, ?)',
      [senseSourceId, entryKey, definition],
      'Insert sense',
      { senseSourceId, entryKey, parentSourceId }
    );

    // Get the internal Key of the sense
    const senseKey = await getKeyAfterInsert(
      db,
      'Senses',
      'Id',
      senseSourceId,
      senseResult,
      'Get sense key'
    );

    // Process Glosses if present
    const glossesElement = senseElement.getElementsByTagName('Glosses')[0];
    if (glossesElement) {
      const glossElements = glossesElement.getElementsByTagName('Gloss');
      for (let i = 0; i < glossElements.length; i++) {
        const gloss = glossElements[i].textContent;
        if (gloss) {
          await safeRun(
            db,
            'INSERT INTO Glosses (SenseKey, Gloss) VALUES (?, ?)',
            [senseKey, gloss],
            'Insert gloss',
            { senseKey, senseSourceId, gloss }
          );
        }
      }
    }

    // Process sense-level Occurrences if present
    const senseOccurrencesElement = senseElement.getElementsByTagName('Occurrences')[0];
    if (senseOccurrencesElement) {
      await processSenseOccurrences(senseOccurrencesElement, senseKey, db, senseSourceId);
    }

    // Process sense-level Domains if present
    const senseDomainsElement = senseElement.getElementsByTagName('Domains')[0];
    if (senseDomainsElement) {
      await processSenseDomains(senseDomainsElement, senseKey, db, senseSourceId);
    }
  } catch (error: unknown) {
    console.error(
      `Error processing sense ${senseSourceId} (for entry: ${parentSourceId}):`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function processEntryOccurrences(
  occurrencesElement: Element,
  entryKey: number,
  db: Database,
  parentSourceId: string
): Promise<void> {
  const corpusElements = occurrencesElement.getElementsByTagName('Corpus');

  for (let i = 0; i < corpusElements.length; i++) {
    const corpusElement = corpusElements[i];
    const corpusName = corpusElement.getAttribute('Id');

    if (!corpusName) {
      console.warn('Skipping corpus: missing required id attribute');
      continue;
    }

    try {
      // Make sure corpus exists in the database
      const corpusResult = await safeRun(
        db,
        'INSERT OR IGNORE INTO Corpora (Id) VALUES (?)',
        [corpusName],
        'Insert corpus',
        { corpusName }
      );

      // Get the internal Key of the corpus - using our enhanced function
      const corpusKey = await getKeyAfterInsert(
        db,
        'Corpora',
        'Id',
        corpusName,
        corpusResult,
        'Get corpus key'
      );

      // Process occurrences
      const occurrenceElements = corpusElement.getElementsByTagName('Occurrence');
      for (let j = 0; j < occurrenceElements.length; j++) {
        const occurrenceElement = occurrenceElements[j];
        const occurrenceValue = occurrenceElement.getAttribute('Id');

        if (!occurrenceValue) {
          console.warn('Skipping occurrence: missing required id attribute');
          continue;
        }

        // Parse the U23003 formatted occurrence value
        const parsedOccurrence = parseU23003(occurrenceValue);

        if (parsedOccurrence) {
          // If we successfully parsed the U23003 format, store the parsed components
          const { bookId, chapter, verse, wordIndex } = parsedOccurrence;

          await safeRun(
            db,
            'INSERT INTO EntryOccurrences (EntryKey, CorpusKey, BookId, Chapter, Verse, WordIndex) VALUES (?, ?, ?, ?, ?, ?)',
            [entryKey, corpusKey, bookId, chapter, verse, wordIndex],
            'Insert entry occurrence',
            {
              entryKey,
              corpusKey,
              parentSourceId,
              occurrenceValue,
              parsedValues: { bookId, chapter, verse, wordIndex },
            }
          );
        } else {
          // Log a warning about unparseable occurrence
          console.warn(
            `Could not parse occurrence value '${occurrenceValue}' for entry ${parentSourceId}`
          );
        }
      }
    } catch (error: unknown) {
      console.error(
        `Error processing corpus ${corpusName} for entry ${parentSourceId}:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }
}

async function processSenseOccurrences(
  occurrencesElement: Element,
  senseKey: number,
  db: Database,
  parentSourceId: string
): Promise<void> {
  const corpusElements = occurrencesElement.getElementsByTagName('Corpus');

  for (let i = 0; i < corpusElements.length; i++) {
    const corpusElement = corpusElements[i];
    const corpusName = corpusElement.getAttribute('Id');

    if (!corpusName) {
      console.warn('Skipping corpus: missing required id attribute');
      continue;
    }

    try {
      // Make sure corpus exists in the database
      const corpusResult = await safeRun(
        db,
        'INSERT OR IGNORE INTO Corpora (Id) VALUES (?)',
        [corpusName],
        'Insert corpus',
        { corpusName }
      );

      // Get the internal Key of the corpus - using our enhanced function
      const corpusKey = await getKeyAfterInsert(
        db,
        'Corpora',
        'Id',
        corpusName,
        corpusResult,
        'Get corpus key'
      );

      // Process occurrences
      const occurrenceElements = corpusElement.getElementsByTagName('Occurrence');
      for (let j = 0; j < occurrenceElements.length; j++) {
        const occurrenceElement = occurrenceElements[j];
        const occurrenceValue = occurrenceElement.getAttribute('Id');

        if (!occurrenceValue) {
          console.warn('Skipping occurrence: missing required id attribute');
          continue;
        }

        // Parse the U23003 formatted occurrence value
        const parsedOccurrence = parseU23003(occurrenceValue);

        if (parsedOccurrence) {
          // If we successfully parsed the U23003 format, store the parsed components
          const { bookId, chapter, verse, wordIndex } = parsedOccurrence;

          await safeRun(
            db,
            'INSERT INTO SenseOccurrences (SenseKey, CorpusKey, BookId, Chapter, Verse, WordIndex) VALUES (?, ?, ?, ?, ?, ?)',
            [senseKey, corpusKey, bookId, chapter, verse, wordIndex],
            'Insert sense occurrence',
            {
              senseKey,
              corpusKey,
              parentSourceId,
              occurrenceValue,
              parsedValues: { bookId, chapter, verse, wordIndex },
            }
          );
        } else {
          // Log a warning about unparseable occurrence
          console.warn(
            `Could not parse occurrence value '${occurrenceValue}' for sense ${parentSourceId}`
          );
        }
      }
    } catch (error: unknown) {
      console.error(
        `Error processing corpus ${corpusName} for sense ${parentSourceId}:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }
}

async function processEntryDomains(
  domainsElement: Element,
  entryKey: number,
  db: Database,
  parentSourceId: string
): Promise<void> {
  const domainElements = domainsElement.getElementsByTagName('Domain');

  for (let i = 0; i < domainElements.length; i++) {
    const domainElement = domainElements[i];
    const taxonomyName = domainElement.getAttribute('Taxonomy');
    const code = domainElement.getAttribute('Code');
    const description = domainElement.textContent;

    if (!taxonomyName || !code) {
      console.warn('Skipping domain: missing required attributes');
      continue;
    }

    try {
      // Make sure taxonomy exists in the database
      const taxonomyResult = await safeRun(
        db,
        'INSERT OR IGNORE INTO Taxonomies (Id) VALUES (?)',
        [taxonomyName],
        'Insert taxonomy',
        { taxonomyName }
      );

      // Get the internal Key of the taxonomy - using our enhanced function
      const taxonomyKey = await getKeyAfterInsert(
        db,
        'Taxonomies',
        'Id',
        taxonomyName,
        taxonomyResult,
        'Get taxonomy key'
      );

      await safeRun(
        db,
        'INSERT INTO EntryDomains (EntryKey, TaxonomyKey, Code, Description) VALUES (?, ?, ?, ?)',
        [entryKey, taxonomyKey, code, description],
        'Insert entry domain',
        {
          entryKey,
          taxonomyKey,
          parentSourceId,
          code,
          description,
        }
      );
    } catch (error: unknown) {
      console.error(
        `Error processing domain ${taxonomyName}:${code} for entry ${parentSourceId}:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }
}

async function processSenseDomains(
  domainsElement: Element,
  senseKey: number,
  db: Database,
  parentSourceId: string
): Promise<void> {
  const domainElements = domainsElement.getElementsByTagName('Domain');

  for (let i = 0; i < domainElements.length; i++) {
    const domainElement = domainElements[i];
    const taxonomyName = domainElement.getAttribute('Taxonomy');
    const code = domainElement.getAttribute('Code');
    const description = domainElement.textContent;

    if (!taxonomyName || !code) {
      console.warn('Skipping domain: missing required attributes');
      continue;
    }

    try {
      // Make sure taxonomy exists in the database
      const taxonomyResult = await safeRun(
        db,
        'INSERT OR IGNORE INTO Taxonomies (Id) VALUES (?)',
        [taxonomyName],
        'Insert taxonomy',
        { taxonomyName }
      );

      // Get the internal Key of the taxonomy - using our enhanced function
      const taxonomyKey = await getKeyAfterInsert(
        db,
        'Taxonomies',
        'Id',
        taxonomyName,
        taxonomyResult,
        'Get taxonomy key'
      );

      await safeRun(
        db,
        'INSERT INTO SenseDomains (SenseKey, TaxonomyKey, Code, Description) VALUES (?, ?, ?, ?)',
        [senseKey, taxonomyKey, code, description],
        'Insert sense domain',
        {
          senseKey,
          taxonomyKey,
          parentSourceId,
          code,
          description,
        }
      );
    } catch (error: unknown) {
      console.error(
        `Error processing domain ${taxonomyName}:${code} for sense ${parentSourceId}:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }
}

async function processDirectory(dirPath: string, db: Database): Promise<void> {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively process subdirectories
      await processDirectory(filePath, db);
    } else if (file.endsWith('.xml')) {
      // Process XML files
      await processLexicalReference(filePath, db);
    }
  }
}

async function main() {
  try {
    console.log(`Initializing database at ${options.output}...`);
    const db = await initializeDatabase(options.output, options.schema);

    for (const inputDir of options.input) {
      console.log(`Processing directory: ${inputDir}`);
      await processDirectory(inputDir, db);
    }

    await db.close();
    console.log('Import completed successfully!');
  } catch (error: unknown) {
    console.error('Error during import:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

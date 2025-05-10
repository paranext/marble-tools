import fs from 'fs';
import path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { Command } from 'commander';
import { parseU23003Reference } from './helpers';

// Cache objects to reduce database lookups
interface ForeignKeyCache {
  taxonomies: Map<string, number>;
  corpora: Map<string, number>;
}

const cache: ForeignKeyCache = {
  taxonomies: new Map(),
  corpora: new Map(),
};

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
function logError(error: unknown, context: string, details: Record<string, unknown> = {}): void {
  console.error(`Error in ${context}:`);

  if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT') {
    console.error('  Foreign key constraint failed:');

    // Log the details about the operation that failed
    Object.entries(details).forEach(([key, value]) => {
      console.error(`  ${key}: ${value}`);
    });

    // If we have the SQL statement, log it
    if ('sql' in error && error.sql) {
      console.error('  SQL:', error.sql);
    }

    if ('message' in error && error.message) {
      console.error('  Message:', error.message);
    }
  } else {
    console.error('  ', error);
  }
}

async function initializeDatabase(dbPath: string, schemaPath: string): Promise<Database> {
  // Delete existing db file if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  console.log('Creating database...');

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  });

  // Set pragmas for optimal bulk import performance
  await db.exec('PRAGMA synchronous = OFF;');
  await db.exec('PRAGMA journal_mode = MEMORY;');
  await db.exec('PRAGMA page_size = 4096;');
  await db.exec('PRAGMA cache_size = -2000000;'); // Use 2GB memory for cache
  await db.exec('PRAGMA temp_store = MEMORY;');
  await db.exec('PRAGMA mmap_size = 2147483648;'); // 2GB memory map
  await db.exec('PRAGMA encoding = "UTF-8";');

  // Enable foreign keys with enhanced error handling
  await db.exec('PRAGMA foreign_keys = ON;');

  // Read and execute schema
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await db.exec(schema);

  return db;
}

// Wrapper for database run operations to provide better error handling
async function safeRun(
  db: Database,
  sql: string,
  params: unknown[],
  context: string,
  details: Record<string, unknown> = {}
): Promise<sqlite3.RunResult> {
  try {
    // sqlite3's types are not very strict, so we need to cast the result
    return (await db.run(sql, ...params)) as unknown as sqlite3.RunResult;
  } catch (error: unknown) {
    if (error && typeof error === 'object') {
      // Attach SQL statement to the error object for better debugging
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).sql = sql;
    }
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
  params: unknown[],
  context: string,
  details: Record<string, unknown> = {}
  // Match the return type of db.get
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  try {
    return await db.get(sql, ...params);
  } catch (error: unknown) {
    if (error && typeof error === 'object') {
      // Attach SQL statement to the error object for better debugging
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).sql = sql;
    }
    logError(error, context, {
      ...details,
      params: JSON.stringify(params),
    });
    throw error;
  }
}

async function insert(
  db: Database,
  tableName: string,
  columnsAndValues: Record<string, unknown>
): Promise<sqlite3.RunResult> {
  try {
    // Extract columns and ensure values are in matching order
    const columns = Object.keys(columnsAndValues);
    const values = columns.map(col => columnsAndValues[col]);

    // Build the INSERT statement
    const columnList = columns.join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT OR IGNORE INTO ${tableName} (${columnList}) VALUES (${placeholders})`;

    // Perform the insert
    return safeRun(db, sql, values, `Insert ${tableName}`, {
      tableName,
      columnsAndValues,
    });
  } catch (error: unknown) {
    console.error(
      `Error in insert for ${tableName}:`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

// Bulk insert helper function
async function bulkInsert(
  db: Database,
  tableName: string,
  columns: string[],
  values: unknown[][],
  batchSize = 500
): Promise<void> {
  if (values.length === 0) return;

  const placeholders = `(${columns.map(() => '?').join(',')})`;
  const batches = Math.ceil(values.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const batch = values.slice(i * batchSize, (i + 1) * batchSize);
    const batchPlaceholders = Array(batch.length).fill(placeholders).join(',');
    const sql = `INSERT OR IGNORE INTO ${tableName} (${columns.join(',')}) VALUES ${batchPlaceholders}`;
    await safeRun(db, sql, batch.flat(), `bulk insert into ${tableName}`, {});
  }
}

async function getKey(
  db: Database,
  tableName: string,
  keyColumn: string,
  columnsAndValues: Record<string, unknown>,
  context: string
): Promise<number> {
  try {
    // Extract columns and ensure values are in matching order
    const columns = Object.keys(columnsAndValues);
    const values = columns.map(col => columnsAndValues[col]);

    // Build the SELECT statement with needed WHERE conditions
    const whereClause = columns.map(column => `${column} = ?`).join(' AND ');
    const query = `SELECT ${keyColumn} FROM ${tableName} WHERE ${whereClause}`;

    const record = await safeGet(db, query, values, `Get ${tableName} key`, columnsAndValues);
    if (!record || record[keyColumn] === undefined) {
      throw new Error(
        `Failed to get ${keyColumn} for ${tableName} with conditions ${JSON.stringify(columnsAndValues)} when ${context}`
      );
    }
    return record[keyColumn];
  } catch (error: unknown) {
    console.error(
      `Error in getKey for ${tableName}:`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

// Insert a record, if it is unique, and return its key (or the existing key if it already exists)
async function insertAndGetKey(
  db: Database,
  tableName: string,
  keyColumn: string,
  columnsAndValues: Record<string, unknown>,
  context: string
): Promise<number> {
  const result = await insert(db, tableName, columnsAndValues);
  return result.changes
    ? result.lastID
    : getKey(db, tableName, keyColumn, columnsAndValues, context);
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
  // const title = lexRef.getAttribute('Title');
  const dataVersion = lexRef.getAttribute('DataVersion'); // Updated from Version to DataVersion
  const schemaVersion = lexRef.getAttribute('SchemaVersion'); // New attribute
  if (schemaVersion !== '1.0') {
    console.warn(`Skipping ${filePath}: unsupported schema version ${schemaVersion}`);
    return;
  }
  const language = lexRef.getAttribute('Language');

  if (!refTextName || !dataVersion || !language) {
    console.warn(`Skipping ${filePath}: missing required attributes`);
    return;
  }

  // Start a transaction
  await db.exec('BEGIN TRANSACTION');

  try {
    const languageKey = await insertAndGetKey(
      db,
      'Languages',
      'LanguageKey',
      { BCP47Code: language },
      'Get language key'
    );

    const lexRefKey = await insertAndGetKey(
      db,
      'LexicalReferenceTexts',
      'LexicalReferenceTextKey',
      { Id: refTextName, Version: dataVersion },
      'Get LexicalReferenceText key'
    );

    // Process taxonomies before entries
    const taxonomiesElement = lexRef.getElementsByTagName('Taxonomies')[0];
    if (taxonomiesElement) {
      const taxonomyElements = taxonomiesElement.getElementsByTagName('Taxonomy');
      for (let i = 0; i < taxonomyElements.length; i++) {
        await processTaxonomy(taxonomyElements[i], db, languageKey);
      }
    }

    // Process entries in batches
    const entriesElement = lexRef.getElementsByTagName('Entries')[0];
    if (entriesElement) {
      const entryElements = entriesElement.getElementsByTagName('Entry');
      const batchSize = 100;

      for (let i = 0; i < entryElements.length; i += batchSize) {
        const batch = Array.from(entryElements).slice(i, i + batchSize);
        await Promise.all(
          batch.map(entry => processEntry(entry, lexRefKey, languageKey, db, filePath))
        );

        // Update progress on same line
        const progress = (((i + batch.length) / entryElements.length) * 100).toFixed(1);
        process.stdout.write(`\rProcessing entries... ${progress}%`);
      }
      // Add a newline after the progress is complete
      process.stdout.write('\n');
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

async function processTaxonomy(
  taxonomyElement: Element,
  db: Database,
  languageKey: number
): Promise<void> {
  const taxonomyId = taxonomyElement.getAttribute('Id');
  const taxonomyTitle = taxonomyElement.getAttribute('Title');

  if (!taxonomyId || !taxonomyTitle) {
    console.warn('Skipping taxonomy: missing required attributes (Id or Title)');
    return;
  }

  try {
    // Insert the taxonomy into the Taxonomies table
    const taxonomyKey = await insertAndGetKey(
      db,
      'Taxonomies',
      'TaxonomyKey',
      { Id: taxonomyId },
      'Get taxonomy key for processing taxonomy'
    );

    // Process SubDomains recursively
    const subDomainsElement = taxonomyElement.getElementsByTagName('SubDomains')[0];
    if (subDomainsElement) {
      const subDomainElements = subDomainsElement.getElementsByTagName('SubDomain');
      for (let i = 0; i < subDomainElements.length; i++) {
        await processSubDomain(subDomainElements[i], taxonomyKey, null, db, languageKey);
      }
    }
  } catch (error: unknown) {
    console.error(
      `Error processing taxonomy ${taxonomyId} (${taxonomyTitle}):`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function processSubDomain(
  subDomainElement: Element,
  taxonomyKey: number,
  parentDomainKey: number | null,
  db: Database,
  languageKey: number
): Promise<void> {
  const domainCode = subDomainElement.getAttribute('Code');
  const domainName = subDomainElement.getAttribute('Name');

  if (!domainCode) {
    console.warn('Skipping subdomain: missing required Code attribute');
    return;
  }

  try {
    // Insert the domain into TaxonomyDomains
    const domainKey = await insertAndGetKey(
      db,
      'TaxonomyDomains',
      'TaxonomyDomainKey',
      {
        TaxonomyKey: taxonomyKey,
        ParentTaxonomyDomainKey: parentDomainKey,
        DomainCode: domainCode,
      },
      'Get taxonomy domain key'
    );

    // If name is present, insert it into TaxonomyDomainLabels
    if (domainName) {
      await insert(db, 'TaxonomyDomainLabels', {
        TaxonomyDomainKey: domainKey,
        LanguageKey: languageKey,
        Label: domainName,
      });
    }

    // Process child SubDomains recursively if present
    const childSubDomainsElement = subDomainElement.getElementsByTagName('SubDomains')[0];
    if (childSubDomainsElement) {
      const childSubDomainElements = childSubDomainsElement.getElementsByTagName('SubDomain');
      for (let i = 0; i < childSubDomainElements.length; i++) {
        await processSubDomain(childSubDomainElements[i], taxonomyKey, domainKey, db, languageKey);
      }
    }
  } catch (error: unknown) {
    console.error(
      `Error processing subdomain ${domainCode}:`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function processEntry(
  entryElement: Element,
  refTextKey: number,
  languageKey: number,
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
    const entryKey = await insertAndGetKey(
      db,
      'Entries',
      'EntryKey',
      { Id: entrySourceId, Lemma: lemma, LexicalReferenceTextKey: refTextKey },
      'Get entry key'
    );

    // Process StrongsCodes if present
    const strongsCodesElement = entryElement.getElementsByTagName('StrongsCodes')[0];
    if (strongsCodesElement) {
      const strongsCodeElements = strongsCodesElement.getElementsByTagName('StrongsCode');
      for (let i = 0; i < strongsCodeElements.length; i++) {
        const code = strongsCodeElements[i].textContent;
        if (code) {
          await insert(db, 'EntryStrongsCodes', { EntryKey: entryKey, StrongsCode: code });
        }
      }
    }

    // Process entry-level Occurrences if present
    const entryOccurrencesElement = entryElement.getElementsByTagName('Occurrences')[0];
    if (entryOccurrencesElement) {
      await processOccurrences(
        entryOccurrencesElement,
        'EntryOccurrences',
        'EntryKey',
        entryKey,
        db,
        entrySourceId
      );
    }

    // Process entry-level Domains if present
    const entryDomainsElement = entryElement.getElementsByTagName('Domains')[0];
    if (entryDomainsElement) {
      await processDomains(
        entryDomainsElement,
        'EntryDomains',
        'EntryKey',
        entryKey,
        db,
        entrySourceId
      );
    }

    // Process Senses if present
    const sensesElement = entryElement.getElementsByTagName('Senses')[0];
    if (sensesElement) {
      const senseElements = sensesElement.getElementsByTagName('Sense');
      for (let i = 0; i < senseElements.length; i++) {
        // Pass the language parameter to processSense
        await processSense(senseElements[i], entryKey, languageKey, db, entrySourceId);
      }
    }
  } catch (error: unknown) {
    console.error(
      `Error processing entry ${entrySourceId} (lemma: ${lemma}) in ${filePath}:`,
      error instanceof Error ? error.message : error
    );
    throw error; // Re-throw to handle at the transaction level
  }
}

async function processSense(
  senseElement: Element,
  entryKey: number,
  languageKey: number,
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

    const senseKey = await insertAndGetKey(
      db,
      'Senses',
      'SenseKey',
      {
        Id: senseSourceId,
        EntryKey: entryKey,
        Definition: definition,
        LanguageKey: languageKey,
      },
      'Get sense key'
    );

    // Process StrongsCodes if present at the sense level
    const strongsCodesElement = senseElement.getElementsByTagName('StrongsCodes')[0];
    if (strongsCodesElement) {
      const strongsCodeElements = strongsCodesElement.getElementsByTagName('StrongsCode');
      for (let i = 0; i < strongsCodeElements.length; i++) {
        const code = strongsCodeElements[i].textContent;
        if (code) await insert(db, 'SenseStrongsCodes', { SenseKey: senseKey, StrongsCode: code });
      }
    }

    // Process Glosses if present
    const glossesElement = senseElement.getElementsByTagName('Glosses')[0];
    if (glossesElement) {
      const glossElements = glossesElement.getElementsByTagName('Gloss');
      for (let i = 0; i < glossElements.length; i++) {
        const gloss = glossElements[i].textContent;
        if (gloss) await insert(db, 'Glosses', { SenseKey: senseKey, Gloss: gloss });
      }
    }

    // Process sense-level Occurrences if present
    const senseOccurrencesElement = senseElement.getElementsByTagName('Occurrences')[0];
    if (senseOccurrencesElement)
      await processOccurrences(
        senseOccurrencesElement,
        'SenseOccurrences',
        'SenseKey',
        senseKey,
        db,
        senseSourceId
      );

    // Process sense-level Domains if present
    const senseDomainsElement = senseElement.getElementsByTagName('Domains')[0];
    if (senseDomainsElement) {
      await processDomains(
        senseDomainsElement,
        'SenseDomains',
        'SenseKey',
        senseKey,
        db,
        senseSourceId
      );
    }
  } catch (error: unknown) {
    console.error(
      `Error processing sense ${senseSourceId} (for entry: ${parentSourceId}):`,
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function processOccurrences(
  occurrencesElement: Element,
  tableName: 'EntryOccurrences' | 'SenseOccurrences',
  keyColumn: 'EntryKey' | 'SenseKey',
  itemKey: number,
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
      // Get or create corpus key
      let corpusKey: number | undefined = cache.corpora.get(corpusName);
      if (corpusKey === undefined) {
        corpusKey = await insertAndGetKey(
          db,
          'Corpora',
          'CorpusKey',
          { Id: corpusName },
          'Insert and get corpus key'
        );
        if (!corpusKey) throw new Error(`Failed to get corpus key for ${corpusName}`);
        cache.corpora.set(corpusName, corpusKey);
      }

      // Collect all occurrences for bulk insert
      const occurrenceValues: [number, number, number, number, number, number][] = [];
      const occurrenceElements = corpusElement.getElementsByTagName('Occurrence');

      for (let j = 0; j < occurrenceElements.length; j++) {
        const occurrenceElement = occurrenceElements[j];
        const occurrenceType = occurrenceElement.getAttribute('Type');
        if (occurrenceType !== 'U23003') {
          console.warn('Skipping occurrence: type is not U23003');
          continue;
        }

        const occurrenceValue = occurrenceElement.textContent;
        if (!occurrenceValue) {
          console.warn('Skipping occurrence: missing text content');
          continue;
        }

        const parsedReference = parseU23003Reference(occurrenceValue);
        if (!parsedReference) {
          console.warn(`Skipping malformed occurrence value: ${occurrenceValue}`);
          continue;
        }

        const { bookNum, chapterNum, verseNum, wordNum } = parsedReference;

        // Skip if any of the values are undefined
        if (
          bookNum === undefined ||
          chapterNum === undefined ||
          verseNum === undefined ||
          wordNum === undefined
        ) {
          console.warn(`Skipping malformed occurrence value: ${occurrenceValue}`);
          continue;
        }

        occurrenceValues.push([itemKey, corpusKey, bookNum, chapterNum, verseNum, wordNum]);
      }

      // Bulk insert occurrences
      if (occurrenceValues.length > 0) {
        await bulkInsert(
          db,
          tableName,
          [keyColumn, 'CorpusKey', 'BookNum', 'ChapterNum', 'VerseNum', 'WordNum'],
          occurrenceValues
        );
      }
    } catch (error: unknown) {
      console.error(
        `Error processing corpus ${corpusName} for ${parentSourceId}:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }
}

async function processDomains(
  domainsElement: Element,
  tableName: 'EntryDomains' | 'SenseDomains',
  keyColumn: 'EntryKey' | 'SenseKey',
  itemKey: number,
  db: Database,
  parentSourceId: string
): Promise<void> {
  const domainElements = domainsElement.getElementsByTagName('Domain');

  for (let i = 0; i < domainElements.length; i++) {
    const domainElement = domainElements[i];
    const taxonomyName = domainElement.getAttribute('Taxonomy');
    const domainCode = domainElement.getAttribute('Code');

    if (!taxonomyName || !domainCode) {
      console.warn('Skipping domain: missing required attributes');
      continue;
    }

    try {
      // Get or cache taxonomy key
      let taxonomyKey = cache.taxonomies.get(taxonomyName);
      if (taxonomyKey === undefined) {
        taxonomyKey = await insertAndGetKey(
          db,
          'Taxonomies',
          'TaxonomyKey',
          { Id: taxonomyName },
          'Get taxonomy key for domain'
        );
        cache.taxonomies.set(taxonomyName, taxonomyKey);
      }

      // Now insert the domain reference
      await insert(db, tableName, {
        [keyColumn]: itemKey,
        TaxonomyKey: taxonomyKey,
        DomainCode: domainCode,
      });
    } catch (error: unknown) {
      console.error(
        `Error processing domain ${taxonomyName}:${domainCode} for ${parentSourceId}:`,
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

// Add database optimization function
async function optimizeDatabase(db: Database): Promise<void> {
  console.log('Optimizing database...');

  // Run VACUUM to reclaim space and reorganize the database file
  await db.exec('VACUUM;');

  // Run ANALYZE to update statistics used by the query planner
  await db.exec('ANALYZE;');

  console.log('Database optimization complete');
}

async function main() {
  console.log(`Initializing database at ${options.output}...`);
  const db = await initializeDatabase(options.output, options.schema);

  try {
    for (const inputDir of options.input) {
      console.log(`Processing directory: ${inputDir}`);
      await processDirectory(inputDir, db);
    }

    // Call our optimization function
    await optimizeDatabase(db);

    await db.close();
    console.log('Import completed successfully!');
  } catch (error: unknown) {
    console.error('Error during import:', error instanceof Error ? error.message : error);
    await db.close();
    process.exit(1);
  }
}

main();

/**
 * Helper functions exported for testing purposes.
 * This file contains all constants and helper functions used across the application.
 *
 * NOTE: Most code in this file is AI generated. Some human adjustments were made.
 */

import { DOMParser } from '@xmldom/xmldom';

// Define all constants in a single place
export const DICTIONARY_TYPE = {
  GREEK: 'SDBG',
  HEBREW: 'SDBH',
};

export const SENSE_TYPE = {
  LEXICAL: 'Lexical',
  CONTEXTUAL: 'Contextual',
};

export const CORPUS_ID = {
  GREEK: 'UBSGNT5',
  HEBREW: 'UBSBHS4',
};

// Define the minimum entry version for using lexical meanings
export const ENTRY_VERSION = {
  MIN_LEXICAL: 3,
};

export const SENSE_PREFIX = 'sense-';
export const ENTRY_PREFIX = 'entry-';

// Export the book map for use across the application
// Map of 3-digit book codes to 3-letter book abbreviations
export const bookMap: Record<string, string> = {
  '001': 'GEN',
  '002': 'EXO',
  '003': 'LEV',
  '004': 'NUM',
  '005': 'DEU',
  '006': 'JOS',
  '007': 'JDG',
  '008': 'RUT',
  '009': '1SA',
  '010': '2SA',
  '011': '1KI',
  '012': '2KI',
  '013': '1CH',
  '014': '2CH',
  '015': 'EZR',
  '016': 'NEH',
  '017': 'EST',
  '018': 'JOB',
  '019': 'PSA',
  '020': 'PRO',
  '021': 'ECC',
  '022': 'SNG',
  '023': 'ISA',
  '024': 'JER',
  '025': 'LAM',
  '026': 'EZK',
  '027': 'DAN',
  '028': 'HOS',
  '029': 'JOL',
  '030': 'AMO',
  '031': 'OBA',
  '032': 'JON',
  '033': 'MIC',
  '034': 'NAM',
  '035': 'HAB',
  '036': 'ZEP',
  '037': 'HAG',
  '038': 'ZEC',
  '039': 'MAL',
  '040': 'MAT',
  '041': 'MRK',
  '042': 'LUK',
  '043': 'JHN',
  '044': 'ACT',
  '045': 'ROM',
  '046': '1CO',
  '047': '2CO',
  '048': 'GAL',
  '049': 'EPH',
  '050': 'PHP',
  '051': 'COL',
  '052': '1TH',
  '053': '2TH',
  '054': '1TI',
  '055': '2TI',
  '056': 'TIT',
  '057': 'PHM',
  '058': 'HEB',
  '059': 'JAS',
  '060': '1PE',
  '061': '2PE',
  '062': '1JN',
  '063': '2JN',
  '064': '3JN',
  '065': 'JUD',
  '066': 'REV',
  '067': 'TOB',
  '068': 'JDT',
  '069': 'ESG',
  '070': 'WIS',
  '071': 'SIR',
  '072': 'BAR',
  '073': 'LJE',
  '074': 'S3Y',
  '075': 'SUS',
  '076': 'BEL',
  '077': '1MA',
  '078': '2MA',
  '079': '3MA',
  '080': '4MA',
  '081': '1ES',
  '082': '2ES',
  '083': 'MAN',
  '084': 'PS2',
  '085': 'ODA',
  '086': 'PSS',
  '087': 'JSA',
  '088': 'JDB',
  '089': 'TBS',
  '090': 'SST',
  '091': 'DNT',
  '092': 'BLT',
  '093': 'XXA',
  '094': 'XXB',
  '095': 'XXC',
  '096': 'XXD',
  '097': 'XXE',
  '098': 'XXF',
  '099': 'XXG',
  '100': 'FRT',
  '101': 'BAK',
  '102': 'OTH',
  '103': '3ES',
  '104': 'EZA',
  '105': '5EZ',
  '106': '6EZ',
  '107': 'INT',
  '108': 'CNC',
  '109': 'GLO',
  '110': 'TDX',
  '111': 'NDX',
  '112': 'DAG',
  '113': 'PS3',
  '114': '2BA',
  '115': 'LBA',
  '116': 'JUB',
  '117': 'ENO',
  '118': '1MQ',
  '119': '2MQ',
  '120': '3MQ',
  '121': 'REP',
  '122': '4BA',
  '123': 'LAO',
};

// Reverse mapping of book codes (3-letter abbreviation to book numbers)
// This aligns with the bookMap but in reverse direction
export const bookCodeToNumber: Record<string, number> = {
  GEN: 1,
  EXO: 2,
  LEV: 3,
  NUM: 4,
  DEU: 5,
  JOS: 6,
  JDG: 7,
  RUT: 8,
  '1SA': 9,
  '2SA': 10,
  '1KI': 11,
  '2KI': 12,
  '1CH': 13,
  '2CH': 14,
  EZR: 15,
  NEH: 16,
  EST: 17,
  JOB: 18,
  PSA: 19,
  PRO: 20,
  ECC: 21,
  SNG: 22,
  ISA: 23,
  JER: 24,
  LAM: 25,
  EZK: 26,
  DAN: 27,
  HOS: 28,
  JOL: 29,
  AMO: 30,
  OBA: 31,
  JON: 32,
  MIC: 33,
  NAM: 34,
  HAB: 35,
  ZEP: 36,
  HAG: 37,
  ZEC: 38,
  MAL: 39,
  MAT: 40,
  MRK: 41,
  LUK: 42,
  JHN: 43,
  ACT: 44,
  ROM: 45,
  '1CO': 46,
  '2CO': 47,
  GAL: 48,
  EPH: 49,
  PHP: 50,
  COL: 51,
  '1TH': 52,
  '2TH': 53,
  '1TI': 54,
  '2TI': 55,
  TIT: 56,
  PHM: 57,
  HEB: 58,
  JAS: 59,
  '1PE': 60,
  '2PE': 61,
  '1JN': 62,
  '2JN': 63,
  '3JN': 64,
  JUD: 65,
  REV: 66,
  TOB: 67,
  JDT: 68,
  ESG: 69,
  WIS: 70,
  SIR: 71,
  BAR: 72,
  LJE: 73,
  S3Y: 74,
  SUS: 75,
  BEL: 76,
  '1MA': 77,
  '2MA': 78,
  '3MA': 79,
  '4MA': 80,
  '1ES': 81,
  '2ES': 82,
  MAN: 83,
  PS2: 84,
  ODA: 85,
  PSS: 86,
  JSA: 87,
  JDB: 88,
  TBS: 89,
  SST: 90,
  DNT: 91,
  BLT: 92,
  XXA: 93,
  XXB: 94,
  XXC: 95,
  XXD: 96,
  XXE: 97,
  XXF: 98,
  XXG: 99,
  FRT: 100,
  BAK: 101,
  OTH: 102,
  '3ES': 103,
  EZA: 104,
  '5EZ': 105,
  '6EZ': 106,
  INT: 107,
  CNC: 108,
  GLO: 109,
  TDX: 110,
  NDX: 111,
  DAG: 112,
  PS3: 113,
  '2BA': 114,
  LBA: 115,
  JUB: 116,
  ENO: 117,
  '1MQ': 118,
  '2MQ': 119,
  '3MQ': 120,
  REP: 121,
  '4BA': 122,
  LAO: 123,
};

/**
 * Builds a sense ID from the owning `Lexicon_Entry` ID and the ID of the `LEXMeaning` the sense
 * comes from.
 *
 * The result is `sense-` followed by 15 digits: the entry number (the first 6 digits of the entry
 * ID) and the last 9 digits of the meaning ID. The source data writes meaning IDs either as 15
 * digits (entry number + 9) or as the bare 9 digits, and both forms give the same sense ID.
 * A lexical meaning's 9 digits end in `000`; this is not checked.
 *
 * Throws if either ID is not all digits or has the wrong length, or if a 15-digit meaning ID
 * starts with a different entry number than the entry, so a malformed or misplaced ID stops the
 * conversion instead of producing a bad sense ID.
 */
export function buildSenseId(entryId: string, meaningId: string): string {
  if (!/^\d{6,}$/.test(entryId)) {
    throw new Error(`Cannot build a sense ID: entry ID "${entryId}" is not at least 6 digits`);
  }
  if (!/^(\d{9}|\d{15})$/.test(meaningId)) {
    throw new Error(
      `Cannot build a sense ID: meaning ID "${meaningId}" is not 9 or 15 digits (entry ID "${entryId}")`
    );
  }
  const entryNumber = entryId.substring(0, 6);
  if (meaningId.length === 15 && meaningId.substring(0, 6) !== entryNumber) {
    throw new Error(
      `Cannot build a sense ID: meaning ID "${meaningId}" starts with a different entry number than entry ID "${entryId}"`
    );
  }
  return `${SENSE_PREFIX}${entryNumber}${meaningId.slice(-9)}`;
}

/**
 * Transform a domain code from concatenated 3-digit numbers to period-delimited values
 * For example: "001002003" becomes "1.2.3"
 */
export function transformDomainCode(code: string): string[] {
  // Skip empty codes
  if (!code) return [];

  // Relation codes (see the semantic domain notes in docs/current_lexicon_specification.md): a
  // period marks an agent … object relation, e.g. 084.051 is Human … Divine, and 084. is Human …
  // (the empty side has no code). A two-sided code yields both domains. We don't represent the
  // relation itself: the model has no place for it, and it's not clear how the ellipsis would be
  // shown for non-Latin scripts.
  if (code.length === 7 && code[3] === '.') {
    const code1 = code.substring(0, 3);
    const code2 = code.substring(4, 7);
    return [parseInt(code1, 10).toString(), parseInt(code2, 10).toString()];
  }

  // Everything after the first non-digit is kept, which covers the remaining forms:
  // - A one-sided relation (084. or .084) keeps its one code.
  // - An extension of meaning written inline, e.g. 002003002023>002001002006 (Serve>Diligent),
  //   keeps only the target domain.
  // - The spec describes Parts codes as 001002: followed by the domain, e.g. 001002:001003 for
  //   Parts: Vegetation, which would keep only the domain. Current data has no such codes.

  // If there are non-digit characters, keeping only characters after the first non-digit
  let updatedCode = code;
  let foundFirstNonDigit = false;
  for (let i = 0; i < code.length; i++) {
    if (!code[i].match(/\d/)) {
      foundFirstNonDigit = true;
    } else if (foundFirstNonDigit) {
      updatedCode = code.substring(i);
      break;
    }
  }

  // If there are no digits, return an empty array
  const digitsOnly = updatedCode.replace(/\D/g, '');
  if (!digitsOnly) return [];

  // If the length is not a multiple of 3, return the original code
  if (digitsOnly.length % 3 !== 0) {
    console.warn(`Invalid domain code length: ${code}`);
    return [code];
  }

  // Split the code into chunks of 3 characters
  const chunks: string[] = [];
  for (let i = 0; i < digitsOnly.length; i += 3) {
    if (i + 3 <= digitsOnly.length) {
      const chunk = digitsOnly.substring(i, i + 3);
      // Convert to number to remove leading zeros, then back to string
      chunks.push(parseInt(chunk, 10).toString());
    }
  }

  // Join the chunks with periods
  return [chunks.join('.')];
}

/**
 * Extracts definition and glosses from an XML element into a consistent format.
 * Used for both LEXSense and CONSense elements.
 */
export function extractDefinitionAndGlosses(element: Element): {
  definition: string;
  glosses: string[];
} {
  // Extract definition
  const definitionElem = element.getElementsByTagName('DefinitionShort')[0];
  const definition = definitionElem ? (definitionElem.textContent || '').trim() : '';

  // Extract glosses
  const glosses: string[] = [];
  const glossesElem = element.getElementsByTagName('Glosses')[0];
  if (glossesElem) {
    const glossElements = glossesElem.getElementsByTagName('Gloss');
    for (let j = 0; j < glossElements.length; j++) {
      const glossText = (glossElements[j].textContent || '').trim();
      if (glossText && !glosses.includes(glossText)) glosses.push(glossText);
    }
  }

  return { definition, glosses };
}

/**
 * Convert a MARBLELink ID to U23003 reference format.
 * Example: "04200100100002" to "LUK 1:1!1"
 * MARBLELink format: BBBCCCVVVPPWWW where
 *   BBB = book (001-066)
 *   CCC = chapter (01-99)
 *   VVV = verse (01-99)
 *   PP = verse part (always 00 for our purposes)
 *   WWW = word (01-99)
 */
export function marbleLinkIdToU23003(id: string): string {
  if (!id || id.length !== 14) {
    return '';
  }

  const bookId = id.substring(0, 3);
  const chapter = parseInt(id.substring(3, 6), 10);
  const verse = parseInt(id.substring(6, 9), 10);
  // Skip the next 2 digits as the verse part
  const word = parseInt(id.substring(11), 10) / 2; // Each word ID is a multiple of 2

  const book = bookMap[bookId] || '';
  if (!book) {
    console.warn(`Unknown book ID: ${bookId}`);
    return '';
  }

  return `${book} ${chapter}:${verse}!${word}`;
}

/**
 * The occurrences a lexical meaning's `LEXReference`s yield, and the references that yield none,
 * grouped by why they were skipped.
 */
export interface LexReferenceOccurrences {
  /** U23003 occurrences, each once, in source order */
  occurrences: string[];
  /** References whose first 14 characters are not 14 digits */
  invalid: string[];
  /** References with an odd word ID: readings from the critical apparatus, not in the base text */
  odd: string[];
  /** References to word 0, which point at a verse (such as a book title) rather than a word */
  wordZero: string[];
  /** References whose book number has no book code */
  unknownBook: string[];
}

/** The first 14 digits of a reference; trailing notes such as `{N:001}` and whitespace are ignored */
const reference14 = (reference: string): string => reference.trim().substring(0, 14);

/**
 * Converts the text of a lexical meaning's `LEXReference` elements into U23003 occurrences.
 *
 * Each reference is a 14-digit ID (BBBCCCVVVPPWWW, the same format as a MARBLELink ID), which may
 * be followed by a note such as `{N:001}`; only the first 14 characters are used. References that
 * cannot be shown as a word in the base text are skipped and returned by class, with the first 14
 * characters of each (or the whole trimmed text for an invalid one).
 */
export function occurrencesFromLexReferences(references: string[]): LexReferenceOccurrences {
  const result: LexReferenceOccurrences = {
    occurrences: [],
    invalid: [],
    odd: [],
    wordZero: [],
    unknownBook: [],
  };
  const seen = new Set<string>();

  for (const reference of references) {
    const trimmed = reference.trim();
    const id = reference14(reference);
    if (!/^\d{14}$/.test(id)) {
      result.invalid.push(trimmed);
      continue;
    }
    // An unknown book is a data error even when the word ID is odd, so it is checked first
    if (!bookMap[id.substring(0, 3)]) {
      result.unknownBook.push(id);
      continue;
    }
    // From Reinier: odd reference IDs refer to cases in the apparatus, which means that these words
    // are not in the text.
    if (!['0', '2', '4', '6', '8'].includes(id[13])) {
      result.odd.push(id);
      continue;
    }
    if (id.substring(11) === '000') {
      result.wordZero.push(id);
      continue;
    }
    const occurrence = marbleLinkIdToU23003(id);
    if (seen.has(occurrence)) continue;
    seen.add(occurrence);
    result.occurrences.push(occurrence);
  }

  return result;
}

/**
 * Gets the numeric book code for a given 3-letter book abbreviation.
 * Used for efficient storage and indexing of scripture references.
 *
 * @param bookCode 3-letter book abbreviation (e.g., "GEN", "PSA", "MAT", "REV")
 * @returns numeric book code (1-123)
 */
export function getBookNumber(bookCode: string): number {
  // Check if the book code exists directly in our mapping
  if (bookCodeToNumber[bookCode]) {
    return bookCodeToNumber[bookCode];
  }

  // If not found, handle alternate book codes or non-standard books
  // This ensures we always return a number even for unknown books
  console.warn(`Unknown book code: ${bookCode}, using hash value instead`);
  return bookCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

/**
 * Parses a U23003 format reference string (e.g., "ACT 7:22!7") into its component parts.
 *
 * @param reference Reference in U23003 format: "BookCode Chapter:Verse!Word"
 * @returns Object containing parsed values or null if the reference is invalid
 */
export function parseU23003Reference(reference: string): {
  bookNum: number;
  chapterNum: number;
  verseNum: number;
  wordNum: number;
} | null {
  // Format is Book Chapter:Verse!WordPosition - e.g., "ACT 7:22!7" or "HEB 11:29!14"
  const match = reference.match(/^(\w+)\s+(\d+):(\d+)!(\d+)$/);
  if (!match) {
    console.warn(`Invalid U23003 reference format: ${reference}`);
    return null;
  }

  const bookCode = match[1]; // e.g. "ACT", "HEB"
  const bookNum = getBookNumber(bookCode);
  const chapterNum = parseInt(match[2], 10);
  const verseNum = parseInt(match[3], 10);
  const wordNum = parseInt(match[4], 10);

  return { bookNum, chapterNum, verseNum, wordNum };
}

/**
 * The set of comparison keys of a lexical meaning's references, built once and used to check each
 * of its contextual meanings with `findConReferencesMissingFromLex`.
 */
export function referenceKeys(references: string[]): Set<string> {
  return new Set(references.map(reference14));
}

/**
 * Returns the contextual-meaning references (`CONReference`) that are missing from the lexical
 * references (`LEXReferences`) of the lexical meaning they belong to, given as the `referenceKeys`
 * of those references. Only the first 14 digits of each reference are compared; trailing notes such
 * as `{N:001}` and whitespace are ignored.
 */
export function findConReferencesMissingFromLex(
  conReferences: string[],
  lexReferenceKeys: ReadonlySet<string>
): string[] {
  return conReferences.map(reference14).filter(reference => !lexReferenceKeys.has(reference));
}

/**
 * Throws if the start and end tags of the XML are not properly nested. xmldom does not report a
 * mismatched or missing end tag (`<a>text</b>`, or an end tag for an outer element while an inner
 * one is still open), it quietly repairs the tree, so this checks the tag structure on its own.
 * Comments, CDATA sections, processing instructions, the DOCTYPE and self-closing tags are skipped.
 */
export function checkTagBalance(xml: string, sourceName: string): void {
  const fail = (message: string, position: number): never => {
    const line = xml.substring(0, position).split('\n').length;
    throw new Error(`Invalid XML in ${sourceName}: ${message} (line ${line})`);
  };
  const skipPast = (terminator: string, from: number, what: string): number => {
    const end = xml.indexOf(terminator, from);
    if (end === -1) return fail(`unterminated ${what}`, from);
    return end + terminator.length;
  };

  const open: { name: string; position: number }[] = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;
    if (xml.startsWith('<!--', lt)) {
      i = skipPast('-->', lt + 4, 'comment');
    } else if (xml.startsWith('<![CDATA[', lt)) {
      i = skipPast(']]>', lt + 9, 'CDATA section');
    } else if (xml.startsWith('<?', lt)) {
      i = skipPast('?>', lt + 2, 'processing instruction');
    } else if (xml.startsWith('<!', lt)) {
      // DOCTYPE: ends at the first '>' outside an internal subset in square brackets
      let depth = 0;
      let j = lt + 2;
      while (j < xml.length && !(xml[j] === '>' && depth === 0)) {
        if (xml[j] === '[') depth += 1;
        else if (xml[j] === ']') depth -= 1;
        j += 1;
      }
      if (j >= xml.length) fail('unterminated declaration', lt);
      i = j + 1;
    } else {
      // A start or end tag: find its closing '>', skipping any '>' inside quoted attribute values
      let j = lt + 1;
      let quote = '';
      while (j < xml.length && (quote || xml[j] !== '>')) {
        if (quote) {
          if (xml[j] === quote) quote = '';
        } else if (xml[j] === '"' || xml[j] === "'") {
          quote = xml[j];
        }
        j += 1;
      }
      if (j >= xml.length) fail('unterminated tag', lt);
      const body = xml.substring(lt + 1, j);
      i = j + 1;

      if (body.startsWith('/')) {
        const name = body.substring(1).trim();
        const top = open.pop();
        if (!top) fail(`end tag </${name}> has no matching start tag`, lt);
        else if (top.name !== name) {
          fail(
            `end tag </${name}> does not match start tag <${top.name}> from line ${
              xml.substring(0, top.position).split('\n').length
            }`,
            lt
          );
        }
      } else if (!body.endsWith('/')) {
        const name = /^[^\s/]+/.exec(body)?.[0];
        if (!name) fail('tag without a name', lt);
        else open.push({ name, position: lt });
      }
    }
  }

  const unclosed = open.pop();
  if (unclosed) fail(`start tag <${unclosed.name}> is never closed`, unclosed.position);
}

/**
 * Parses XML text, throwing on any well-formedness error that xmldom or the tag-balance check
 * detects. xmldom's default handler only logs errors and returns a partial document, which would
 * silently drop the data after the error, and it does not report mismatched end tags at all, so the
 * tag structure is checked separately by `checkTagBalance`. xmldom warnings, errors and fatal
 * errors all fail the parse. This is not a full validator: it does not check, for example, that
 * attribute values or entity references are valid.
 */
export function parseXmlStrict(xml: string, sourceName: string): Document {
  const fail = (message: string) => {
    throw new Error(`Invalid XML in ${sourceName}: ${message.trim()}`);
  };
  checkTagBalance(xml, sourceName);
  return new DOMParser({
    locator: {},
    errorHandler: {
      warning: fail,
      error: fail,
      fatalError: fail,
    },
  }).parseFromString(xml, 'text/xml');
}

/**
 * Parses the `Version` attribute of a `Lexicon_Entry`. Throws if it is missing or not a whole
 * number, because a version that reads as NaN would compare as "not below the minimum" and let a
 * malformed entry through.
 */
export function parseEntryVersion(rawVersion: string | null | undefined, entryId: string): number {
  const trimmed = (rawVersion ?? '').trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Entry ${entryId} has a missing or non-numeric Version: "${rawVersion ?? ''}"`);
  }
  return parseInt(trimmed, 10);
}

/**
 * Converts an internal entry or sense ID to the ID that is written to the output:
 * - An entry ID (`entry-` followed by the source entry ID) becomes the 6-digit entry number.
 * - A sense ID (`sense-` followed by 15 digits) becomes those 15 digits: the entry number followed
 *   by the 9 digits of the lexical meaning's ID.
 * Any other ID is returned as is.
 */
export function cleanId(id: string): string {
  if (id.startsWith(ENTRY_PREFIX))
    return id.substring(ENTRY_PREFIX.length, ENTRY_PREFIX.length + 6);
  if (id.startsWith(SENSE_PREFIX))
    return id.substring(SENSE_PREFIX.length, SENSE_PREFIX.length + 15);
  return id;
}

/**
 * Verifies that entry IDs and sense IDs are unique within each language, as they are written to
 * the output (entries by their 6-digit entry number). Throws on a duplicate so the conversion
 * fails instead of dropping or merging a meaning.
 */
export function verifyUniqueEntryAndSenseIds(
  entriesByLanguage: Record<string, Record<string, { id: string; senses: { id: string }[] }>>
): void {
  for (const language of Object.keys(entriesByLanguage)) {
    const entryIds = new Set<string>();
    const senseIds = new Set<string>();

    for (const entry of Object.values(entriesByLanguage[language])) {
      const outputEntryId = cleanId(entry.id);
      if (entryIds.has(outputEntryId)) {
        throw new Error(
          `Duplicate entry ID found in language '${language}': ${outputEntryId} (from ${entry.id})`
        );
      }
      entryIds.add(outputEntryId);

      for (const sense of entry.senses) {
        const outputSenseId = cleanId(sense.id);
        if (senseIds.has(outputSenseId)) {
          throw new Error(`Duplicate sense ID found in language '${language}': ${outputSenseId}`);
        }
        senseIds.add(outputSenseId);
      }
    }
  }
}

/** The message of a thrown value, which is not necessarily an `Error` */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What a command-line tool prints for a failure: its message, followed by the stack of the innermost
 * `cause` when that is an unexpected JavaScript error such as a `TypeError`. The tools' own data
 * errors are plain `Error`s whose message says everything, so they print without a stack.
 */
export function errorReport(error: unknown): string {
  let innermost = error;
  while (innermost instanceof Error && innermost.cause !== undefined) innermost = innermost.cause;
  const message = errorMessage(error);
  if (innermost instanceof Error && innermost.constructor !== Error && innermost.stack)
    return `${message}\n${innermost.stack}`;
  return message;
}

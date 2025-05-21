/**
 * Helper functions exported for testing purposes.
 * This file contains all constants and helper functions used across the application.
 *
 * NOTE: Most code in this file is AI generated. Some human adjustments were made.
 */

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

// Define the minimum versions for using lexical and contextual meanings
export const ENTRY_VERSION = {
  MIN_LEXICAL: 3,
  MIN_CONTEXTUAL: 5,
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
 * Condenses sense IDs that follow a hierarchical pattern.
 * Handles two types of patterns:
 * 1. Equal-length segments where parent IDs end with zeros and child IDs extend by replacing zeros with non-zero digits
 * 2. Different-length segments where later segments should be applied from the right-hand side
 *    ONLY if later segments are the same length or shorter than the previous length
 * Returns the condensed ID or the original ID if it doesn't match a known pattern.
 */
export function condenseSenseId(id: string): string {
  if (!id || !id.startsWith(SENSE_PREFIX)) return id;

  // Split the ID by hyphens
  const parts = id.split('-');

  // If we have less than 2 parts (e.g., "sense-12345"), just return the original ID
  if (parts.length < 2) return id;

  // Collect all numeric parts after "sense-"
  const numericParts = parts.slice(1);

  // Check if all parts are numeric
  if (!numericParts.every(part => /^\d+$/.test(part))) return id;

  // Check for pattern 1: same-length segments with hierarchical zeros
  if (numericParts.every(part => part.length === numericParts[0].length)) {
    let isHierarchical = true;

    // Check the hierarchical digit pattern
    for (let i = 1; i < numericParts.length; i++) {
      const prevPart = numericParts[i - 1];
      const currPart = numericParts[i];

      // Find the first position where the parts differ
      let diffPos = 0;
      while (diffPos < prevPart.length && prevPart[diffPos] === currPart[diffPos]) {
        diffPos++;
      }

      // Now check if all remaining digits in prevPart are zeros
      // and currPart has at least one non-zero digit in those positions
      let allZerosInPrev = true;
      let hasNonZeroInCurr = false;

      for (let j = diffPos; j < prevPart.length; j++) {
        if (prevPart[j] !== '0') {
          allZerosInPrev = false;
          break;
        }
        if (currPart[j] !== '0') {
          hasNonZeroInCurr = true;
        }
      }

      if (!allZerosInPrev || !hasNonZeroInCurr) {
        isHierarchical = false;
        break;
      }
    }

    // If hierarchical, return only "sense-" plus the last part
    if (isHierarchical && numericParts.length > 0) {
      return `${SENSE_PREFIX}${numericParts[numericParts.length - 1]}`;
    }
  }
  // Check for pattern 2: different-length segments applied from right to left
  else if (numericParts.length >= 2) {
    // Start with the base (first) numeric part
    let result = numericParts[0];

    // Check if any later segment is longer than its previous segment
    for (let i = 1; i < numericParts.length; i++) {
      if (numericParts[i].length > numericParts[i - 1].length) {
        // If any later segment is longer than its previous segment, return the original ID
        return id;
      }
    }

    // Process each subsequent part by overlaying it from the right
    for (let i = 1; i < numericParts.length; i++) {
      const currentPart = numericParts[i];

      // Replace the rightmost digits of result with the current part
      const overlayPosition = result.length - currentPart.length;
      result = result.substring(0, overlayPosition) + currentPart;
    }

    return `${SENSE_PREFIX}${result}`;
  }

  // If no pattern matches, return the original ID
  return id;
}

/**
 * Transform a domain code from concatenated 3-digit numbers to period-delimited values
 * For example: "001002003" becomes "1.2.3"
 */
export function transformDomainCode(code: string): string[] {
  // Skip empty codes
  if (!code) return [];

  // From Reinier: Some domain codes contain a period at the beginning, the end, or in the middle.
  // This is normally displayed as an ellipsis.
  // For example: 089.056 is displayed as Human … Divine (signifying that an event has a divine
  // actor and is affecting humans)
  //
  // We are not doing this because we aren't trying to represent relationships between domains in
  // the simple model we are using. Also it's not clear how we would even represent the specific
  // ellipsis example in the UI for non-Latin scripts.
  if (code.length === 7 && code[3] === '.') {
    const code1 = code.substring(0, 3);
    const code2 = code.substring(4, 7);
    return [parseInt(code1, 10).toString(), parseInt(code2, 10).toString()];
  }

  // From Reinier: Some domain codes are prefixed by 001002 followed by a colon. This code
  // represents the lexical semantic domain Parts.
  // e.g. 001002:001003 can be displayed as Parts: Vegetation
  //
  // We are not doing this because we aren't trying to represent relationships between domains in
  // the simple model we are using. We will just process the part after the colon.

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

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
export function transformDomainCode(code: string): string {
  // Skip empty codes
  if (!code) return '';

  // Split the code into chunks of 3 characters
  const chunks: string[] = [];
  for (let i = 0; i < code.length; i += 3) {
    if (i + 3 <= code.length) {
      const chunk = code.substring(i, i + 3);
      // Convert to number to remove leading zeros, then back to string
      chunks.push(parseInt(chunk, 10).toString());
    }
  }

  // Join the chunks with periods
  return chunks.join('.');
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
      if (glossText) glosses.push(glossText);
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

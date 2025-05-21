/**
 * MARBLE Lexicon Converter
 *
 * This module converts the MARBLE lexicon XML files to a new format that is more suitable
 * for consumption by applications. It processes lexicon files, combines them with
 * MARBLELinks data to add scripture references (occurrences), and outputs the result as XML files.
 *
 * The converter supports both SDBG (Greek) and SDBH (Hebrew) dictionaries and handles
 * various languages for each dictionary.
 *
 * See https://docs.google.com/document/d/1sxYArR24YxjxJDd-r1talTlK3YGKpUNPMK24z8RU1Tg
 *
 * NOTE: Most code in this file is AI generated. Some human adjustments were made.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { Command } from 'commander';
import {
  bookMap,
  condenseSenseId,
  CORPUS_ID,
  DICTIONARY_TYPE,
  ENTRY_PREFIX,
  ENTRY_VERSION,
  extractDefinitionAndGlosses,
  marbleLinkIdToU23003,
  SENSE_PREFIX,
  transformDomainCode,
} from './helpers';

// Define interfaces for our data structures
interface Occurrence {
  id: string; // U23003 formatted occurrence
}

interface Domain {
  taxonomy: string;
  code: string;
  value: string;
}

interface Sense {
  id: string;
  baseFormIndex: number;
  lexIndex: number;
  conIndex?: number;
  definition: string;
  glosses: string[];
  occurrences?: Occurrence[];
  domains?: Domain[];
}

interface Entry {
  lemma: string;
  id: string;
  // The flattened senses are used for output
  senses: Sense[];
  strongsCodes?: string[]; // Add strongsCodes property to store Strong's codes
}

interface EntriesByLanguage {
  [language: string]: {
    [lemma: string]: Entry;
  };
}

// Domain taxonomy structures
interface SubDomain {
  code: string;
  label: string;
  subDomains?: SubDomain[];
}

interface Taxonomy {
  id: string;
  title: string;
  subDomains: SubDomain[];
}

interface TaxonomiesByLanguage {
  [language: string]: {
    [taxonomyId: string]: Taxonomy;
  };
}

function getTaxonomyId(
  dictionaryType: 'SDBG' | 'SDBH',
  senseType: 'Lexical' | 'Contextual'
): string {
  return `${dictionaryType}-${senseType}`;
}

/**
 * Remove duplicate senses within the same entry.
 */
function removeDuplicateSensesWithinEntry(entriesByLanguage: EntriesByLanguage): void {
  for (const language in entriesByLanguage) {
    for (const lemma in entriesByLanguage[language]) {
      const entry = entriesByLanguage[language][lemma];

      const uniqueSenses: Record<string, Sense> = {};
      const duplicateSenses: Sense[] = [];

      for (const sense of entry.senses) {
        if (uniqueSenses[sense.id]) {
          // Compare the existing sense with the duplicate
          const existingSense = uniqueSenses[sense.id];

          const canCombine =
            (!existingSense.definition || !sense.definition) &&
            (!existingSense.glosses.length || !sense.glosses.length);

          if (canCombine) {
            // Combine data from both senses
            if (!existingSense.definition && sense.definition) {
              existingSense.definition = sense.definition;
            }
            if (!existingSense.glosses.length && sense.glosses.length) {
              existingSense.glosses = sense.glosses;
            }

            console.warn(
              `Senses combined in language '${language}', lemma '${lemma}', sense ID '${sense.id}'.`
            );
          } else {
            // Mark the duplicate sense for removal
            duplicateSenses.push(sense);
          }
        } else {
          uniqueSenses[sense.id] = sense;
        }
      }

      // Replace the entry's senses with the unique ones
      entry.senses = Object.values(uniqueSenses);

      // Log warnings for duplicate senses
      for (const duplicate of duplicateSenses) {
        console.warn(
          `Duplicate sense removed in language '${language}', lemma '${lemma}', sense ID '${duplicate.id}', glosses: [${duplicate.glosses.join(', ')}].`
        );
      }
    }
  }
}

/**
 * Verify and remove duplicate senses across entries in the same language.
 */
function verifyAndRemoveDuplicateSenses(entriesByLanguage: EntriesByLanguage): void {
  // Step 1: Condense all sense IDs
  for (const language in entriesByLanguage) {
    for (const lemma in entriesByLanguage[language]) {
      const entry = entriesByLanguage[language][lemma];

      // Condense each sense ID
      for (const sense of entry.senses) {
        sense.id = condenseSenseId(sense.id);
      }
    }
  }

  // Step 2: Remove duplicate senses within the same entry
  removeDuplicateSensesWithinEntry(entriesByLanguage);

  // Step 3: Verify unique IDs across all entries and senses within each language
  for (const language in entriesByLanguage) {
    const entryIds = new Set<string>();
    const senseIds = new Set<string>();

    for (const lemma in entriesByLanguage[language]) {
      const entry = entriesByLanguage[language][lemma];

      // Check for duplicate entry IDs within the language
      if (entryIds.has(entry.id)) {
        throw new Error(`Duplicate entry ID found in language '${language}': ${entry.id}`);
      }
      entryIds.add(entry.id);

      // Check for duplicate sense IDs within the language
      for (const sense of entry.senses) {
        if (senseIds.has(sense.id)) {
          throw new Error(`Duplicate sense ID found in language '${language}': ${sense.id}`);
        }
        senseIds.add(sense.id);
      }
    }
  }
}

/**
 * Remove empty entries and senses (those without definitions or glosses).
 * Returns statistics about how many entries and senses were removed.
 */
function removeEmptyEntriesAndSenses(entriesByLanguage: EntriesByLanguage): {
  entriesRemoved: number;
  sensesRemoved: number;
  totalEntries: number;
  totalSenses: number;
  entriesByLanguage: Record<string, number>;
  sensesByLanguage: Record<string, number>;
  totalSensesByLanguage: Record<string, number>;
} {
  let totalEntriesBefore = 0;
  let totalEntriesAfter = 0;
  let totalSensesBefore = 0;
  let totalSensesAfter = 0;
  const entriesRemovedByLanguage: Record<string, number> = {};
  const sensesRemovedByLanguage: Record<string, number> = {};
  const totalSensesByLanguage: Record<string, number> = {};

  // Count entries and senses before removal
  for (const language in entriesByLanguage) {
    const entries = entriesByLanguage[language];
    const entriesCount = Object.keys(entries).length;
    totalEntriesBefore += entriesCount;
    entriesRemovedByLanguage[language] = 0;
    sensesRemovedByLanguage[language] = 0;

    let sensesCount = 0;
    for (const lemma in entries) {
      sensesCount += entries[lemma].senses.length;
    }
    totalSensesBefore += sensesCount;
    totalSensesByLanguage[language] = 0; // Initialize for later counting
  }

  // Remove empty senses and entries
  for (const language in entriesByLanguage) {
    const entries = entriesByLanguage[language];
    const entriesBeforeCount = Object.keys(entries).length;
    let sensesBeforeCount = 0;
    let sensesAfterCount = 0;

    // First count all senses before filtering
    for (const lemma in entries) {
      sensesBeforeCount += entries[lemma].senses.length;
    }

    // Now filter senses and remove empty entries
    for (const lemma in entries) {
      const entry = entries[lemma];

      // Filter out senses that have no definition and no glosses
      const validSenses = entry.senses.filter(
        sense => sense.definition || sense.glosses.length > 0
      );
      const sensesRemoved = entry.senses.length - validSenses.length;
      sensesRemovedByLanguage[language] += sensesRemoved;

      entry.senses = validSenses;
      sensesAfterCount += validSenses.length;

      // If no senses remain, mark the entry for deletion
      if (entry.senses.length === 0) {
        delete entries[lemma];
      }
    }

    const entriesAfterCount = Object.keys(entries).length;
    entriesRemovedByLanguage[language] += entriesBeforeCount - entriesAfterCount;
    totalSensesByLanguage[language] = sensesAfterCount;
    totalEntriesAfter += entriesAfterCount;

    // Verify that our sense counts match what we expect
    if (sensesBeforeCount - sensesAfterCount !== sensesRemovedByLanguage[language]) {
      console.warn(`Sense count mismatch for language ${language}: 
        Before: ${sensesBeforeCount}, 
        After: ${sensesAfterCount}, 
        Removed: ${sensesRemovedByLanguage[language]}, 
        Difference: ${sensesBeforeCount - sensesAfterCount}`);
    }
  }

  // Count senses after removal
  for (const language in entriesByLanguage) {
    const entries = entriesByLanguage[language];
    let sensesAfterCount = 0;
    for (const lemma in entries) {
      sensesAfterCount += entries[lemma].senses.length;
    }
    totalSensesAfter += sensesAfterCount;
    totalSensesByLanguage[language] = sensesAfterCount;
  }

  return {
    entriesRemoved: totalEntriesBefore - totalEntriesAfter,
    sensesRemoved: totalSensesBefore - totalSensesAfter,
    totalEntries: totalEntriesAfter,
    totalSenses: totalSensesAfter,
    entriesByLanguage: entriesRemovedByLanguage,
    sensesByLanguage: sensesRemovedByLanguage,
    totalSensesByLanguage,
  };
}

/**
 * Process all XML files in the input directory and generate output files by language.
 */
function processLexiconFiles(
  inputDir: string,
  entriesByLanguage: EntriesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH'
): void {
  // Dictionary to hold entries by language
  const files = fs.readdirSync(inputDir).filter(filename => {
    return /^\w{4}-\d{2}\.xml$/i.test(filename);
  });

  let fileCount = 0;
  let successCount = 0;

  for (const filename of files) {
    fileCount++;
    const filePath = path.join(inputDir, filename);
    try {
      processFile(filePath, entriesByLanguage, dictionaryType);
      successCount++;
      if (fileCount % 10 === 0) {
        console.log(`Processed ${fileCount} files...`);
      }
    } catch (e) {
      console.error(`Error processing file ${filePath}: ${e}`);
    }
  }

  console.log(`Successfully processed ${successCount} out of ${fileCount} files.`);

  // Remove duplicate senses within entries and verify unique IDs
  verifyAndRemoveDuplicateSenses(entriesByLanguage);
}

/**
 * Process a single XML file and extract entries by language.
 */
function processFile(
  filePath: string,
  entriesByLanguage: EntriesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH'
): void {
  const xmlContent = fs.readFileSync(filePath, 'utf8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');

  // Helper function to get text content safely
  function getTextContent(element: Element | null): string {
    return element?.textContent || '';
  }

  // Helper function to get elements by tag name
  function findElements(element: Element, tagName: string): Element[] {
    const elements = element.getElementsByTagName(tagName);
    return Array.from(elements);
  }

  // Helper function to extract domain codes
  function extractDomains(
    container: Element,
    taxonomy: string,
    domainTagName: string,
    childTagName: string,
    subDomainTagName?: string,
    subDomainChildTagName?: string
  ): Domain[] {
    const domains: Domain[] = [];

    // First check for subdomain elements if applicable
    if (subDomainTagName && subDomainChildTagName) {
      const subDomainsElement = container.getElementsByTagName(subDomainTagName)[0];

      if (subDomainsElement) {
        // If subdomains exist, use them instead of regular domains
        const subDomainElements = subDomainsElement.getElementsByTagName(subDomainChildTagName);
        for (let i = 0; i < subDomainElements.length; i++) {
          const domainElement = subDomainElements[i];
          const codes = transformDomainCode(domainElement.getAttribute('Code') || '');
          const value = getTextContent(domainElement).trim();
          // Skip empty codes
          if (!codes || codes.length === 0) {
            console.warn(
              `Empty ${subDomainChildTagName} code with value "${value}" for element ${container.getAttribute('Id')} in file ${path.basename(filePath)}`
            );
            continue;
          }
          codes.forEach(code => domains.push({ taxonomy, code, value }));
        }

        // If we found subdomains, return them and don't process regular domains
        if (domains.length > 0) {
          return domains;
        }
      }
    }

    // Process regular domains if no subdomains were found or if subdomains are not applicable
    const domainsElement = container.getElementsByTagName(domainTagName)[0];

    if (domainsElement) {
      const domainElements = domainsElement.getElementsByTagName(childTagName);
      for (let i = 0; i < domainElements.length; i++) {
        const domainElement = domainElements[i];
        const codes = transformDomainCode(domainElement.getAttribute('Code') || '');
        const value = getTextContent(domainElement).trim();
        // Skip empty codes
        if (!codes || codes.length === 0) {
          // From Reinier:  when a contextual domain field is ‘-‘ it means that the information
          // is grammatical rather than contextual. There is nothing wrong with a missing code.
          if (value === '-') continue;

          console.warn(
            `Empty ${childTagName} code with value "${value}" for element ${container.getAttribute('Id')} in file ${path.basename(filePath)}`
          );
          continue;
        }
        codes.forEach(code => domains.push({ taxonomy, code, value }));
      }
    }

    return domains;
  }

  // Helper function to extract core domain codes
  function extractCoreDomains(container: Element, taxonomy: string): Domain[] {
    const domains: Domain[] = [];
    const coreDomainsElement = container.getElementsByTagName('LEXCoreDomains')[0];

    if (coreDomainsElement) {
      const coreDomainElements = coreDomainsElement.getElementsByTagName('LEXCoreDomain');
      for (let i = 0; i < coreDomainElements.length; i++) {
        const domainElement = coreDomainElements[i];
        const codes = transformDomainCode(domainElement.getAttribute('Code') || '');
        const value = getTextContent(domainElement).trim();
        // Skip empty codes
        if (!codes || codes.length === 0) {
          console.warn(
            `Empty LEXCoreDomain code with value "${value}" for element ${container.getAttribute('Id')} in file ${path.basename(filePath)}`
          );
          continue;
        }
        codes.forEach(code => domains.push({ taxonomy, code, value }));
      }
    }

    return domains;
  }

  // Helper function to combine domains
  function combineDomains(...domainArrays: Domain[][]): Domain[] | undefined {
    // Flatten all domain arrays
    const allDomains = domainArrays.flat().filter(domain => domain && domain.code);

    // Use a Map to track unique domain codes and taxonomies (preserving the first occurrence)
    const uniqueDomains = new Map<string, Domain>();

    for (const domain of allDomains) {
      if (!uniqueDomains.has(`${domain.taxonomy}${domain.code}`)) {
        uniqueDomains.set(`${domain.taxonomy}${domain.code}`, domain);
      }
    }

    const combined = Array.from(uniqueDomains.values());
    return combined.length > 0 ? combined : undefined;
  }

  // Helper function to extract CONReferences from a ContextualMeaning element
  function extractCONReferences(conMeaning: Element): Occurrence[] {
    const occurrences: Occurrence[] = [];
    const conReferencesElement = conMeaning.getElementsByTagName('CONReferences')[0];

    if (conReferencesElement) {
      const conReferenceElements = conReferencesElement.getElementsByTagName('CONReference');
      for (let i = 0; i < conReferenceElements.length; i++) {
        // Ignore notes (e.g., {N:001}) at the end of reference IDs
        const referenceId = getTextContent(conReferenceElements[i]).trim().substring(0, 14);

        if (!referenceId || !/^\d{14}$/.test(referenceId)) {
          console.warn(
            `Invalid CONReference ID: "${referenceId}" in file ${path.basename(filePath)}`
          );
          continue;
        }

        // Check if the reference is an odd number (similar to MARBLELink processing)
        if (!['0', '2', '4', '6', '8'].includes(referenceId[13])) {
          console.warn(
            `Odd CONReference ID (skipped): "${referenceId}" in file ${path.basename(filePath)}`
          );
          continue;
        }

        // Convert CONReference ID to U23003 reference format
        const u23003Reference = marbleLinkIdToU23003(referenceId);
        if (!u23003Reference) {
          console.warn(
            `Could not convert CONReference ID to U23003 format: "${referenceId}" in file ${path.basename(filePath)}`
          );
          continue;
        }

        occurrences.push({ id: u23003Reference });
      }
    }

    // Remove any duplicate occurrences
    const uniqueOccurrences = new Set(occurrences.map(occ => occ.id));
    if (uniqueOccurrences.size !== occurrences.length) {
      // Print out all the duplicates
      const rawOccurrences = occurrences.map(occ => occ.id);
      const duplicates = rawOccurrences.filter(
        (occ, index) => rawOccurrences.indexOf(occ) !== index
      );
      console.warn(
        `Duplicate CONReference IDs found in file ${path.basename(filePath)}: ${duplicates.join(', ')}`
      );
    }

    // Return the unique occurrences
    return Array.from(uniqueOccurrences).map(id => ({ id }));
  }

  // Process each lexicon entry
  const entries = doc.getElementsByTagName('Lexicon_Entry');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as Element;
    const lemma = entry.getAttribute('Lemma') || '';
    const entryId = entry.getAttribute('Id') || '';
    const entryVersion = parseInt(entry.getAttribute('Version') || '0');

    if (!lemma || !entryId) {
      console.warn(
        `Entry ID or lemma is missing for entry ${i} in file ${path.basename(filePath)}`
      );
      continue;
    }

    // From Reinier: exclude entries with a version number below 3. In addition, version 3/4 means
    // ignore contextual meanings. Version 5 means both lexical and contextual analysis have been
    // completed. SDBG is 100% done so you can ignore the version number.
    if (dictionaryType != DICTIONARY_TYPE.GREEK && entryVersion < ENTRY_VERSION.MIN_LEXICAL) {
      console.warn(
        `Skipping entry "${lemma}" (${entryId}) with version ${entryVersion} in file ${path.basename(filePath)}`
      );
      continue;
    }

    // Extract Strong's codes if present
    const strongsCodes: string[] = [];
    const strongCodesElement = entry.getElementsByTagName('StrongCodes')[0];
    if (strongCodesElement) {
      const strongElements = strongCodesElement.getElementsByTagName('Strong');
      for (let j = 0; j < strongElements.length; j++) {
        const strongCode = getTextContent(strongElements[j]).trim();
        if (strongCode) strongsCodes.push(strongCode);
      }
    }

    // Process each base form
    const baseForms = findElements(entry, 'BaseForm');

    for (let bfIdx = 0; bfIdx < baseForms.length; bfIdx++) {
      const baseForm = baseForms[bfIdx];
      const baseFormId = baseForm.getAttribute('Id') || '';
      if (!baseFormId) {
        console.warn(
          `BaseForm ID is missing for entry ${entryId} in file ${path.basename(filePath)}`
        );
        continue;
      }

      // Process each lexical meaning
      const lexMeanings = findElements(baseForm, 'LEXMeaning');

      for (let lmIdx = 0; lmIdx < lexMeanings.length; lmIdx++) {
        const lexMeaning = lexMeanings[lmIdx];
        const lexMeaningId = lexMeaning.getAttribute('Id') || '';
        const isBiblicalTerm = (lexMeaning.getAttribute('IsBiblicalTerm') || '').toUpperCase();

        // From Reinier:In SDBH, please ignore all lexical meanings for which the IsBiblicalTerm
        // attribute is set to X or N. They need to be in the database for specific reasons, but
        // are not linked to the text.
        if (dictionaryType == DICTIONARY_TYPE.HEBREW && ['X', 'N'].includes(isBiblicalTerm))
          continue;

        if (!lexMeaningId) {
          console.warn(
            `LexMeaning ID is missing for entry ${entryId}, base form ${baseFormId} in file ${path.basename(filePath)}`
          );
          continue;
        }

        // Get the taxonomy IDs for later
        const lexicalTaxonomyId = getTaxonomyId(dictionaryType, 'Lexical');
        const contextualTaxonomyId = getTaxonomyId(dictionaryType, 'Contextual');

        // Extract LEXDomains from the LEXMeaning
        const lexDomains = extractDomains(
          lexMeaning,
          lexicalTaxonomyId,
          'LEXDomains',
          'LEXDomain',
          'LEXSubDomains',
          'LEXSubDomain'
        );

        // Extract LEXCoreDomains from the LEXMeaning
        const lexCoreDomains = extractCoreDomains(lexMeaning, contextualTaxonomyId);

        // Process each LEXSense by language
        const lexSenses = findElements(lexMeaning, 'LEXSense');

        for (const lexSense of lexSenses) {
          const languageCode = lexSense.getAttribute('LanguageCode') || '';
          if (!languageCode) {
            console.warn(
              `Language code is missing for LEXSense in entry ${entryId}, base form ${baseFormId} in file ${path.basename(filePath)}`
            );
            continue;
          }

          const { definition, glosses } = extractDefinitionAndGlosses(lexSense);

          // Initialize entry in the language dictionary if it doesn't exist
          if (!entriesByLanguage[languageCode]) entriesByLanguage[languageCode] = {};

          if (!entriesByLanguage[languageCode][lemma]) {
            entriesByLanguage[languageCode][lemma] = {
              lemma,
              id: `${ENTRY_PREFIX}${entryId}`,
              senses: [],
              strongsCodes: strongsCodes.length > 0 ? strongsCodes : undefined,
            };
          }

          // Add the LexSense to the entry's senses
          entriesByLanguage[languageCode][lemma].senses.push({
            id: `${SENSE_PREFIX}${entryId}-${baseFormId}-${lexMeaningId}`,
            baseFormIndex: bfIdx,
            lexIndex: lmIdx,
            conIndex: undefined, // No ConMeaning for LexSense
            definition,
            glosses,
            occurrences: [],
            domains: combineDomains(lexDomains, lexCoreDomains),
          });
        }

        // From Reinier: Version 5 means both lexical and contextual analysis have been completed.
        // SDBG is 100% done so you can ignore the version number.
        if (
          dictionaryType != DICTIONARY_TYPE.GREEK &&
          entryVersion < ENTRY_VERSION.MIN_CONTEXTUAL
        ) {
          console.warn(
            `Skipping contextual meanings for entry "${lemma}" (${entryId}), base form ${baseFormId} in file ${path.basename(filePath)}`
          );
          continue;
        }

        // Process each CONMeaning and its CONSenses
        const conMeanings = findElements(lexMeaning, 'CONMeanings');

        for (let cmIdx = 0; cmIdx < conMeanings.length; cmIdx++) {
          const conMeaningContainer = conMeanings[cmIdx];
          const conMeaningElements = findElements(conMeaningContainer, 'ContextualMeaning');

          for (let cmElemIdx = 0; cmElemIdx < conMeaningElements.length; cmElemIdx++) {
            const conMeaning = conMeaningElements[cmElemIdx];
            const conMeaningId = conMeaning.getAttribute('Id') || '';
            if (!conMeaningId) {
              console.warn(
                `ContextualMeaning ID is missing for entry ${entryId}, base form ${baseFormId} in file ${path.basename(filePath)}`
              );
              continue;
            }

            // Extract CONDomains from the ContextualMeaning
            const conDomains = extractDomains(
              conMeaning,
              contextualTaxonomyId,
              'CONDomains',
              'CONDomain'
            );

            // Extract CONReferences from the ContextualMeaning
            const conOccurrences = extractCONReferences(conMeaning);

            // Process each CONSense by language
            const conSenses = findElements(conMeaning, 'CONSense');

            for (const conSense of conSenses) {
              const languageCode = conSense.getAttribute('LanguageCode') || '';
              if (!languageCode) {
                console.warn(
                  `Language code is missing for CONSense in entry ${entryId}, base form ${baseFormId} in file ${path.basename(filePath)}`
                );
                continue;
              }

              // Extract definition and glosses
              const { definition, glosses } = extractDefinitionAndGlosses(conSense);

              // Initialize entry in the language dictionary if it doesn't exist
              if (!entriesByLanguage[languageCode]) {
                entriesByLanguage[languageCode] = {};
              }

              if (!entriesByLanguage[languageCode][lemma]) {
                entriesByLanguage[languageCode][lemma] = {
                  lemma,
                  id: `${ENTRY_PREFIX}${entryId}`,
                  senses: [],
                  strongsCodes: strongsCodes.length > 0 ? strongsCodes : undefined,
                };
              }

              // Add the ConSense to the entry's senses
              entriesByLanguage[languageCode][lemma].senses.push({
                id: `${SENSE_PREFIX}${entryId}-${baseFormId}-${lexMeaningId}-${conMeaningId}`,
                baseFormIndex: bfIdx,
                lexIndex: lmIdx,
                conIndex: cmIdx,
                definition,
                glosses,
                occurrences: conOccurrences.length > 0 ? [...conOccurrences] : [],
                domains: combineDomains(conDomains, lexCoreDomains),
              });
            }
          }
        }
      }
    }
  }
}

/**
 * Helper function to check if a link is for a different dictionary type
 */
function isDictionaryTypeMismatch(
  linkText: string,
  expectedDictionaryType: 'SDBG' | 'SDBH'
): boolean {
  const parts = linkText.split(':');
  if (parts.length < 1) return false;

  const linkDictionaryType = parts[0].toUpperCase();
  return linkDictionaryType !== expectedDictionaryType;
}

/**
 * Process MARBLELinks XML files to extract lexical links and add occurrences to senses.
 */
function processMarbleLinksFiles(
  marbleLinksDir: string,
  entriesByLanguage: EntriesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH'
): void {
  // Find all XML files in the marble-indexes/Full directory
  const files = fs
    .readdirSync(marbleLinksDir)
    .filter(filename => filename.startsWith('MARBLELinks-') && filename.endsWith('.XML'));

  console.log(`Found ${files.length} MARBLELinks files to process`);

  let processedFileCount = 0;
  let skippedFilesCount = 0;
  let totalLinks = 0;
  let badLinks = 0;
  let oddNumberLinks = 0;
  let dictionaryMismatchLinks = 0;
  let processedLinks = 0;

  // Build a map of valid book codes for faster lookup
  const validBooks = new Set(Object.values(bookMap));

  // Track timing for performance analysis
  const startTime = Date.now();

  // Process this batch
  for (const filename of files) {
    // Extract the book code from the filename (e.g., "MARBLELinks-LUK.XML" -> "LUK")
    const match = filename.match(/MARBLELinks-([A-Z0-9]{3})\.XML/i);
    if (match) {
      const bookCode = match[1].toUpperCase();

      // Check if this book code is a valid book (using Set for O(1) lookup)
      if (!validBooks.has(bookCode)) {
        // Skip this file silently - it's for a book we don't support
        skippedFilesCount++;
        continue;
      }
    }

    const filePath = path.join(marbleLinksDir, filename);
    try {
      const result = processMarbleLinksFile(filePath, entriesByLanguage, dictionaryType);
      totalLinks += result.totalLinks;
      badLinks += result.badLinks;
      oddNumberLinks += result.oddNumberLinks;
      dictionaryMismatchLinks += result.dictionaryMismatchLinks;
      processedLinks += result.processedLinks;

      processedFileCount++;
    } catch (e) {
      console.error(`Error processing MARBLELinks file ${filePath}: ${e}`);
    }

    console.log(
      `Processed ${processedFileCount}/${files.length} files (${((processedFileCount / files.length) * 100).toFixed(1)}%)`
    );
  }

  // Calculate and log final statistics
  const totalTime = (Date.now() - startTime) / 1000;
  const filesPerSecond = processedFileCount / totalTime;
  const linksPerSecond = processedLinks / totalTime;

  console.log(`\nPerformance summary:`);
  console.log(`Total processing time: ${totalTime.toFixed(2)} seconds`);
  console.log(
    `Processing rate: ${filesPerSecond.toFixed(2)} files/sec, ${linksPerSecond.toFixed(2)} links/sec`
  );
  console.log(`\nStatistics summary:`);
  console.log(`Successfully processed ${processedFileCount} MARBLELinks files`);
  console.log(`Skipped ${skippedFilesCount} MARBLELinks files (unsupported books)`);
  console.log(`Total links found: ${totalLinks}`);
  console.log(`Links successfully processed: ${processedLinks}`);
  console.log(`Links skipped because they are odd numbers: ${oddNumberLinks}`);
  console.log(`Links skipped (invalid format or missing data): ${badLinks}`);
  console.log(`Links skipped due to dictionary type mismatch: ${dictionaryMismatchLinks}`);
}

/**
 * Process a single MARBLELinks XML file and add occurrences to the appropriate senses.
 */
function processMarbleLinksFile(
  filePath: string,
  entriesByLanguage: EntriesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH'
): {
  totalLinks: number;
  badLinks: number;
  oddNumberLinks: number;
  dictionaryMismatchLinks: number;
  processedLinks: number;
} {
  const xmlContent = fs.readFileSync(filePath, 'utf8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');

  let totalLinks = 0;
  let badLinks = 0;
  let oddNumberLinks = 0;
  let dictionaryMismatchLinks = 0;
  let processedLinks = 0;

  // Collect all MARBLELink elements (e.g., <MARBLELink Id="01200100800030">)
  const marbleLinks = doc.getElementsByTagName('MARBLELink');

  // Collect all the links to process
  const linksToProcess: { linkText: string; reference: string }[] = [];

  for (let i = 0; i < marbleLinks.length; i++) {
    const marbleLink = marbleLinks[i] as Element;
    const marbleLinkId = marbleLink.getAttribute('Id') || '';

    if (!marbleLinkId || !/^[0-9]{14}$/.test(marbleLinkId)) {
      console.warn(`Invalid MARBLELink ID: "${marbleLinkId}" in file ${path.basename(filePath)}`);
      totalLinks++;
      badLinks++;
      continue;
    }

    // From Reinier: Odd reference IDs in SDBG refer to cases in the apparatus, which means that
    // these words are not in the text. You will not be able to link them to the UBS GNT5. It is
    // good to have them in the lexicon, but cannot be accessed from the text.
    if (!['0', '2', '4', '6', '8'].includes(marbleLinkId[13])) {
      totalLinks++;
      oddNumberLinks++;
      continue;
    }

    // Convert MARBLELink ID to U23003 reference format
    const u23003Reference = marbleLinkIdToU23003(marbleLinkId);
    if (!u23003Reference) {
      console.warn(
        `Could not convert MARBLELink ID to U23003 format: "${marbleLinkId}" in file ${path.basename(filePath)}`
      );
      totalLinks++;
      badLinks++;
      continue;
    }

    // Process lexical links (e.g., <LexicalLink>SDBH:אֵלִיָּהוּ:000000:Names of People</LexicalLink>)
    const lexicalLinks = marbleLink.getElementsByTagName('LexicalLink');
    for (let j = 0; j < lexicalLinks.length; j++) {
      totalLinks++;
      const lexicalLink = lexicalLinks[j];
      const linkText = lexicalLink.textContent?.trim() || '';

      if (!linkText) {
        console.warn(
          `Empty LexicalLink found in MARBLELink "${marbleLinkId}" in file ${path.basename(filePath)}`
        );
        badLinks++;
        continue;
      }

      // Quick check for dictionary type mismatch to avoid unnecessary processing
      if (isDictionaryTypeMismatch(linkText, dictionaryType)) {
        dictionaryMismatchLinks++;
        continue;
      }

      // Add to batch for processing
      linksToProcess.push({ linkText, reference: u23003Reference });
    }
  }

  for (const { linkText, reference } of linksToProcess) {
    if (processLexicalLink(linkText, reference, entriesByLanguage, dictionaryType))
      processedLinks++;
    else badLinks++;
  }

  return {
    totalLinks,
    badLinks,
    oddNumberLinks,
    dictionaryMismatchLinks,
    processedLinks,
  };
}

/**
 * Parse a lexical link and add the occurrence to the appropriate sense.
 * Format: "SDBG:ἐπειδήπερ:000000:Relations" or "SDBG:ἐπειδήπερ:000000000:Relations"
 * The sense index has either 6 or 9 digits:
 *   - First 3 digits: BaseForm index (zero-based)
 *   - Next 3 digits: LexMeaning index (zero-based)
 *   - (Optional) Last 3 digits: ConMeaning index (zero-based)
 */
function processLexicalLink(
  linkText: string,
  reference: string,
  entriesByLanguage: EntriesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH'
): boolean {
  // Split by colon
  const parts = linkText.split(':');
  if (parts.length < 3) {
    return false;
  }

  const linkDictionaryType = parts[0]; // e.g., "SDBG" or "SDBH"
  const lemma = parts[1]; // e.g., "ἐπειδήπερ"
  const senseIndex = parts[2]; // e.g., "000000" or "000000000"

  // Early return for dictionary mismatch
  if (linkDictionaryType.toUpperCase() !== dictionaryType) {
    return false;
  }

  if (!lemma || !senseIndex) {
    console.warn(`Invalid lexical link format: "${linkText}"`);
    return false;
  }

  // Check if the sense index has valid length (either 6 or 9 digits)
  if (senseIndex.length !== 6 && senseIndex.length !== 9) {
    console.warn(`Invalid sense index length: "${senseIndex}" in link "${linkText}"`);
    return false;
  }

  // Parse the indexes based on the hierarchical structure
  const baseFormIndex = parseInt(senseIndex.substring(0, 3), 10);
  const lexMeaningIndex = parseInt(senseIndex.substring(3, 6), 10);
  const hasConMeaning = senseIndex.length === 9;
  const conMeaningIndex = hasConMeaning ? parseInt(senseIndex.substring(6, 9), 10) : -1;

  // Now add occurrences to all languages that have these sense IDs
  let updatedAny = false;

  for (const languageCode in entriesByLanguage) {
    if (!entriesByLanguage[languageCode][lemma]) continue;

    const entry = entriesByLanguage[languageCode][lemma];
    for (const sense of entry.senses) {
      if (sense.baseFormIndex !== baseFormIndex) continue;
      if (sense.lexIndex !== lexMeaningIndex) continue;
      if (hasConMeaning && sense.conIndex !== conMeaningIndex) continue;

      if (!sense.occurrences) sense.occurrences = [];
      sense.occurrences.push({ id: reference });
      updatedAny = true;
      break;
    }
  }

  // Log if we added occurrences
  if (!updatedAny)
    console.warn(
      `Could not find sense index '${senseIndex}' for lemma '${lemma}' to add occurrence '${reference}`
    );
  return updatedAny;
}

/**
 * Process domain XML files to build taxonomies.
 */
function processDomainFiles(
  inputDir: string,
  taxonomiesByLanguage: TaxonomiesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH'
): void {
  // Look for SDBG-DOMAINS*.XML or SDBH-DOMAINS*.XML files
  const prefix = dictionaryType === DICTIONARY_TYPE.GREEK ? 'SDBG-DOMAINS' : 'SDBH-DOMAINS';
  const files = fs
    .readdirSync(inputDir)
    .filter(filename => filename.toUpperCase().startsWith(prefix) && filename.endsWith('.XML'));

  if (files.length === 0) {
    console.warn(`No domain files found with prefix ${prefix} in ${inputDir}`);
    return;
  }

  console.log(`Found ${files.length} domain files to process`);

  for (const filename of files) {
    const filePath = path.join(inputDir, filename);
    try {
      processDomainFile(filePath, dictionaryType, taxonomiesByLanguage);
    } catch (e) {
      console.error(`Error processing domain file ${filePath}: ${e}`);
    }
  }

  console.log(
    `Processed ${Object.keys(taxonomiesByLanguage).length} languages for domain taxonomies`
  );
}

/**
 * Process a single domain XML file to extract taxonomies by language.
 */
function processDomainFile(
  filePath: string,
  dictionaryType: 'SDBG' | 'SDBH',
  taxonomiesByLanguage: TaxonomiesByLanguage
): void {
  // From Reinier: DOMAINS1.XML is for lexical domains and DOMAINS2.XML is for contextual domains
  const senseType = filePath.includes('1') ? 'Lexical' : 'Contextual';

  const xmlContent = fs.readFileSync(filePath, 'utf8');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'text/xml');

  // Get all semantic domains
  const semanticDomains = doc.getElementsByTagName('SemanticDomain');
  console.log(
    `Found ${semanticDomains.length} semantic domains in ${path.basename(filePath)} for ${senseType} domains`
  );

  // Map to store domains by code
  const domainsByCode: Record<string, Element> = {};
  const domainsByLevel: Record<string, Element[]> = {};
  const topLevelDomainCodes: string[] = [];

  // First pass: collect all domains and organize them by level
  for (let i = 0; i < semanticDomains.length; i++) {
    const domain = semanticDomains[i] as Element;
    const codeElement = domain.getElementsByTagName('Code')[0];

    if (!codeElement) {
      console.warn(`Semantic domain #${i} has no Code element in ${path.basename(filePath)}`);
      continue;
    }

    const codes = transformDomainCode(codeElement.textContent || '');
    if (!codes || codes.length === 0) {
      console.warn(`Semantic domain #${i} has empty Code in ${path.basename(filePath)}`);
      continue;
    }

    if (codes.length !== 1) {
      console.warn(
        `Semantic domain #${i} has multiple codes (${codes.join(', ')}) in ${path.basename(filePath)}`
      );
      continue;
    }

    const code = codes[0];
    domainsByCode[code] = domain;

    const levelElement = domain.getElementsByTagName('Level')[0];
    const level = levelElement?.textContent || '0';

    if (!domainsByLevel[level]) {
      domainsByLevel[level] = [];
    }

    domainsByLevel[level].push(domain);

    // Keep track of top-level domains (level 1)
    if (level === '1') {
      topLevelDomainCodes.push(code);
    }
  }

  // Process for each language
  const processedLanguages = new Set<string>();

  // Identify all available languages across all domains
  for (const code in domainsByCode) {
    const domain = domainsByCode[code];
    const localizationsElement = domain.getElementsByTagName('SemanticDomainLocalizations')[0];

    if (!localizationsElement) {
      continue;
    }

    const localizations = localizationsElement.getElementsByTagName('SemanticDomainLocalization');

    for (let j = 0; j < localizations.length; j++) {
      const localization = localizations[j] as Element;
      const languageCode = localization.getAttribute('LanguageCode') || '';
      if (languageCode) processedLanguages.add(languageCode);
    }
  }

  // Build hierarchical taxonomies for each language
  for (const languageCode of processedLanguages) {
    // Initialize the language in taxonomiesByLanguage if not already done
    if (!taxonomiesByLanguage[languageCode]) {
      taxonomiesByLanguage[languageCode] = {};
    }

    // Generate a unique taxonomy ID for this dictionary type and sense type
    const taxonomyId = getTaxonomyId(dictionaryType, senseType);

    // Create a new taxonomy for this specific sense type (Lexical or Contextual)
    taxonomiesByLanguage[languageCode][taxonomyId] = {
      id: taxonomyId,
      title: `${senseType} Semantic Domains for ${dictionaryType === DICTIONARY_TYPE.GREEK ? 'Greek' : 'Hebrew'}`,
      subDomains: [],
    };

    // Build top-level domains first
    for (const topLevelCode of topLevelDomainCodes) {
      const domain = domainsByCode[topLevelCode];
      const label = getLabelForLanguage(domain, languageCode);

      // Create top-level subdomain
      const subDomain: SubDomain = {
        code: topLevelCode,
        label,
        subDomains: [],
      };

      // Build hierarchy for this top-level domain by recursively adding child domains
      buildDomainHierarchy(subDomain, topLevelCode, languageCode, domainsByCode, 2);

      // Add to taxonomy
      taxonomiesByLanguage[languageCode][taxonomyId].subDomains.push(subDomain);
    }
  }

  console.log(`Processed ${processedLanguages.size} languages for ${senseType} domain taxonomy`);

  /**
   * Recursively builds a domain hierarchy starting from a parent domain
   */
  function buildDomainHierarchy(
    parentDomain: SubDomain,
    parentCode: string,
    languageCode: string,
    domainsMap: Record<string, Element>,
    currentLevel: number
  ): void {
    // Find all domains that start with the parent code and are at the current level
    // For example, if parentCode is "001" and currentLevel is 2, find all codes like "001001", "001002", etc.
    Object.keys(domainsMap)
      .filter(code => {
        // The code must start with parent code but not be the parent code itself
        if (code === parentCode || !code.startsWith(`${parentCode}.`)) return false;

        // Check if this is a direct child (next level)
        const domain = domainsMap[code];
        const levelElement = domain.getElementsByTagName('Level')[0];
        const level = parseInt(levelElement?.textContent || '0');

        return level === currentLevel;
      })
      .forEach(childCode => {
        const childDomain = domainsMap[childCode];
        const childLabel = getLabelForLanguage(childDomain, languageCode);

        // Create child subdomain
        const childSubDomain: SubDomain = {
          code: childCode,
          label: childLabel,
          subDomains: [],
        };

        // Check if we need to go deeper (only if this domain has subdomains)
        const hasSubDomainsElement = childDomain.getElementsByTagName('HasSubDomains')[0];
        const hasSubDomains = hasSubDomainsElement?.textContent === 'true';

        if (hasSubDomains) {
          buildDomainHierarchy(
            childSubDomain,
            childCode,
            languageCode,
            domainsMap,
            currentLevel + 1
          );
        }

        // Add this child to the parent's subdomains
        if (!parentDomain.subDomains) {
          parentDomain.subDomains = [];
        }

        parentDomain.subDomains.push(childSubDomain);
      });
  }

  /**
   * Helper function to get the label for a semantic domain in a specific language
   */
  function getLabelForLanguage(domainElement: Element, languageCode: string): string {
    const localizationsElement = domainElement.getElementsByTagName(
      'SemanticDomainLocalizations'
    )[0];

    if (!localizationsElement) {
      return '';
    }

    const localizations = localizationsElement.getElementsByTagName('SemanticDomainLocalization');

    for (let j = 0; j < localizations.length; j++) {
      const localization = localizations[j] as Element;
      const locLangCode = localization.getAttribute('LanguageCode') || '';

      if (locLangCode === languageCode) {
        const labelElement = localization.getElementsByTagName('Label')[0];
        return labelElement?.textContent || '';
      }
    }

    return '';
  }
}

/**
 * Remove and log duplicate occurrences from senses in entries by language
 */
function removeDuplicateOccurrences(entriesByLanguage: EntriesByLanguage): void {
  for (const languageCode in entriesByLanguage) {
    const entries = entriesByLanguage[languageCode];
    for (const entry of Object.values(entries)) {
      for (const sense of entry.senses) {
        if (sense.occurrences) {
          const uniqueOccurrences = new Set(sense.occurrences.map(occ => occ.id));
          sense.occurrences = Array.from(uniqueOccurrences).map(id => ({ id }));
          if (uniqueOccurrences.size !== sense.occurrences.length) {
            // Print out all the duplicates
            const rawOccurrences = sense.occurrences.map(occ => occ.id);
            const duplicates = rawOccurrences.filter(
              (occ, index) => rawOccurrences.indexOf(occ) !== index
            );
            console.warn(
              `Duplicate occurrences found for sense ${sense.id}: ${duplicates.join(', ')}`
            );
          }
        }
      }
    }
  }
}

/**
 * Write entries to an XML output file.
 */
function writeOutputFile(
  outputFile: string,
  entries: Record<string, Entry>,
  language: string,
  dictionaryType: 'SDBG' | 'SDBH',
  version: string,
  taxonomiesByLanguage?: TaxonomiesByLanguage
): void {
  const doc = new DOMParser().parseFromString(
    '<LexicalReferenceText></LexicalReferenceText>',
    'text/xml'
  );
  const root = doc.documentElement;
  root.setAttribute('SchemaVersion', '1.0');
  root.setAttribute('Id', dictionaryType);
  root.setAttribute(
    'Title',
    dictionaryType === DICTIONARY_TYPE.GREEK
      ? 'Biblical Greek Dictionary'
      : 'Biblical Hebrew Dictionary'
  );
  root.setAttribute('DataVersion', version);
  root.setAttribute('Language', language);

  // Create the Entries container element
  const entriesElem = doc.createElement('Entries');
  root.appendChild(entriesElem);

  /**
   * Helper function to clean IDs:
   * 1. Remove the prefix (entry-/sense-)
   * 2. Trim IDs to the appropriate length
   */
  function cleanId(id: string): string {
    // From https://docs.google.com/document/d/1sxYArR24YxjxJDd-r1talTlK3YGKpUNPMK24z8RU1Tg
    // 6 digits representing the entry and 9 digits representing each level
    // (base form index, lexical meaning index, contextual meaning index)
    if (id.startsWith(ENTRY_PREFIX))
      return id.substring(ENTRY_PREFIX.length, ENTRY_PREFIX.length + 6);
    else if (id.startsWith(SENSE_PREFIX))
      return id.substring(SENSE_PREFIX.length, SENSE_PREFIX.length + 15);
    // If the ID doesn't start with either prefix, return it as is
    else return id;
  }

  // Add entries
  const sortedLemmas = Object.keys(entries).sort();
  for (const lemma of sortedLemmas) {
    const entryData = entries[lemma];

    const entryElem = doc.createElement('Entry');
    entryElem.setAttribute('Id', cleanId(entryData.id));
    entryElem.setAttribute('Lemma', lemma);

    // Add Strong's codes if available
    if (entryData.strongsCodes && entryData.strongsCodes.length > 0) {
      const strongsCodesElem = doc.createElement('StrongsCodes');
      for (const code of entryData.strongsCodes) {
        const strongsCodeElem = doc.createElement('StrongsCode');
        strongsCodeElem.textContent = code;
        strongsCodesElem.appendChild(strongsCodeElem);
      }
      entryElem.appendChild(strongsCodesElem);
    }

    // Create the Senses container element
    const sensesElem = doc.createElement('Senses');
    entryElem.appendChild(sensesElem);

    // Flatten all senses for output, respecting their original hierarchy
    // We don't output the full hierarchy, just all senses in a flat structure
    for (const senseData of entryData.senses) {
      const senseElem = doc.createElement('Sense');
      senseElem.setAttribute('Id', cleanId(senseData.id));

      const definitionElem = doc.createElement('Definition');
      definitionElem.textContent = senseData.definition;
      senseElem.appendChild(definitionElem);

      const glossesElem = doc.createElement('Glosses');
      for (const glossText of senseData.glosses) {
        const glossElem = doc.createElement('Gloss');
        glossElem.textContent = glossText;
        glossesElem.appendChild(glossElem);
      }
      senseElem.appendChild(glossesElem);

      // Add Occurrences element with U23003 formatted occurrences
      if (senseData.occurrences && senseData.occurrences.length > 0) {
        const occurrencesElem = doc.createElement('Occurrences');

        // Create Corpus element with appropriate ID
        const corpusElem = doc.createElement('Corpus');
        const corpusId =
          dictionaryType === DICTIONARY_TYPE.GREEK ? CORPUS_ID.GREEK : CORPUS_ID.HEBREW;
        corpusElem.setAttribute('Id', corpusId);

        // Add occurrences to the corpus
        for (const occurrence of senseData.occurrences) {
          const occurrenceElem = doc.createElement('Occurrence');
          occurrenceElem.setAttribute('Type', 'U23003');
          occurrenceElem.textContent = occurrence.id;
          corpusElem.appendChild(occurrenceElem);
        }

        occurrencesElem.appendChild(corpusElem);
        senseElem.appendChild(occurrencesElem);
      }

      // Add Domains element with domain codes and values
      if (senseData.domains && senseData.domains.length > 0) {
        const domainsElem = doc.createElement('Domains');
        for (const domain of senseData.domains) {
          const domainElem = doc.createElement('Domain');
          domainElem.setAttribute('Taxonomy', domain.taxonomy);
          domainElem.setAttribute('Code', domain.code);
          domainElem.textContent = domain.value;
          domainsElem.appendChild(domainElem);
        }
        senseElem.appendChild(domainsElem);
      }

      sensesElem.appendChild(senseElem);
    }

    entriesElem.appendChild(entryElem);
  }

  // Add taxonomies if available for this language
  if (
    taxonomiesByLanguage &&
    taxonomiesByLanguage[language] &&
    Object.keys(taxonomiesByLanguage[language]).length > 0
  ) {
    const taxonomiesElem = doc.createElement('Taxonomies');
    root.appendChild(taxonomiesElem);

    // Add each taxonomy for the language (both Lexical and Contextual)
    for (const taxonomyId in taxonomiesByLanguage[language]) {
      const taxonomy = taxonomiesByLanguage[language][taxonomyId];
      const taxonomyElem = doc.createElement('Taxonomy');
      taxonomyElem.setAttribute('Id', taxonomy.id);
      taxonomyElem.setAttribute('Title', taxonomy.title);

      // Create the SubDomains container element
      const subDomainsElem = doc.createElement('SubDomains');
      taxonomyElem.appendChild(subDomainsElem);

      // Add each subdomain
      for (const subDomain of taxonomy.subDomains) {
        addSubDomainToElement(subDomain, subDomainsElem);
      }

      taxonomiesElem.appendChild(taxonomyElem);
    }
  }

  /**
   * Helper function to recursively add subdomains to an element
   */
  function addSubDomainToElement(subDomain: SubDomain, parentElement: Element): void {
    // Create SubDomain element
    const subDomainElem = doc.createElement('SubDomain');
    subDomainElem.setAttribute('Code', subDomain.code);
    if (subDomain.label) subDomainElem.setAttribute('Name', subDomain.label);

    // If this subdomain has children, add them in a SubDomains container
    if (subDomain.subDomains && subDomain.subDomains.length > 0) {
      // Create SubDomains container for children
      const childSubDomainsElem = doc.createElement('SubDomains');

      // Add each child subdomain recursively
      for (const childSubDomain of subDomain.subDomains) {
        addSubDomainToElement(childSubDomain, childSubDomainsElem);
      }

      // Append the SubDomains container to the current subdomain
      subDomainElem.appendChild(childSubDomainsElem);
    }

    // Finally add the completed subdomain to its parent
    parentElement.appendChild(subDomainElem);
  }

  // Write to file with pretty printing
  const serializer = new XMLSerializer();
  const xmlString = serializer.serializeToString(doc);
  const prettyXml = formatXml(xmlString);

  fs.writeFileSync(outputFile, '<?xml version="1.0" encoding="UTF-8"?>\n' + prettyXml);
}

/**
 * Helper function to format XML with indentation.
 */
function formatXml(xml: string): string {
  let formatted = '';
  let indent = '';
  const tab = '  '; // 2 spaces

  xml.split(/>\s*</).forEach(node => {
    if (node.match(/^\/\w/)) {
      // Closing tag
      indent = indent.substring(tab.length);
    }

    formatted += indent + '<' + node + '>\n';

    if (node.match(/^<?\w[^>]*[^/]$/) && !node.startsWith('?')) {
      // Opening tag
      indent += tab;
    }
  });

  return formatted.substring(1, formatted.length - 2);
}

function main(): void {
  const program = new Command();

  program
    .name('convert-marble-lexicon')
    .description('Convert MARBLE lexicon files to new format')
    .requiredOption('-i, --input <dir>', 'Input directory containing lexicon XML files')
    .requiredOption('-o, --output <dir>', 'Output directory for new format files')
    .requiredOption('-m, --marble-links <dir>', 'Directory containing MARBLELinks XML files')
    .requiredOption('-d, --dictionary-type <type>', 'Dictionary type (SDBG or SDBH)')
    .requiredOption('-v, --version <version>', 'Version number for the output dictionary')
    .option('-t, --domains <dir>', 'Directory containing domain XML files')
    .parse(process.argv);

  const options = program.opts();
  const dictionaryType = options.dictionaryType.toUpperCase();

  // Validate dictionary type
  if (dictionaryType !== DICTIONARY_TYPE.GREEK && dictionaryType !== DICTIONARY_TYPE.HEBREW) {
    console.error(`Error: Dictionary type must be either SDBG or SDBH, got '${dictionaryType}'.`);
    process.exit(1);
  }

  // Validate directories
  if (!fs.existsSync(options.input)) {
    console.error(`Error: Input directory '${options.input}' does not exist.`);
    process.exit(1);
  }

  if (!fs.existsSync(options.marbleLinks)) {
    console.error(`Error: MARBLELinks directory '${options.marbleLinks}' does not exist.`);
    process.exit(1);
  }

  console.log(`Starting lexicon conversion...`);
  console.log(`Dictionary type: ${dictionaryType}`);
  console.log(`Input directory: ${options.input}`);
  console.log(`MARBLELinks directory: ${options.marbleLinks}`);
  console.log(`Output directory: ${options.output}`);
  console.log(`Version: ${options.version}`);

  if (options.domains) {
    console.log(`Domains directory: ${options.domains}`);
  }

  // Create entriesByLanguage data structure
  const entriesByLanguage: EntriesByLanguage = {};

  // Create taxonomiesByLanguage data structure
  const taxonomiesByLanguage: TaxonomiesByLanguage = {};

  // First, process the lexicon files to build the data structure
  console.log(`\nStep 1: Processing lexicon files...`);
  const processLexiconStart = Date.now();
  processLexiconFiles(options.input, entriesByLanguage, dictionaryType);
  console.log(
    `Lexicon processing completed in ${((Date.now() - processLexiconStart) / 1000).toFixed(2)} seconds.`
  );

  // Next, process MARBLELinks files to add occurrences to senses
  console.log(`\nStep 2: Processing MARBLELinks files to add occurrences...`);
  const processLinksStart = Date.now();
  processMarbleLinksFiles(options.marbleLinks, entriesByLanguage, dictionaryType);
  console.log(
    `MARBLELinks processing completed in ${((Date.now() - processLinksStart) / 1000).toFixed(2)} seconds.`
  );

  // Next, process domain files to build taxonomies if provided
  if (options.domains && fs.existsSync(options.domains)) {
    console.log(`\nStep 3: Processing domain files to build taxonomies...`);
    const processDomainsStart = Date.now();
    processDomainFiles(options.domains, taxonomiesByLanguage, dictionaryType);
    console.log(
      `Domain processing completed in ${((Date.now() - processDomainsStart) / 1000).toFixed(2)} seconds.`
    );
  } else {
    console.log(`\nSkipping domain processing: No domain directory provided or it does not exist.`);
  }

  // Next, remove empty entries and senses
  console.log(
    `\nStep ${options.domains && fs.existsSync(options.domains) ? '4' : '3'}: Removing empty entries and senses...`
  );
  const removeStart = Date.now();
  const removalStats = removeEmptyEntriesAndSenses(entriesByLanguage);
  console.log(
    `Empty entries and senses removal completed in ${((Date.now() - removeStart) / 1000).toFixed(
      2
    )} seconds.`
  );
  console.log(`Entries removed: ${removalStats.entriesRemoved}`);
  console.log(`Senses removed: ${removalStats.sensesRemoved}`);
  console.log(`Total entries remaining: ${removalStats.totalEntries}`);
  console.log(`Total senses remaining: ${removalStats.totalSenses}`);

  // Show language-specific statistics if there are multiple languages
  if (Object.keys(removalStats.entriesByLanguage).length > 1) {
    console.log('\nRemoval statistics by language:');
    for (const language in removalStats.entriesByLanguage) {
      console.log(
        `  ${language}: ${removalStats.entriesByLanguage[language]} entries, ${removalStats.sensesByLanguage[language]} senses removed`
      );
    }

    console.log('\nRemaining senses by language:');
    for (const language in removalStats.totalSensesByLanguage) {
      console.log(
        `  ${language}: ${removalStats.totalSensesByLanguage[language]} senses remaining`
      );
    }
  }

  // Check for duplicate occurrences
  removeDuplicateOccurrences(entriesByLanguage);

  // Finally, write output files
  console.log(
    `\nStep ${options.domains && fs.existsSync(options.domains) ? '5' : '4'}: Writing output files...`
  );
  const writeStart = Date.now();

  // Create output directory if it doesn't exist
  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
  }

  // Write output files for each language
  for (const language in entriesByLanguage) {
    const outputFile = path.join(options.output, `lexicon_${language}.xml`);

    writeOutputFile(
      outputFile,
      entriesByLanguage[language],
      language,
      dictionaryType,
      options.version,
      Object.keys(taxonomiesByLanguage).length > 0 ? taxonomiesByLanguage : undefined
    );
    console.log(
      `Generated ${outputFile} with ${Object.keys(entriesByLanguage[language]).length} entries`
    );
  }

  console.log(`Output files written in ${((Date.now() - writeStart) / 1000).toFixed(2)} seconds.`);
  console.log(`\nConversion completed successfully!`);
}

// Run the main function
main();

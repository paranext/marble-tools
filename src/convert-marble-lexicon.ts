/**
 * MARBLE Lexicon Converter
 *
 * This module converts the MARBLE lexicon XML files to a new format that is more suitable
 * for consumption by applications. It processes lexicon files, takes each lexical meaning's
 * scripture references (occurrences) from its LEXReferences, and outputs the result as XML files.
 * Contextual meanings are not output: their references are also in their lexical meaning's
 * LEXReferences, and Paratext 9 does not show them either.
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
  buildSenseId,
  cleanId,
  CORPUS_ID,
  DICTIONARY_TYPE,
  ENTRY_PREFIX,
  ENTRY_VERSION,
  extractDefinitionAndGlosses,
  findConReferencesMissingFromLex,
  referenceKeys,
  occurrencesFromLexReferences,
  parseEntryVersion,
  parseXmlStrict,
  transformDomainCode,
  verifyUniqueEntryAndSenseIds,
} from './helpers';
import {
  cleanUpDefinitions,
  CrossReferenceCounts,
  DefinitionCleanupInput,
  DefinitionCleanupReport,
  LOOKUP_STEPS,
  STRUCTURE_SYMBOLS,
  UNSPACED_SYMBOLS,
} from './definition-cleanup';
import {
  buildDomainTree,
  buildLabelIndex,
  classifyDomainFile,
  domainCheckAnnotations,
  DomainRecord,
  DomainTreeNode,
  evaluateDomainCheck,
  parseHasSubDomains,
  SenseType,
  uniqueSenseDomains,
} from './domain-taxonomy';

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

/** A domain from a taxonomy file, with what is needed to output it */
interface DomainFileRecord extends DomainRecord {
  displayCode: string;
  element: Element;
}

/** What the definition clean-up needs to know about the source entries and meanings */
type DefinitionSources = Pick<
  DefinitionCleanupInput,
  'sourceEntries' | 'baseFormMeaningCountBySenseId' | 'meaningSenseIdsByEntryId'
>;

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

// LEXReferences that yield no occurrence, by reason
interface SkippedLexReferences {
  odd: number;
  /** Each reference to word 0 with the lemma it belongs to */
  wordZero: string[];
  /** References of SDBG meanings marked N or X, which are not linked to the text */
  notLinked: number;
}

/** What one pass over the lexicon files counts and collects */
interface LexiconPassStats {
  /** Number of contextual meaning references that are absent from their lexical meaning's references */
  conReferencesMissingFromLex: number;
  skippedLexReferences: SkippedLexReferences;
  /** Descriptions of LEXReferences that are invalid or name an unknown book; any fails the pass */
  invalidLexReferences: string[];
}

/**
 * Process all XML files in the input directory and generate output files by language.
 */
function processLexiconFiles(
  inputDir: string,
  entriesByLanguage: EntriesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH',
  definitionSources: DefinitionSources
): void {
  // Dictionary to hold entries by language
  const files = fs.readdirSync(inputDir).filter(filename => {
    return /^\w{4}-\d{2}\.xml$/i.test(filename);
  });

  let fileCount = 0;
  let successCount = 0;
  const stats: LexiconPassStats = {
    conReferencesMissingFromLex: 0,
    skippedLexReferences: { odd: 0, wordZero: [], notLinked: 0 },
    invalidLexReferences: [],
  };

  for (const filename of files) {
    fileCount++;
    const filePath = path.join(inputDir, filename);
    try {
      processFile(filePath, entriesByLanguage, dictionaryType, definitionSources, stats);
      successCount++;
      if (fileCount % 10 === 0) {
        console.log(`Processed ${fileCount} files...`);
      }
    } catch (e) {
      // A file that cannot be converted (for example one with a malformed ID) fails the whole
      // conversion rather than leaving its entries out of the output.
      console.error(`Error processing file ${filePath}: ${e}`);
      throw e;
    }
  }

  console.log(`Successfully processed ${successCount} out of ${fileCount} files.`);
  console.log(
    `CONReferences missing from their lexical meaning's LEXReferences: ${stats.conReferencesMissingFromLex}`
  );
  console.log('LEXReferences skipped:');
  const { skippedLexReferences } = stats;
  console.log(`  odd word IDs (apparatus readings): ${skippedLexReferences.odd}`);
  console.log(
    `  word 0 (verse-level references): ${skippedLexReferences.wordZero.length}` +
      (skippedLexReferences.wordZero.length > 0
        ? `: ${skippedLexReferences.wordZero.join(', ')}`
        : '')
  );
  console.log(
    `  of senses marked N or X (not linked to the text): ${skippedLexReferences.notLinked}`
  );

  // An invalid reference or an unknown book is a data error, not a rule, so it fails the conversion
  // after every one has been collected.
  if (stats.invalidLexReferences.length > 0) {
    throw new Error(
      `${stats.invalidLexReferences.length} LEXReference(s) are invalid or name an unknown book:\n  ` +
        stats.invalidLexReferences.join('\n  ')
    );
  }

  verifyUniqueEntryAndSenseIds(entriesByLanguage);
}

/**
 * Process a single XML file and extract entries by language.
 */
function processFile(
  filePath: string,
  entriesByLanguage: EntriesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH',
  definitionSources: DefinitionSources,
  stats: LexiconPassStats
): void {
  const xmlContent = fs.readFileSync(filePath, 'utf8');
  const doc = parseXmlStrict(xmlContent, filePath);
  const fileName = path.basename(filePath);

  // Helper function to get text content safely
  function getTextContent(element: Element | null): string {
    return element?.textContent || '';
  }

  // Helper function to get elements by tag name
  function findElements(element: Element, tagName: string): Element[] {
    const elements = element.getElementsByTagName(tagName);
    return Array.from(elements);
  }

  // Extract the domain codes and English domain text. The Source and SourceCode attributes, which
  // name the source domain of an extension of meaning (Source > Domain), are not used, so only the
  // extended-to domain is kept.
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

  // Get the text of a lexical meaning's own LEXReference elements. Only the LEXReferences element
  // that is a direct child of the LEXMeaning is read, so nothing nested in its CONMeanings (such as
  // CONReferences) is picked up.
  function getLexReferences(lexMeaning: Element): string[] {
    const lexReferences: string[] = [];
    for (let i = 0; i < lexMeaning.childNodes.length; i++) {
      const child = lexMeaning.childNodes[i];
      if (child.nodeType !== 1 || child.nodeName !== 'LEXReferences') continue;
      for (const lexReference of findElements(child as Element, 'LEXReference'))
        lexReferences.push(getTextContent(lexReference));
    }
    return lexReferences;
  }

  // Warn about each CONReference of a lexical meaning's contextual meanings that is not among the
  // lexical meaning's own LEXReferences. Contextual meanings are not output, so their references
  // reach the dictionary only through the lexical meaning's LEXReferences.
  function warnAboutConReferencesMissingFromLex(
    lexMeaning: Element,
    lexReferences: string[],
    entryId: string
  ): void {
    const lexReferenceKeys = referenceKeys(lexReferences);
    for (const conMeaning of findElements(lexMeaning, 'ContextualMeaning')) {
      const conReferences = findElements(conMeaning, 'CONReference').map(getTextContent);
      for (const missing of findConReferencesMissingFromLex(conReferences, lexReferenceKeys)) {
        stats.conReferencesMissingFromLex++;
        console.warn(
          `CONReference ${missing} of entry ${entryId}, lexical meaning ${lexMeaning.getAttribute('Id')}, contextual meaning ${conMeaning.getAttribute('Id')} is not in the lexical meaning's LEXReferences (file ${path.basename(filePath)})`
        );
      }
    }
  }

  // From Reinier: In SDBH, please ignore all lexical meanings for which the IsBiblicalTerm
  // attribute is set to X or N. They need to be in the database for specific reasons, but are not
  // linked to the text.
  function isNotLinked(lexMeaning: Element): boolean {
    return ['X', 'N'].includes((lexMeaning.getAttribute('IsBiblicalTerm') || '').toUpperCase());
  }

  // Process each lexicon entry
  const entries = doc.getElementsByTagName('Lexicon_Entry');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as Element;
    const lemma = entry.getAttribute('Lemma') || '';
    const entryId = entry.getAttribute('Id') || '';

    if (!lemma || !entryId) {
      throw new Error(`Entry ID or lemma is missing for entry ${i} in file ${fileName}`);
    }

    // SDBG is complete, so its version is not used; SDBH entries below the minimum are left out
    const entryVersion =
      dictionaryType === DICTIONARY_TYPE.GREEK
        ? undefined
        : parseEntryVersion(entry.getAttribute('Version'), entryId);

    // Every source entry can be the target of a cross-reference, including those left out below
    const isVersionExcluded =
      entryVersion !== undefined && entryVersion < ENTRY_VERSION.MIN_LEXICAL;
    const allLexMeanings = findElements(entry, 'LEXMeaning');
    const areAllMeaningsExcluded =
      dictionaryType == DICTIONARY_TYPE.HEBREW &&
      allLexMeanings.length > 0 &&
      allLexMeanings.every(isNotLinked);
    definitionSources.sourceEntries.push({
      id: entryId,
      lemma,
      alternateLemmas: findElements(entry, 'AlternateLemma').map(getTextContent),
      excludedByDesign: isVersionExcluded
        ? `version ${entryVersion} is below ${ENTRY_VERSION.MIN_LEXICAL}`
        : areAllMeaningsExcluded
          ? 'all its lexical meanings are marked N or X'
          : undefined,
    });

    // From Reinier: exclude entries with a version number below 3, with no exception for meanings
    // marked M. SDBG is 100% done so you can ignore the version number.
    if (isVersionExcluded) {
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
        throw new Error(`BaseForm ID is missing for entry ${entryId} in file ${fileName}`);
      }

      // Process each lexical meaning
      const lexMeanings = findElements(baseForm, 'LEXMeaning');
      if (bfIdx === 0) definitionSources.meaningSenseIdsByEntryId.set(entryId, []);
      // Every lexical meaning, whether or not it is output, so a letter in a definition can find
      // the meaning it names by position
      definitionSources.meaningSenseIdsByEntryId.get(entryId)?.push(
        lexMeanings.map(meaning => {
          const id = meaning.getAttribute('Id') || '';
          return id ? buildSenseId(entryId, id) : '';
        })
      );

      for (let lmIdx = 0; lmIdx < lexMeanings.length; lmIdx++) {
        const lexMeaning = lexMeanings[lmIdx];
        const lexMeaningId = lexMeaning.getAttribute('Id') || '';

        if (dictionaryType == DICTIONARY_TYPE.HEBREW && isNotLinked(lexMeaning)) continue;

        if (!lexMeaningId) {
          throw new Error(
            `LexMeaning ID is missing for entry ${entryId}, base form ${baseFormId} in file ${fileName}`
          );
        }

        // `[a]`, `[b]`, … in the definition are numbered only if the base form has enough meanings
        definitionSources.baseFormMeaningCountBySenseId.set(
          buildSenseId(entryId, lexMeaningId),
          lexMeanings.length
        );

        const lexReferences = getLexReferences(lexMeaning);
        warnAboutConReferencesMissingFromLex(lexMeaning, lexReferences, entryId);

        // The same occurrences go on this meaning's sense in every language. SDBG meanings marked N
        // or X are kept as senses, but like SDBH's they are not linked to the text, so they get no
        // occurrences.
        let occurrences: Occurrence[] = [];
        if (isNotLinked(lexMeaning)) {
          stats.skippedLexReferences.notLinked += lexReferences.length;
        } else {
          const parsed = occurrencesFromLexReferences(lexReferences);
          occurrences = parsed.occurrences.map(id => ({ id }));
          stats.skippedLexReferences.odd += parsed.odd.length;
          stats.skippedLexReferences.wordZero.push(
            ...parsed.wordZero.map(id => `${id} (${lemma})`)
          );
          const where = `entry ${entryId}, lexical meaning ${lexMeaningId}, file ${fileName}`;
          for (const invalid of parsed.invalid)
            stats.invalidLexReferences.push(`invalid LEXReference "${invalid}" in ${where}`);
          for (const unknownBook of parsed.unknownBook)
            stats.invalidLexReferences.push(
              `LEXReference ${unknownBook} has an unknown book in ${where}`
            );
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
            throw new Error(
              `Language code is missing for LEXSense in entry ${entryId}, base form ${baseFormId} in file ${fileName}`
            );
          }

          const { definition, glosses } = extractDefinitionAndGlosses(lexSense);

          // Initialize entry in the language dictionary if it doesn't exist
          if (!entriesByLanguage[languageCode]) entriesByLanguage[languageCode] = {};

          const existingEntry = entriesByLanguage[languageCode][lemma];
          if (existingEntry && existingEntry.id !== `${ENTRY_PREFIX}${entryId}`) {
            throw new Error(
              `Entries ${existingEntry.id.replace(ENTRY_PREFIX, '')} and ${entryId} have the same ` +
                `lemma "${lemma}" (language ${languageCode}, file ${fileName}); their senses ` +
                `would be merged into one entry`
            );
          }

          if (!existingEntry) {
            entriesByLanguage[languageCode][lemma] = {
              lemma,
              id: `${ENTRY_PREFIX}${entryId}`,
              senses: [],
              strongsCodes: strongsCodes.length > 0 ? strongsCodes : undefined,
            };
          }

          // Add the LexSense to the entry's senses
          entriesByLanguage[languageCode][lemma].senses.push({
            id: buildSenseId(entryId, lexMeaningId),
            definition,
            glosses,
            occurrences: [...occurrences],
            domains: combineDomains(lexDomains, lexCoreDomains),
          });
        }
      }
    }
  }
}

/**
 * Process domain XML files to build taxonomies.
 */
function processDomainFiles(
  inputDir: string,
  taxonomiesByLanguage: TaxonomiesByLanguage,
  dictionaryType: 'SDBG' | 'SDBH'
): void {
  // Look for exactly SDBG-DOMAINS1/2.XML or SDBH-DOMAINS1/2.XML. Upstream has shipped stray
  // copies (e.g. "SDBH-DOMAINS1 - Copy.XML") alongside the real files, so anything else that
  // starts with the prefix is skipped with a warning rather than processed. Non-XML sidecars
  // (e.g. SDBH-DOMAINS1.JSON) are skipped silently.
  const prefix = `${dictionaryType}-DOMAINS`;
  const files: { filename: string; senseType: SenseType }[] = [];
  for (const filename of fs.readdirSync(inputDir)) {
    // From Reinier: DOMAINS1.XML is for lexical domains and DOMAINS2.XML is for contextual domains
    const senseType = classifyDomainFile(filename, dictionaryType);
    if (senseType) files.push({ filename, senseType });
    else if (filename.toUpperCase().startsWith(prefix) && filename.toUpperCase().endsWith('.XML'))
      console.warn(`Ignoring unrecognized domain file ${filename} in ${inputDir}`);
  }

  if (files.length === 0) {
    console.warn(`No domain files found with prefix ${prefix} in ${inputDir}`);
    return;
  }

  console.log(`Found ${files.length} domain files to process`);

  for (const { filename, senseType } of files) {
    const filePath = path.join(inputDir, filename);
    try {
      processDomainFile(filePath, senseType, dictionaryType, taxonomiesByLanguage);
    } catch (e) {
      console.error(`Error processing domain file ${filePath}: ${e}`);
      throw e;
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
  senseType: SenseType,
  dictionaryType: 'SDBG' | 'SDBH',
  taxonomiesByLanguage: TaxonomiesByLanguage
): void {
  const xmlContent = fs.readFileSync(filePath, 'utf8');
  const doc = parseXmlStrict(xmlContent, filePath);

  // Get all semantic domains
  const fileName = path.basename(filePath);
  const semanticDomains = doc.getElementsByTagName('SemanticDomain');
  console.log(
    `Found ${semanticDomains.length} semantic domains in ${fileName} for ${senseType} domains`
  );

  const records: DomainFileRecord[] = [];

  // Collect the domains in source order
  for (let i = 0; i < semanticDomains.length; i++) {
    const domain = semanticDomains[i] as Element;
    const codeElement = domain.getElementsByTagName('Code')[0];

    if (!codeElement) {
      console.warn(`Semantic domain #${i} has no Code element in ${fileName}`);
      continue;
    }

    const rawCode = (codeElement.textContent || '').trim();
    const codes = transformDomainCode(rawCode);
    if (!codes || codes.length === 0) {
      console.warn(`Semantic domain #${i} has empty Code in ${fileName}`);
      continue;
    }

    if (codes.length !== 1) {
      console.warn(`Semantic domain #${i} has multiple codes (${codes.join(', ')}) in ${fileName}`);
      continue;
    }

    const levelText = domain.getElementsByTagName('Level')[0]?.textContent;
    const hasSubDomainsText = domain.getElementsByTagName('HasSubDomains')[0]?.textContent;
    records.push({
      code: rawCode,
      displayCode: codes[0],
      level: levelText?.trim() ? parseInt(levelText, 10) : undefined,
      hasSubDomains: parseHasSubDomains(hasSubDomainsText),
      element: domain,
    });
  }

  // From data inspection: <HasSubDomains> is unreliable. Several parents upstream (e.g. 001001
  // Beings) say false even though child domains exist, and following the flag dropped whole
  // subtrees (People, Animals). The codes themselves are consistent in every snapshot: each code
  // longer than 3 digits has its parent (the code minus its last 3 digits) in the same file. So
  // the hierarchy is built from the code structure, and <Level>/<HasSubDomains> are only checked.
  const { roots, warnings } = buildDomainTree(records);
  for (const warning of warnings) console.warn(`${fileName}: ${warning.message}`);

  // Identify all available languages across all domains
  const processedLanguages = new Set<string>();
  for (const { element } of records) {
    const localizationsElement = element.getElementsByTagName('SemanticDomainLocalizations')[0];

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
      subDomains: roots.map(root => toSubDomain(root, languageCode)),
    };
  }

  console.log(`Processed ${processedLanguages.size} languages for ${senseType} domain taxonomy`);

  /**
   * Convert a domain tree node (and its descendants) to the output structure for one language
   */
  function toSubDomain(node: DomainTreeNode<DomainFileRecord>, languageCode: string): SubDomain {
    return {
      code: node.record.displayCode,
      label: getLabelForLanguage(node.record.element, languageCode),
      subDomains: node.children.map(child => toSubDomain(child, languageCode)),
    };
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
 * Format a mismatch rate as a percentage. Any mismatch fails the check, so a nonzero rate never
 * rounds down to 0.00%.
 */
function formatMismatchRate(rate: number): string {
  if (rate > 0 && rate < 0.0001) return '<0.01%';
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * Check that the domain text on every sense agrees with the English taxonomy label for its code,
 * print a summary, and exit with an error if any sense domain disagrees. Sense domain text is English
 * in every language, so all languages are checked against the English labels. This guards against
 * source snapshots whose entries and taxonomy are numbered out of sync (PT-4547).
 */
function checkSenseDomainsOrExit(
  entriesByLanguage: EntriesByLanguage,
  taxonomiesByLanguage: TaxonomiesByLanguage,
  domainsRequested: boolean
): void {
  const senses = Object.values(entriesByLanguage).flatMap(entries =>
    Object.values(entries).flatMap(entry => entry.senses)
  );
  const labels = buildLabelIndex(taxonomiesByLanguage['en']);
  const result = evaluateDomainCheck(uniqueSenseDomains(senses), labels, domainsRequested);
  if (result.skipped) {
    console.log('Skipping sense domain check: no domain directory was given.');
    return;
  }
  const allStats = result.stats;

  console.log('Sense domain check (each sense counted once; sense text is English):');
  const columns = ['Taxonomy', 'Total', 'Matched', 'Mismatched', 'Missing code', 'Rate'];
  const rows = allStats.map(stats => [
    stats.taxonomy,
    String(stats.total),
    String(stats.matched),
    String(stats.mismatched),
    String(stats.missingCode),
    formatMismatchRate(stats.mismatchRate),
  ]);
  const widths = columns.map((column, i) =>
    Math.max(column.length, ...rows.map(row => row[i].length))
  );
  for (const row of [columns, ...rows])
    console.log(
      '  ' +
        row
          .map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i])))
          .join('  ')
    );

  for (const stats of allStats.filter(stats => stats.mismatchRate > 0)) {
    console.log(
      `\nMost frequent disagreements in ${stats.taxonomy} (code: sense text vs taxonomy label):`
    );
    for (const { code, value, label, count } of stats.examples)
      console.log(
        `  ${count} x ${code}: "${value}" vs ${label === undefined ? '(code not in taxonomy)' : `"${label}"`}`
      );
  }

  if (result.notLoaded.length === 0 && result.mismatched.length === 0) return;

  for (const taxonomy of result.notLoaded) {
    const count = allStats.find(stats => stats.taxonomy === taxonomy)?.total ?? 0;
    const loadedLanguages = Object.keys(taxonomiesByLanguage).filter(
      language => taxonomiesByLanguage[language][taxonomy]
    );
    const cause =
      loadedLanguages.length > 0
        ? `it was loaded for ${loadedLanguages.join(', ')} but not English, and sense domain ` +
          `text is English`
        : 'check the domain files and earlier parse errors';
    console.error(
      `\nError: taxonomy "${taxonomy}" has no English labels (${cause}), so none of its ` +
        `${count} sense domains could be checked.`
    );
  }
  if (result.mismatched.length > 0)
    console.error(
      `\nError: sense domain codes in ${result.mismatched.join(', ')} disagree with the ` +
        `taxonomy labels; the source data is probably numbered out of sync. Paratext shows the ` +
        `label that belongs to the code, so any disagreement would show users the wrong domain.`
    );
  console.error('No output files were written.');
  // GitHub Actions workflow commands, so the failure shows on the PR checks page
  for (const annotation of domainCheckAnnotations(result)) console.error(annotation);
  process.exit(1);
}

/**
 * Print what the definition clean-up did per language, then the cross-reference targets it left
 * unchanged: those whose entry the conversion rules leave out, those it could not resolve, and
 * `{L:` markers that are not cross-references at all. The Dictionary shows each of these as plain
 * text, so they are warnings, not failures.
 */
function printDefinitionCleanupReport(report: DefinitionCleanupReport): void {
  for (const [language, counts] of Object.entries(report.byLanguage)) {
    const {
      crossReferences: refs,
      glossCrossReferences: glossRefs,
      malformedCrossReferences,
      symbols,
      unspacedSymbols,
      glossLeadingEquals,
      meaningLetters: letters,
    } = counts;
    const left = (r: CrossReferenceCounts): string =>
      `other dictionary ${r.otherDictionary}, unknown dictionary ${r.unknownDictionary}, ` +
      `excluded by design ${r.excludedByDesign}, ambiguous ${r.ambiguous}, ` +
      `not output in this language ${r.notEmitted}, not found ${r.unresolved}`;
    const resolved = (r: CrossReferenceCounts): string =>
      LOOKUP_STEPS.map(step => `${step} ${r[step]}`).join(', ');
    console.log(`  ${language}:`);
    console.log(`    definition cross-reference targets resolved: ${resolved(refs)}`);
    console.log(`    definition cross-reference targets left unchanged: ${left(refs)}`);
    console.log(`    gloss cross-reference targets resolved: ${resolved(glossRefs)}`);
    console.log(`    gloss cross-reference targets left unchanged: ${left(glossRefs)}`);
    console.log(`    malformed {L: markers in definitions: ${malformedCrossReferences}`);
    console.log(
      `    structure symbols removed: ` +
        STRUCTURE_SYMBOLS.map(symbol => `"${symbol}" ${symbols[symbol]}`).join(', ')
    );
    console.log(
      `    structure symbols removed without a following space: ` +
        UNSPACED_SYMBOLS.map(symbol => `"${symbol}" ${unspacedSymbols[symbol]}`).join(', ')
    );
    console.log(`    glosses with a leading "=" removed: ${glossLeadingEquals}`);
    console.log(
      `    meaning letters: ${letters.replaced} numbered; left: base form with one meaning ` +
        `${letters.singleMeaning}, beyond the base form's meanings ${letters.outOfRange}`
    );
    console.log(
      `    meaning letters after a link: ${letters.linkedReplaced} numbered by the linked entry ` +
        `(link's meaning position: same ${letters.linkedPositionAgrees}, different ` +
        `${letters.linkedPositionDiffers}, none ${letters.linkedPositionAbsent}); left: link not ` +
        `resolved ${letters.linkedUnresolved}, no such output meaning ${letters.linkedNoMeaning}`
    );
  }

  const lists = [
    ['Cross-reference targets excluded by design', report.excludedByDesign],
    ['Unresolved cross-reference targets', report.unresolved],
  ] as const;
  for (const [title, problems] of lists) {
    if (problems.length === 0) continue;
    const total = problems.reduce((sum, problem) => sum + problem.count, 0);
    console.warn(
      `${title} (${total} in ${problems.length} places; target, language, field, entry Id):`
    );
    for (const problem of problems)
      console.warn(
        `  ${problem.dictionaryId}:${problem.target}  ${problem.language}  ${problem.field}  ` +
          `${problem.entryId.replace(ENTRY_PREFIX, '')}  x${problem.count}  (${problem.reason})`
      );
  }

  if (report.malformed.length > 0) {
    const total = report.malformed.reduce((sum, marker) => sum + marker.count, 0);
    console.warn(
      `Malformed {L: markers in definitions, left unchanged (${total} in ${report.malformed.length} places; language, entry Id, text):`
    );
    for (const marker of report.malformed)
      console.warn(
        `  ${marker.language}  ${marker.entryId.replace(ENTRY_PREFIX, '')}  x${marker.count}  ${JSON.stringify(marker.excerpt)}`
      );
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

  // An empty --domains value fails here too, rather than silently skipping domains
  if (options.domains !== undefined && !fs.existsSync(options.domains)) {
    console.error(`Error: Domains directory '${options.domains}' does not exist.`);
    process.exit(1);
  }

  console.log(`Starting lexicon conversion...`);
  console.log(`Dictionary type: ${dictionaryType}`);
  console.log(`Input directory: ${options.input}`);
  console.log(`Output directory: ${options.output}`);
  console.log(`Version: ${options.version}`);

  if (options.domains) {
    console.log(`Domains directory: ${options.domains}`);
  }

  // Create entriesByLanguage data structure
  const entriesByLanguage: EntriesByLanguage = {};

  // Create taxonomiesByLanguage data structure
  const taxonomiesByLanguage: TaxonomiesByLanguage = {};

  const definitionSources: DefinitionSources = {
    sourceEntries: [],
    baseFormMeaningCountBySenseId: new Map(),
    meaningSenseIdsByEntryId: new Map(),
  };

  // First, process the lexicon files to build the data structure
  console.log(`\nStep 1: Processing lexicon files...`);
  const processLexiconStart = Date.now();
  processLexiconFiles(options.input, entriesByLanguage, dictionaryType, definitionSources);
  console.log(
    `Lexicon processing completed in ${((Date.now() - processLexiconStart) / 1000).toFixed(2)} seconds.`
  );

  // Next, process domain files to build taxonomies if provided
  if (options.domains) {
    console.log(`\nStep 2: Processing domain files to build taxonomies...`);
    const processDomainsStart = Date.now();
    processDomainFiles(options.domains, taxonomiesByLanguage, dictionaryType);
    console.log(
      `Domain processing completed in ${((Date.now() - processDomainsStart) / 1000).toFixed(2)} seconds.`
    );
  } else {
    console.log(`\nSkipping domain processing: No domain directory provided.`);
  }

  // Next, remove empty entries and senses
  console.log(`\nStep ${options.domains ? '3' : '2'}: Removing empty entries and senses...`);
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

  // Cross-references are rewritten only to entries that will be output, so the clean-up runs after
  // the empty senses and entries are removed
  console.log(`\nStep ${options.domains ? '4' : '3'}: Cleaning up definitions...`);
  const cleanupReport = cleanUpDefinitions({
    dictionaryId: dictionaryType,
    entriesByLanguage,
    ...definitionSources,
  });
  printDefinitionCleanupReport(cleanupReport);

  // Fail before writing anything if sense domains disagree with the taxonomy labels
  console.log(`\nChecking sense domains against the English taxonomy labels...`);
  checkSenseDomainsOrExit(entriesByLanguage, taxonomiesByLanguage, options.domains !== undefined);

  // Finally, write output files
  console.log(`\nStep ${options.domains ? '5' : '4'}: Writing output files...`);
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

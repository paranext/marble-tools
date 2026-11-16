/**
 * Cleans up the definitions of the converted senses so they read as they do in Paratext 9's
 * dictionary (`ProcessMarkup` in Paratext 9's `DictionaryTab.cs`) and so their cross-references
 * open the entry they mean:
 *
 * - The structure symbols `= `, `► `, `◄ ` and `≈ ` (each followed by a space) are removed. Beyond
 *   Paratext 9, every remaining `►`, `◄` and `≈`, and an `=` that starts the definition or follows
 *   whitespace and is directly followed by a non-space, are removed too, because the source
 *   sometimes omits the space after a structure symbol.
 * - Each cross-reference target `{L:text<DICTIONARY:lemma>}` is rewritten to the exact lemma of the
 *   entry it means, because the Dictionary panel looks the target up by exact lemma.
 * - `[a]`, `[b]`, … (a meaning, by position) become `(1)`, `(2)`, …:
 *   - A letter directly after a cross-reference names a meaning of the LINKED entry, so it is
 *     numbered by that entry: the number is the position, among the linked entry's output senses in
 *     the same language, of the letter's lexical meaning (`a` is the first) of the base form the
 *     target names (the first base form when it names none). This deliberately differs from
 *     Paratext 9, which numbers every letter by the entry being displayed and so leaves the letters
 *     of a one-meaning entry as letters although they are valid for the entry they follow. A letter
 *     whose link does not resolve to an output entry, or whose meaning does not exist or is not
 *     output, is left as it is.
 *   - Any other letter is numbered as in Paratext 9: only when the base form whose definition it
 *     is has more than one meaning, and up to that number.
 *
 * Glosses are rendered by the Dictionary panel with the same markup parser, so their cross-reference
 * targets are rewritten in the same way. Their symbols and `[a]` letters are left alone: in glosses
 * `=` usually means "that is". Paratext 9 strips the structure symbols from glosses as well; this
 * converter deliberately does not. The one exception is a gloss that starts with `=` (the
 * definition marker): that `=` and the spaces after it are removed.
 */

/**
 * A cross-reference to another entry: `{L:display text<DICTIONARY:target>}`. The same pattern as the
 * Dictionary panel's, so exactly the targets the panel follows are rewritten. Cross-references with
 * no `<…>` target do not match. The definition text holds a literal `<` and `>` here; only the XML
 * files escape them.
 */
const CROSS_REFERENCE_REGEX = /\{L:([^<}]*)<([A-Za-z-]+):([^>}]*)>\}/g;

/**
 * The dictionaries other than the one being converted whose targets occur in MARBLE's text. A target
 * with any other prefix is reported as an unknown dictionary, so a misspelt prefix is not mistaken
 * for a link into another dictionary.
 */
export const KNOWN_DICTIONARY_IDS = ['SDBH', 'SDBG', 'BT-OT', 'REALIA'] as const;

/** A trailing meaning position such as `:000000` (SDBG), which is not part of the lemma */
const TARGET_POSITION_REGEX = /:\d+$/;

/** The structure symbols removed from definitions, in the order Paratext 9 removes them */
export const STRUCTURE_SYMBOLS = ['= ', '► ', '◄ ', '≈ '] as const;
export type StructureSymbol = (typeof STRUCTURE_SYMBOLS)[number];

/** An entry as a cross-reference target can name it */
export interface LemmaIndexEntry {
  id: string;
  lemma: string;
  alternateLemmas: string[];
}

/**
 * How a cross-reference target was matched to an entry, in the order the comparisons are tried:
 * exact lemma; lemma after Unicode NFD; lemma after NFD with a no-break space read as a space; an
 * alternate lemma by any of those; then lemma or alternate lemma with sheva + patah, segol or qamats
 * read as the matching hataf vowel.
 */
export const LOOKUP_STEPS = ['exact', 'nfd', 'noBreakSpace', 'alternateLemma', 'hataf'] as const;
export type LookupStep = (typeof LOOKUP_STEPS)[number];

export type LemmaLookupResult<T extends LemmaIndexEntry = LemmaIndexEntry> =
  | { kind: 'found'; entry: T; step: LookupStep }
  | { kind: 'ambiguous'; entries: T[]; step: LookupStep }
  | { kind: 'notFound' };

export type LemmaLookup<T extends LemmaIndexEntry = LemmaIndexEntry> = (
  target: string
) => LemmaLookupResult<T>;

const toNfd = (text: string): string => text.normalize('NFD');
const toNoBreakSpaceKey = (text: string): string => toNfd(text).replace(/\u00a0/g, ' ');
// Under NFD a sheva directly precedes the vowel on the same letter: both sort before dagesh and
// the other marks. Only the comparison uses this; no text is changed.
const toHatafKey = (text: string): string =>
  toNoBreakSpaceKey(text)
    .replace(/\u05b0\u05b7/g, '\u05b2')
    .replace(/\u05b0\u05b6/g, '\u05b1')
    .replace(/\u05b0\u05b8/g, '\u05b3');

type KeyFunction = (text: string) => string;
type LemmaIndex<T> = Map<string, T[]>;

function buildIndex<T extends LemmaIndexEntry>(
  entries: T[],
  spellings: (entry: T) => string[],
  key: KeyFunction
): LemmaIndex<T> {
  const index: LemmaIndex<T> = new Map();
  for (const entry of entries)
    for (const spelling of spellings(entry)) {
      const matches = index.get(key(spelling)) ?? [];
      if (!matches.includes(entry)) matches.push(entry);
      index.set(key(spelling), matches);
    }
  return index;
}

/**
 * Builds a function that finds the entry a cross-reference target means. The comparisons are tried
 * in the order of `LOOKUP_STEPS`, and the first that matches anything decides: one entry is found,
 * more than one is ambiguous.
 */
export function createLemmaLookup<T extends LemmaIndexEntry>(entries: T[]): LemmaLookup<T> {
  const lemma = (entry: T) => [entry.lemma];
  const alternates = (entry: T) => entry.alternateLemmas.filter(Boolean);
  const both = (entry: T) => [...lemma(entry), ...alternates(entry)];
  const identity: KeyFunction = text => text;

  // Each step is one or more comparisons, tried in order; the first that matches decides
  const steps: { step: LookupStep; comparisons: { index: LemmaIndex<T>; key: KeyFunction }[] }[] = [
    {
      step: 'exact',
      comparisons: [{ index: buildIndex(entries, lemma, identity), key: identity }],
    },
    { step: 'nfd', comparisons: [{ index: buildIndex(entries, lemma, toNfd), key: toNfd }] },
    // Kept although it may match nothing in the current data: the source has spelled lemmas both with
    // a space and with a no-break space, and can again
    {
      step: 'noBreakSpace',
      comparisons: [
        { index: buildIndex(entries, lemma, toNoBreakSpaceKey), key: toNoBreakSpaceKey },
      ],
    },
    {
      step: 'alternateLemma',
      comparisons: [identity, toNfd, toNoBreakSpaceKey].map(key => ({
        index: buildIndex(entries, alternates, key),
        key,
      })),
    },
    // Kept although it may match nothing in the current data: the source has spelled hataf vowels both
    // as one character and as sheva + vowel, and can again
    {
      step: 'hataf',
      comparisons: [{ index: buildIndex(entries, both, toHatafKey), key: toHatafKey }],
    },
  ];

  return target => {
    for (const { step, comparisons } of steps)
      for (const { index, key } of comparisons) {
        const matches = index.get(key(target));
        if (!matches) continue;
        return matches.length === 1
          ? { kind: 'found', entry: matches[0], step }
          : { kind: 'ambiguous', entries: matches, step };
      }
    return { kind: 'notFound' };
  };
}

/** What a cross-reference target is rewritten to: its dictionary (as spelled in the output) and lemma */
export interface RewrittenTarget {
  dictionaryId: string;
  lemma: string;
}

/**
 * Calls `rewrite` with the dictionary and lemma of each cross-reference target in `text` and puts
 * the dictionary and lemma it returns in place of the old ones, keeping everything else (link text,
 * trailing meaning position) as it was. A target for which `rewrite` returns `undefined` is left
 * unchanged.
 */
export function rewriteCrossReferenceTargets(
  text: string,
  rewrite: (dictionaryId: string, lemma: string) => RewrittenTarget | undefined
): string {
  return text.replace(
    CROSS_REFERENCE_REGEX,
    (match, linkText: string, dictionaryId: string, target: string) => {
      const position = TARGET_POSITION_REGEX.exec(target)?.[0] ?? '';
      const lemma = target.slice(0, target.length - position.length);
      const rewritten = rewrite(dictionaryId, lemma);
      return rewritten === undefined
        ? match
        : `{L:${linkText}<${rewritten.dictionaryId}:${rewritten.lemma}${position}>}`;
    }
  );
}

/** How much of a malformed marker is quoted in the report */
const MALFORMED_EXCERPT_LENGTH = 60;

/**
 * Finds each `{L:` marker that the cross-reference pattern does not match (no `<`, no closing `}`,
 * or a dictionary prefix that is not letters), so the Dictionary panel shows it as plain text.
 * Returns a short excerpt starting at each such marker. A marker inside a matched cross-reference's
 * link text is not counted.
 */
export function findMalformedCrossReferences(text: string): string[] {
  const covered: [number, number][] = Array.from(text.matchAll(CROSS_REFERENCE_REGEX), match => [
    match.index,
    match.index + match[0].length,
  ]);
  const malformed: string[] = [];
  for (let index = text.indexOf('{L:'); index !== -1; index = text.indexOf('{L:', index + 1))
    if (!covered.some(([start, end]) => index >= start && index < end))
      malformed.push(text.slice(index, index + MALFORMED_EXCERPT_LENGTH));
  return malformed;
}

/** The structure symbols as they are counted when they occur without a following space */
export const UNSPACED_SYMBOLS = ['=', '►', '◄', '≈'] as const;
export type UnspacedSymbol = (typeof UNSPACED_SYMBOLS)[number];

/** Skips cross-reference markup, or finds an `=` that starts the text or follows whitespace */
const UNSPACED_EQUALS_REGEX = /\{L:[^}]*\}|(^|\s)=(?=\S)/g;

/**
 * Removes the structure symbols from a definition:
 *
 * 1. Every symbol followed by a space (`= `, `► `, `◄ `, `≈ `), as Paratext 9 does, one symbol
 *    after the other.
 * 2. Every `►`, `◄` and `≈` that remains, whatever follows it. The source sometimes omits the space
 *    after one.
 * 3. Every `=` that starts the text or follows whitespace and is directly followed by a non-space
 *    character, for the same reason. An `=` anywhere else (inside a word, inside cross-reference
 *    markup, or with nothing after it) is kept.
 *
 * Only the symbol is removed; the text around it is left as it is. The result is trimmed. Line
 * breaks (`|`) are left alone.
 */
export function stripStructureSymbols(text: string): {
  text: string;
  /** Symbols removed with their following space */
  counts: Record<StructureSymbol, number>;
  /** Symbols removed in step 2 or 3 */
  unspaced: Record<UnspacedSymbol, number>;
} {
  const counts = { '= ': 0, '► ': 0, '◄ ': 0, '≈ ': 0 };
  const unspaced = { '=': 0, '►': 0, '◄': 0, '≈': 0 };
  let result = text;
  for (const symbol of STRUCTURE_SYMBOLS) {
    const parts = result.split(symbol);
    counts[symbol] = parts.length - 1;
    result = parts.join('');
  }
  for (const symbol of ['►', '◄', '≈'] as const) {
    const parts = result.split(symbol);
    unspaced[symbol] = parts.length - 1;
    result = parts.join('');
  }
  result = result.replace(UNSPACED_EQUALS_REGEX, (match, space: string | undefined) => {
    if (space === undefined) return match;
    unspaced['=']++;
    return space;
  });
  return { text: result.trim(), counts, unspaced };
}

/**
 * Removes a leading `=` and the spaces after it from a gloss, which sometimes starts with the
 * definition marker. Any other `=` stays: inside a gloss it usually means "that is".
 */
export function stripLeadingEquals(gloss: string): string {
  return gloss.replace(/^=\s*/, '');
}

export interface MeaningLetterCounts {
  /** Letters not after a link that were replaced by a number */
  replaced: number;
  /** Letters not after a link that were left because their base form has only one meaning */
  singleMeaning: number;
  /** Letters not after a link that were left because their base form has fewer meanings than the letter's position */
  outOfRange: number;
  /** Letters after a link that were numbered by the linked entry */
  linkedReplaced: number;
  /** Letters after a link that were left because the link does not resolve to an output entry */
  linkedUnresolved: number;
  /** Letters after a link that were left because the linked entry has no such output meaning */
  linkedNoMeaning: number;
  /** Numbered letters whose link names a meaning position (`:BBBMMM`) with the same meaning */
  linkedPositionAgrees: number;
  /** Numbered letters whose link names a meaning position with a different meaning */
  linkedPositionDiffers: number;
  /** Numbered letters whose link names no meaning position */
  linkedPositionAbsent: number;
}

/** A cross-reference target as written in the text: dictionary, lemma and optional `:BBBMMM` */
export interface LinkTarget {
  dictionaryId: string;
  lemma: string;
  /** The trailing digits of `:BBBMMM`, without the colon; empty when the target has none */
  position: string;
}

/**
 * Finds the number the Dictionary panel shows for a meaning of the entry a link targets, or
 * `undefined` when the link does not resolve to an output entry (`'unresolved'`) or the entry has
 * no such output meaning (`'noMeaning'`).
 *
 * @param meaningIndex The zero-based position of the meaning within its base form
 */
export type LinkedMeaningNumber = (
  target: LinkTarget,
  meaningIndex: number
) => number | 'unresolved' | 'noMeaning';

/** A cross-reference directly followed by a meaning letter, or a meaning letter on its own */
const LETTER_AFTER_LINK_REGEX = /\{L:[^<}]*<([A-Za-z-]+):([^>}]*)>\}\[([a-z])\]|\[([a-z])\]/g;

/**
 * Replaces `[a]`, `[b]`, … with `(1)`, `(2)`, … (the letter's position in the alphabet unless the
 * letter follows a link; see the module comment).
 *
 * A letter directly after a cross-reference is numbered by `linkedMeaningNumber`; it is left as it
 * is when that returns no number, or when none is given.
 *
 * Any other letter is numbered exactly as Paratext 9 does: only when the base form whose
 * definition it is has more than one lexical meaning (counting meanings that are not output), and
 * the letter's position is within that count.
 *
 * @param baseFormMeaningCount The number of lexical meanings of the base form whose definition
 *   `text` is, including meanings that are not output
 */
export function replaceMeaningLetters(
  text: string,
  baseFormMeaningCount: number,
  linkedMeaningNumber?: LinkedMeaningNumber
): MeaningLetterCounts & { text: string } {
  const counts: MeaningLetterCounts = {
    replaced: 0,
    singleMeaning: 0,
    outOfRange: 0,
    linkedReplaced: 0,
    linkedUnresolved: 0,
    linkedNoMeaning: 0,
    linkedPositionAgrees: 0,
    linkedPositionDiffers: 0,
    linkedPositionAbsent: 0,
  };
  const alphabetPosition = (letter: string) => letter.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
  const result = text.replace(
    LETTER_AFTER_LINK_REGEX,
    (
      match,
      dictionaryId: string | undefined,
      rawTarget: string | undefined,
      linkLetter: string | undefined,
      bareLetter: string | undefined
    ) => {
      if (linkLetter !== undefined && dictionaryId !== undefined && rawTarget !== undefined) {
        const position = TARGET_POSITION_REGEX.exec(rawTarget)?.[0] ?? '';
        const target: LinkTarget = {
          dictionaryId,
          lemma: rawTarget.slice(0, rawTarget.length - position.length),
          position: position.slice(1),
        };
        const meaningIndex = alphabetPosition(linkLetter) - 1;
        const number = linkedMeaningNumber?.(target, meaningIndex) ?? 'unresolved';
        if (number === 'unresolved') {
          counts.linkedUnresolved++;
          return match;
        }
        if (number === 'noMeaning') {
          counts.linkedNoMeaning++;
          return match;
        }
        counts.linkedReplaced++;
        if (target.position.length < 3) counts.linkedPositionAbsent++;
        else if (Number(target.position.slice(-3)) === meaningIndex) counts.linkedPositionAgrees++;
        else counts.linkedPositionDiffers++;
        return `${match.slice(0, match.length - 3)}(${number})`;
      }
      const position = alphabetPosition(bareLetter ?? '');
      if (baseFormMeaningCount <= 1) {
        counts.singleMeaning++;
        return match;
      }
      if (position > baseFormMeaningCount) {
        counts.outOfRange++;
        return match;
      }
      counts.replaced++;
      return `(${position})`;
    }
  );
  return { text: result, ...counts };
}

/** An entry in the source dictionary, which may not be output */
export interface SourceEntry extends LemmaIndexEntry {
  /** Why the conversion rules leave this entry out, if they do */
  excludedByDesign?: string;
}

export interface DefinitionCleanupInput {
  /** The dictionary being converted, e.g. `SDBH` */
  dictionaryId: string;
  /** The entries that will be output, by language and lemma; their definitions are updated */
  entriesByLanguage: {
    [language: string]: {
      [lemma: string]: {
        id: string;
        senses: { id: string; definition: string; glosses?: string[] }[];
      };
    };
  };
  /** Every entry of the source dictionary, including those that are not output */
  sourceEntries: SourceEntry[];
  /**
   * For each sense ID, the number of lexical meanings of its base form, including meanings that are
   * not output
   */
  baseFormMeaningCountBySenseId: Map<string, number>;
  /**
   * For each source entry ID, the sense ID of every lexical meaning, by base form and then by
   * position in the base form, including meanings that are not output
   */
  meaningSenseIdsByEntryId: Map<string, string[][]>;
}

/** A cross-reference target that is left unchanged, counted per language and containing entry */
export interface CrossReferenceProblem {
  language: string;
  /** Where the cross-reference is */
  field: 'definition' | 'gloss';
  /** The entry whose definition holds the cross-reference */
  entryId: string;
  dictionaryId: string;
  target: string;
  count: number;
  reason: string;
}

/** A `{L:` marker that is not a cross-reference at all, counted per language and entry */
export interface MalformedCrossReference {
  language: string;
  entryId: string;
  /** The text from the marker on */
  excerpt: string;
  count: number;
}

export type CrossReferenceCounts = Record<LookupStep, number> & {
  /** Targets in another known dictionary, which are left unchanged */
  otherDictionary: number;
  /** Targets whose dictionary is not a known one, which are left unchanged */
  unknownDictionary: number;
  ambiguous: number;
  /** Targets whose entry exists but is not output in this language */
  notEmitted: number;
  /** Targets whose entry the conversion rules leave out */
  excludedByDesign: number;
  /** Targets that match no entry */
  unresolved: number;
};

export interface LanguageCleanupCounts {
  /** Cross-reference targets in definitions */
  crossReferences: CrossReferenceCounts;
  /** Cross-reference targets in glosses */
  glossCrossReferences: CrossReferenceCounts;
  /** `{L:` markers in definitions that are not cross-references */
  malformedCrossReferences: number;
  /** Structure symbols removed with their following space */
  symbols: Record<StructureSymbol, number>;
  /** Structure symbols removed without one, or (`=`) with a non-space directly after them */
  unspacedSymbols: Record<UnspacedSymbol, number>;
  /** Glosses that started with `=` */
  glossLeadingEquals: number;
  meaningLetters: MeaningLetterCounts;
}

export interface DefinitionCleanupReport {
  byLanguage: Record<string, LanguageCleanupCounts>;
  /** Targets that do not resolve to an output entry: ambiguous, not output, or not found */
  unresolved: CrossReferenceProblem[];
  /** Targets whose entry exists but the conversion rules leave out */
  excludedByDesign: CrossReferenceProblem[];
  /** `{L:` markers in definitions that are not cross-references; the text is left unchanged */
  malformed: MalformedCrossReference[];
}

function emptyCrossReferenceCounts(): CrossReferenceCounts {
  return {
    exact: 0,
    nfd: 0,
    noBreakSpace: 0,
    alternateLemma: 0,
    hataf: 0,
    otherDictionary: 0,
    unknownDictionary: 0,
    ambiguous: 0,
    notEmitted: 0,
    excludedByDesign: 0,
    unresolved: 0,
  };
}

function emptyCounts(): LanguageCleanupCounts {
  return {
    crossReferences: emptyCrossReferenceCounts(),
    glossCrossReferences: emptyCrossReferenceCounts(),
    malformedCrossReferences: 0,
    symbols: { '= ': 0, '► ': 0, '◄ ': 0, '≈ ': 0 },
    unspacedSymbols: { '=': 0, '►': 0, '◄': 0, '≈': 0 },
    glossLeadingEquals: 0,
    meaningLetters: {
      replaced: 0,
      singleMeaning: 0,
      outOfRange: 0,
      linkedReplaced: 0,
      linkedUnresolved: 0,
      linkedNoMeaning: 0,
      linkedPositionAgrees: 0,
      linkedPositionDiffers: 0,
      linkedPositionAbsent: 0,
    },
  };
}

/**
 * Cleans up every output sense, in place: strips the structure symbols from definitions, rewrites
 * cross-reference targets in definitions and glosses to the exact lemma of an output entry, and
 * numbers meaning letters in definitions. A target whose dictionary is the one being converted
 * (compared without regard to case, as MARBLE has `sdbh` and `sdbg`) is written with the canonical
 * dictionary ID. Run
 * it once the entries that will be output are final, since a target is rewritten only if its entry
 * is output. Targets are matched against every source entry, so a target that means an entry that
 * is not output is reported rather than matched to a different entry.
 */
export function cleanUpDefinitions(input: DefinitionCleanupInput): DefinitionCleanupReport {
  const {
    dictionaryId,
    entriesByLanguage,
    sourceEntries,
    baseFormMeaningCountBySenseId,
    meaningSenseIdsByEntryId,
  } = input;
  const lookup = createLemmaLookup(sourceEntries);
  const byLanguage: Record<string, LanguageCleanupCounts> = {};
  const unresolved = new Map<string, CrossReferenceProblem>();
  const excludedByDesign = new Map<string, CrossReferenceProblem>();
  const malformed = new Map<string, MalformedCrossReference>();

  const addProblem = (
    list: Map<string, CrossReferenceProblem>,
    problem: Omit<CrossReferenceProblem, 'count'>
  ) => {
    const key = [
      problem.language,
      problem.entryId,
      problem.field,
      problem.dictionaryId,
      problem.target,
    ].join('\t');
    const existing = list.get(key);
    if (existing) existing.count++;
    else list.set(key, { ...problem, count: 1 });
  };

  for (const language in entriesByLanguage) {
    const counts = emptyCounts();
    byLanguage[language] = counts;
    const entries = entriesByLanguage[language];

    for (const lemma in entries) {
      const entry = entries[lemma];

      // Rewrites a target to the exact lemma of the output entry it means; undefined leaves it
      const makeResolver =
        (field: CrossReferenceProblem['field'], refs: CrossReferenceCounts) =>
        (targetDictionary: string, target: string): RewrittenTarget | undefined => {
          const problem = {
            language,
            field,
            entryId: entry.id,
            dictionaryId: targetDictionary,
            target,
          };
          const isCurrentDictionary = targetDictionary.toUpperCase() === dictionaryId.toUpperCase();
          if (!isCurrentDictionary) {
            if ((KNOWN_DICTIONARY_IDS as readonly string[]).includes(targetDictionary)) {
              refs.otherDictionary++;
            } else {
              refs.unknownDictionary++;
              addProblem(unresolved, { ...problem, reason: 'unknown dictionary' });
            }
            return undefined;
          }
          const result = lookup(target);
          if (result.kind === 'notFound') {
            refs.unresolved++;
            addProblem(unresolved, { ...problem, reason: 'not found' });
            return undefined;
          }
          if (result.kind === 'ambiguous') {
            refs.ambiguous++;
            const ids = result.entries.map(candidate => candidate.id).join(', ');
            addProblem(unresolved, {
              ...problem,
              reason: `ambiguous (${result.step}): entries ${ids}`,
            });
            return undefined;
          }
          const found = result.entry;
          if (entries[found.lemma]) {
            refs[result.step]++;
            return { dictionaryId, lemma: found.lemma };
          }
          if (found.excludedByDesign) {
            refs.excludedByDesign++;
            addProblem(excludedByDesign, {
              ...problem,
              reason: `entry ${found.id}: ${found.excludedByDesign}`,
            });
          } else {
            refs.notEmitted++;
            addProblem(unresolved, {
              ...problem,
              reason: `entry ${found.id} is not output in this language`,
            });
          }
          return undefined;
        };
      const resolveInDefinition = makeResolver('definition', counts.crossReferences);
      const resolveInGloss = makeResolver('gloss', counts.glossCrossReferences);

      // The number of a meaning of the entry a link names, as the Dictionary panel shows it
      const linkedMeaningNumber: LinkedMeaningNumber = (target, meaningIndex) => {
        if (target.dictionaryId.toUpperCase() !== dictionaryId.toUpperCase()) return 'unresolved';
        const found = lookup(target.lemma);
        if (found.kind !== 'found') return 'unresolved';
        const linkedEntry = entries[found.entry.lemma];
        if (!linkedEntry) return 'unresolved';
        const baseForms = meaningSenseIdsByEntryId.get(found.entry.id) ?? [];
        const baseFormIndex = target.position.length >= 3 ? Number(target.position.slice(0, 3)) : 0;
        const senseId = baseForms[baseFormIndex]?.[meaningIndex];
        const number =
          senseId === undefined ? -1 : linkedEntry.senses.findIndex(s => s.id === senseId);
        return number === -1 ? 'noMeaning' : number + 1;
      };

      for (const sense of entry.senses) {
        for (const excerpt of findMalformedCrossReferences(sense.definition)) {
          counts.malformedCrossReferences++;
          const key = [language, entry.id, excerpt].join('\t');
          const existing = malformed.get(key);
          if (existing) existing.count++;
          else malformed.set(key, { language, entryId: entry.id, excerpt, count: 1 });
        }

        const stripped = stripStructureSymbols(sense.definition);
        for (const symbol of STRUCTURE_SYMBOLS) counts.symbols[symbol] += stripped.counts[symbol];
        for (const symbol of UNSPACED_SYMBOLS)
          counts.unspacedSymbols[symbol] += stripped.unspaced[symbol];

        // Letters are numbered before the targets are rewritten, while the link still reads as written
        const lettered = replaceMeaningLetters(
          stripped.text,
          baseFormMeaningCountBySenseId.get(sense.id) ?? 0,
          linkedMeaningNumber
        );
        for (const key of Object.keys(counts.meaningLetters) as (keyof MeaningLetterCounts)[])
          counts.meaningLetters[key] += lettered[key];

        sense.definition = rewriteCrossReferenceTargets(lettered.text, resolveInDefinition);
        if (sense.glosses)
          sense.glosses = sense.glosses.map(gloss => {
            const withoutEquals = stripLeadingEquals(gloss);
            if (withoutEquals !== gloss) counts.glossLeadingEquals++;
            return rewriteCrossReferenceTargets(withoutEquals, resolveInGloss);
          });
      }
    }
  }

  return {
    byLanguage,
    unresolved: Array.from(unresolved.values()),
    excludedByDesign: Array.from(excludedByDesign.values()),
    malformed: Array.from(malformed.values()),
  };
}

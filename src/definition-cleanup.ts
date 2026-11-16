/**
 * Cleans up the definitions of the converted senses so they read as they do in Paratext 9's
 * dictionary (`ProcessMarkup` in Paratext 9's `DictionaryTab.cs`) and so their cross-references
 * open the entry they mean:
 *
 * - The structure symbols `= `, `► `, `◄ ` and `≈ ` (each followed by a space) are removed.
 * - Each cross-reference target `{L:text<DICTIONARY:lemma>}` is rewritten to the exact lemma of the
 *   entry it means, because the Dictionary panel looks the target up by exact lemma.
 * - `[a]`, `[b]`, … (a meaning, by position) become `(1)`, `(2)`, … as in Paratext 9.
 *
 * Glosses are not changed: in glosses `=` usually means "that is".
 */

/**
 * A cross-reference to another entry: `{L:display text<DICTIONARY:target>}`. The same pattern as the
 * Dictionary panel's, so exactly the targets the panel follows are rewritten. Cross-references with
 * no `<…>` target do not match. The definition text holds a literal `<` and `>` here; only the XML
 * files escape them.
 */
const CROSS_REFERENCE_REGEX = /\{L:([^<}]*)<([A-Za-z-]+):([^>}]*)>\}/g;

/** A trailing meaning position such as `:000000` (SDBG), which is not part of the lemma */
const TARGET_POSITION_REGEX = /:\d+$/;

/** A meaning by its position: `[a]` is the first */
const MEANING_LETTER_REGEX = /\[([a-z])\]/g;

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

/**
 * Calls `rewrite` with the dictionary and lemma of each cross-reference target in `text` and puts
 * the lemma it returns in place of the old one, keeping everything else (link text, dictionary,
 * trailing meaning position) as it was. A target for which `rewrite` returns `undefined` is left
 * unchanged.
 */
export function rewriteCrossReferenceTargets(
  text: string,
  rewrite: (dictionaryId: string, lemma: string) => string | undefined
): string {
  return text.replace(
    CROSS_REFERENCE_REGEX,
    (match, linkText: string, dictionaryId: string, target: string) => {
      const position = TARGET_POSITION_REGEX.exec(target)?.[0] ?? '';
      const lemma = target.slice(0, target.length - position.length);
      const newLemma = rewrite(dictionaryId, lemma);
      return newLemma === undefined
        ? match
        : `{L:${linkText}<${dictionaryId}:${newLemma}${position}>}`;
    }
  );
}

/**
 * Removes every structure symbol followed by a space (`= `, `► `, `◄ `, `≈ `) as Paratext 9 does,
 * one symbol after the other, and trims the result. Line breaks (`|`) are left alone.
 */
export function stripStructureSymbols(text: string): {
  text: string;
  counts: Record<StructureSymbol, number>;
} {
  const counts = { '= ': 0, '► ': 0, '◄ ': 0, '≈ ': 0 };
  let result = text;
  for (const symbol of STRUCTURE_SYMBOLS) {
    const parts = result.split(symbol);
    counts[symbol] = parts.length - 1;
    result = parts.join('');
  }
  return { text: result.trim(), counts };
}

export interface MeaningLetterCounts {
  /** Letters replaced by a number */
  replaced: number;
  /** Letters left because their base form has only one meaning */
  singleMeaning: number;
  /** Letters left because their base form has fewer meanings than the letter's position */
  outOfRange: number;
}

/**
 * Replaces `[a]`, `[b]`, … with `(1)`, `(2)`, … (the letter's position in the alphabet) exactly as
 * Paratext 9 does: only when the base form whose definition it is has more than one lexical meaning
 * (counting meanings that are not output), and the letter's position is within that count.
 *
 * In the MARBLE data the letter nearly always follows a cross-reference, or the name of another
 * entry, and names a meaning of that entry, the same one as the cross-reference's `:BBBMMM`
 * position. The number is that meaning's position in its base form, which is also its number in
 * the Dictionary panel when the entry has one base form and all its meanings are shown.
 *
 * @param baseFormMeaningCount The number of lexical meanings of the base form whose definition
 *   `text` is, including meanings that are not output
 */
export function replaceMeaningLetters(
  text: string,
  baseFormMeaningCount: number
): MeaningLetterCounts & { text: string } {
  const counts: MeaningLetterCounts = { replaced: 0, singleMeaning: 0, outOfRange: 0 };
  const result = text.replace(MEANING_LETTER_REGEX, (match, letter: string) => {
    const position = letter.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
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
  });
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
      [lemma: string]: { id: string; senses: { id: string; definition: string }[] };
    };
  };
  /** Every entry of the source dictionary, including those that are not output */
  sourceEntries: SourceEntry[];
  /**
   * For each sense ID, the number of lexical meanings of its base form, including meanings that are
   * not output
   */
  baseFormMeaningCountBySenseId: Map<string, number>;
}

/** A cross-reference target that is left unchanged, counted per language and containing entry */
export interface CrossReferenceProblem {
  language: string;
  /** The entry whose definition holds the cross-reference */
  entryId: string;
  dictionaryId: string;
  target: string;
  count: number;
  reason: string;
}

export interface LanguageCleanupCounts {
  crossReferences: Record<LookupStep, number> & {
    /** Targets in another dictionary, which are left unchanged */
    otherDictionary: number;
    ambiguous: number;
    /** Targets whose entry exists but is not output in this language */
    notEmitted: number;
    /** Targets whose entry the conversion rules leave out */
    excludedByDesign: number;
    /** Targets that match no entry */
    unresolved: number;
  };
  symbols: Record<StructureSymbol, number>;
  meaningLetters: MeaningLetterCounts;
}

export interface DefinitionCleanupReport {
  byLanguage: Record<string, LanguageCleanupCounts>;
  /** Targets that do not resolve to an output entry: ambiguous, not output, or not found */
  unresolved: CrossReferenceProblem[];
  /** Targets whose entry exists but the conversion rules leave out */
  excludedByDesign: CrossReferenceProblem[];
}

function emptyCounts(): LanguageCleanupCounts {
  return {
    crossReferences: {
      exact: 0,
      nfd: 0,
      noBreakSpace: 0,
      alternateLemma: 0,
      hataf: 0,
      otherDictionary: 0,
      ambiguous: 0,
      notEmitted: 0,
      excludedByDesign: 0,
      unresolved: 0,
    },
    symbols: { '= ': 0, '► ': 0, '◄ ': 0, '≈ ': 0 },
    meaningLetters: { replaced: 0, singleMeaning: 0, outOfRange: 0 },
  };
}

/**
 * Cleans up the definition of every output sense, in place: strips the structure symbols, rewrites
 * cross-reference targets to the exact lemma of an output entry, and numbers meaning letters. Run
 * it once the entries that will be output are final, since a target is rewritten only if its entry
 * is output. Targets are matched against every source entry, so a target that means an entry that
 * is not output is reported rather than matched to a different entry.
 */
export function cleanUpDefinitions(input: DefinitionCleanupInput): DefinitionCleanupReport {
  const { dictionaryId, entriesByLanguage, sourceEntries, baseFormMeaningCountBySenseId } = input;
  const lookup = createLemmaLookup(sourceEntries);
  const byLanguage: Record<string, LanguageCleanupCounts> = {};
  const unresolved = new Map<string, CrossReferenceProblem>();
  const excludedByDesign = new Map<string, CrossReferenceProblem>();

  const addProblem = (
    list: Map<string, CrossReferenceProblem>,
    problem: Omit<CrossReferenceProblem, 'count'>
  ) => {
    const key = [problem.language, problem.entryId, problem.dictionaryId, problem.target].join(
      '\t'
    );
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

      // The exact lemma of the output entry a target means, or undefined to leave it unchanged
      const resolve = (targetDictionary: string, target: string): string | undefined => {
        const problem = { language, entryId: entry.id, dictionaryId: targetDictionary, target };
        if (targetDictionary !== dictionaryId) {
          counts.crossReferences.otherDictionary++;
          return undefined;
        }
        const result = lookup(target);
        if (result.kind === 'notFound') {
          counts.crossReferences.unresolved++;
          addProblem(unresolved, { ...problem, reason: 'not found' });
          return undefined;
        }
        if (result.kind === 'ambiguous') {
          counts.crossReferences.ambiguous++;
          const ids = result.entries.map(candidate => candidate.id).join(', ');
          addProblem(unresolved, {
            ...problem,
            reason: `ambiguous (${result.step}): entries ${ids}`,
          });
          return undefined;
        }
        const found = result.entry;
        if (entries[found.lemma]) {
          counts.crossReferences[result.step]++;
          return found.lemma;
        }
        if (found.excludedByDesign) {
          counts.crossReferences.excludedByDesign++;
          addProblem(excludedByDesign, {
            ...problem,
            reason: `entry ${found.id}: ${found.excludedByDesign}`,
          });
        } else {
          counts.crossReferences.notEmitted++;
          addProblem(unresolved, {
            ...problem,
            reason: `entry ${found.id} is not output in this language`,
          });
        }
        return undefined;
      };

      for (const sense of entry.senses) {
        const stripped = stripStructureSymbols(sense.definition);
        for (const symbol of STRUCTURE_SYMBOLS) counts.symbols[symbol] += stripped.counts[symbol];

        const lettered = replaceMeaningLetters(
          rewriteCrossReferenceTargets(stripped.text, resolve),
          baseFormMeaningCountBySenseId.get(sense.id) ?? 0
        );
        counts.meaningLetters.replaced += lettered.replaced;
        counts.meaningLetters.singleMeaning += lettered.singleMeaning;
        counts.meaningLetters.outOfRange += lettered.outOfRange;

        sense.definition = lettered.text;
      }
    }
  }

  return {
    byLanguage,
    unresolved: Array.from(unresolved.values()),
    excludedByDesign: Array.from(excludedByDesign.values()),
  };
}

/**
 * Cleans up the definitions of the converted senses so they read as they do in Paratext 9's
 * dictionary (`ProcessMarkup` in Paratext 9's `DictionaryTab.cs`) and so their cross-references
 * open the entry they mean. README.md "Changes to definitions" describes each change and where it
 * deliberately differs from Paratext 9; the functions' comments are the precise rules.
 *
 * - Structure symbols are removed from definitions (`stripStructureSymbols`), and a gloss's leading
 *   `=` (`stripLeadingEquals`).
 * - Cross-reference targets in definitions and glosses are rewritten to the exact lemma of the entry
 *   they mean (`createLemmaLookup`, `rewriteCrossReferenceTargets`).
 * - Meaning letters `[a]`, `[b]`, … in definitions become sense numbers (`replaceMeaningLetters`).
 * - Over-long `{S:...}` references in definitions and glosses become whole-verse references
 *   (`rewriteOverlongBibleReferences`).
 */

import { bookMap, ENTRY_PREFIX } from './helpers';

/**
 * A cross-reference to another entry: `{L:display text<DICTIONARY:target>}`. The same pattern as the
 * Dictionary panel's, so exactly the targets the panel follows are rewritten. Cross-references with
 * no `<…>` target do not match. The definition text holds a literal `<` and `>` here; only the XML
 * files escape them.
 */
const CROSS_REFERENCE_REGEX = /\{L:([^<}]*)<([A-Za-z-]+):([^>}]*)>\}/g;

/**
 * The dictionaries whose targets occur in MARBLE's text. A target
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

/**
 * Skips cross-reference markup, or finds an `=` that starts the text or follows whitespace, or a
 * full-width `＝` that starts the text or follows whitespace, `：` or `；`
 */
const UNSPACED_EQUALS_REGEX = /\{L:[^}]*\}|(^|\s)=(?=\S)|(^|\s|[：；])＝/g;

/** A run of structure symbols that are each followed by a space */
const SPACED_SYMBOLS_REGEX = /(?:[=►◄≈] )+/g;

/** A run of the arrow and approximation symbols */
const ARROW_SYMBOLS_REGEX = /[►◄≈]+/g;

/** Scripts written without spaces between words, and the full-width and CJK punctuation */
const NO_SPACE_SCRIPT_REGEX =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303F\uFF00-\uFFEF]/u;

/** A character after which a removed symbol leaves no space: an opening bracket or curly quote */
const OPENER_REGEX = /[({[“‘«]/;

/** A straight quote, which opens a quotation only where a word could start */
const STRAIGHT_QUOTE_REGEX = /["']/;

/**
 * The start of a word: a letter, digit, opening bracket or curly quote, opening format markup, or a
 * straight quote directly followed by a letter, digit, `{X:` marker or opening format markup
 */
const WORD_START_REGEX =
  /^(?:[\p{L}\p{M}\p{N}({[“‘«]|\|[iub](?!\*)|["'](?:[\p{L}\p{M}\p{N}]|\{[A-Z]:|\|[iub](?!\*)))/u;

/** Text ending in markup that opens: a `{X:` marker, or format markup such as `|i` */
const OPENING_MARKUP_END_REGEX = /(?:\{[A-Z]:|\|[iub])$/;

/**
 * Whether the text ends in an opening bracket or quote. A straight quote opens only at the start of
 * the text or after whitespace or another opener; elsewhere it closes a quotation or is an
 * apostrophe, and the next word must stay apart from it.
 */
function endsInOpener(text: string): boolean {
  const last = text.at(-1);
  if (last === undefined) return false;
  if (OPENER_REGEX.test(last)) return true;
  if (!STRAIGHT_QUOTE_REGEX.test(last)) return false;
  const beforeQuote = text.slice(0, -1);
  return beforeQuote === '' || /\s$/.test(beforeQuote) || endsInOpener(beforeQuote);
}

/**
 * What replaces a removed run of structure symbols: a space when it stands between a word (or
 * punctuation such as `;`, or the end of italic, underline or bold markup) and the next word (or
 * the start of such markup), so the two are not joined, and nothing otherwise: at either end, next
 * to whitespace, after another structure symbol, a format character or an opening bracket or quote,
 * before closing punctuation, right after a markup opener such as `{L:` or `|i`, or in scripts
 * written without spaces.
 */
function arrowReplacement(before: string, after: string): string {
  const previous = before.at(-1);
  const next = after.at(0);
  if (previous === undefined || next === undefined) return '';
  // A structure symbol before the run is removed by a later step, which then decides the space;
  // a format character such as a direction mark does not end a word
  if (
    /[\s=►◄≈\p{Cf}]/u.test(previous) ||
    endsInOpener(before) ||
    OPENING_MARKUP_END_REGEX.test(before)
  )
    return '';
  if (!WORD_START_REGEX.test(after)) return '';
  // An apostrophe between two letters belongs to the word before it, as in "priest's"
  if (/^'[\p{L}\p{M}\p{N}]/u.test(after) && /[\p{L}\p{M}\p{N}]/u.test(previous)) return '';
  if (NO_SPACE_SCRIPT_REGEX.test(previous) || NO_SPACE_SCRIPT_REGEX.test(next)) return '';
  return ' ';
}

/** Structure-symbol counts that are all zero */
function emptySymbolCounts(): Record<StructureSymbol, number> {
  return Object.fromEntries(STRUCTURE_SYMBOLS.map(symbol => [symbol, 0])) as Record<
    StructureSymbol,
    number
  >;
}

/** Unspaced-symbol counts that are all zero */
function emptyUnspacedSymbolCounts(): Record<UnspacedSymbol, number> {
  return Object.fromEntries(UNSPACED_SYMBOLS.map(symbol => [symbol, 0])) as Record<
    UnspacedSymbol,
    number
  >;
}

/**
 * Removes the structure symbols from a definition:
 *
 * 1. Every symbol followed by a space (`= `, `► `, `◄ `, `≈ `), as Paratext 9 does. Where a run of
 *    them stood between two words with no other space, it is replaced by a space, so the words are
 *    not joined (see `arrowReplacement`).
 * 2. Every `►`, `◄` and `≈` that remains, whatever follows it. The source sometimes omits the space
 *    after one. Where the symbol stood between two words it is replaced by a space, as in step 1.
 * 3. Every `=` that starts the text or follows whitespace and is directly followed by a non-space
 *    character, for the same reason. An `=` anywhere else (inside a word, inside cross-reference
 *    markup, or with nothing after it) is kept. A full-width `＝` is removed where it starts the text
 *    or follows whitespace, `：` or `；`, and is counted with the `=`.
 *
 * Otherwise only the symbols are removed; the text around them is left as it is. The result is
 * trimmed.
 * Line breaks (`|`) are left alone.
 */
export function stripStructureSymbols(text: string): {
  text: string;
  /** Symbols removed with their following space */
  counts: Record<StructureSymbol, number>;
  /** Symbols removed in step 2 or 3 */
  unspaced: Record<UnspacedSymbol, number>;
} {
  const counts = emptySymbolCounts();
  const unspaced = emptyUnspacedSymbolCounts();
  let result = text.replace(SPACED_SYMBOLS_REGEX, (run: string, offset: number, whole: string) => {
    for (let i = 0; i < run.length; i += 2) counts[run.slice(i, i + 2) as StructureSymbol]++;
    return arrowReplacement(whole.slice(0, offset), whole.slice(offset + run.length));
  });
  result = result.replace(ARROW_SYMBOLS_REGEX, (run: string, offset: number, whole: string) => {
    for (const symbol of run) unspaced[symbol as '►' | '◄' | '≈']++;
    return arrowReplacement(whole.slice(0, offset), whole.slice(offset + run.length));
  });
  result = result.replace(
    UNSPACED_EQUALS_REGEX,
    (match, space: string | undefined, fullWidthPrefix: string | undefined) => {
      const kept = space ?? fullWidthPrefix;
      if (kept === undefined) return match;
      unspaced['=']++;
      return kept;
    }
  );
  return { text: result.trim(), counts, unspaced };
}

/**
 * Removes a leading `=` (or full-width `＝`) and the spaces after it from a gloss, which sometimes
 * starts with the definition marker. Any other `=` stays: inside a gloss it usually means "that is".
 */
export function stripLeadingEquals(gloss: string): string {
  return gloss.replace(/^[=＝]\s*/, '');
}

/** A `{S:...}` Bible reference marker, with its content */
const BIBLE_REFERENCE_MARKER_REGEX = /\{S:([^}]*)\}/g;

/** A digit run too long to be one `BBBCCCVVVWWWWW` reference */
const OVERLONG_RUN_REGEX = /\d{15,}/g;

/** The word position that means "the whole verse" */
const WORD_POSITION_NONE = '00000';

/** An over-long digit run in a `{S:...}` marker and what it was rewritten to */
export interface RewrittenBibleReference {
  original: string;
  rewritten: string;
}

/**
 * Rewrites each digit run longer than 14 digits inside a `{S:...}` marker to a whole-verse
 * reference: the first 9 digits (book, chapter, verse) followed by `00000`, so the verse is kept
 * and the word position, which the long run does not hold sensibly, is dropped. A run whose first 9
 * digits are not a valid book (one the converter knows), chapter (1 or more) and verse (1 or more)
 * is left unchanged and returned in `unresolved`. Everything else in the marker, and all other text,
 * is kept.
 */
export function rewriteOverlongBibleReferences(text: string): {
  text: string;
  rewritten: RewrittenBibleReference[];
  unresolved: string[];
} {
  const rewritten: RewrittenBibleReference[] = [];
  const unresolved: string[] = [];
  const result = text.replace(BIBLE_REFERENCE_MARKER_REGEX, marker =>
    marker.replace(OVERLONG_RUN_REGEX, run => {
      const verse = run.slice(0, 9);
      const isValid =
        bookMap[verse.slice(0, 3)] !== undefined &&
        Number(verse.slice(3, 6)) >= 1 &&
        Number(verse.slice(6, 9)) >= 1;
      if (!isValid) {
        unresolved.push(run);
        return run;
      }
      const whole = `${verse}${WORD_POSITION_NONE}`;
      rewritten.push({ original: run, rewritten: whole });
      return whole;
    })
  );
  return { text: result, rewritten, unresolved };
}

export interface MeaningLetterCounts {
  /** Letters not after a link that were replaced by a number */
  replaced: number;
  /** Letters not after a link that were left because their base form has only one meaning */
  singleMeaning: number;
  /** Letters not after a link that were left because their base form has fewer meanings than the letter's position */
  outOfRange: number;
  /** Letters not after a link that were left because the meaning they name is not output */
  notOutput: number;
  /**
   * Letters not after a link that were numbered by the meaning position of a link to their own
   * entry that follows them
   */
  ownLinkReplaced: number;
  /** Letters after a link that were numbered by the linked entry */
  linkedReplaced: number;
  /** Letters after a link that were left because the link does not resolve to an output entry */
  linkedUnresolved: number;
  /** Letters after a link that were left because the linked entry has no such output meaning */
  linkedNoMeaning: number;
  /**
   * Numbered letters whose link names a meaning position (`:BBBMMM`: a 3-digit base-form index and
   * a 3-digit meaning index, both from 000) with the same meaning
   */
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
 * `'unresolved'` when the link does not resolve to an output entry, or `'noMeaning'` when the entry
 * has no such output meaning.
 *
 * @param meaningIndex The zero-based position of the meaning within its base form
 */
export type LinkedMeaningNumber = (
  target: LinkTarget,
  meaningIndex: number
) => number | 'unresolved' | 'noMeaning';

/**
 * Finds the number the Dictionary panel shows for a meaning of the entry whose definition is being
 * cleaned up, or `'noMeaning'` when that meaning is not output.
 *
 * @param meaningIndex The zero-based position of the meaning within the definition's base form
 */
export type OwnMeaningNumber = (meaningIndex: number) => number | 'noMeaning';

/**
 * Finds the number the Dictionary panel shows for the meaning a link names by its meaning position
 * (`:BBBMMM`), for a meaning letter that follows `word` and precedes the link. Returns `undefined`
 * when the link does not resolve to the entry whose definition is being cleaned up, names no meaning
 * position or a meaning that is not output, or when `word` is that entry's lemma or names another
 * entry: then the link is not the letter's own (its meaning position can differ from the letter).
 */
export type OwnLinkPositionNumber = (target: LinkTarget, word: string) => number | undefined;

/**
 * A cross-reference directly followed by a meaning letter, or a meaning letter on its own. The link
 * part matches the same links as `CROSS_REFERENCE_REGEX`.
 */
const LETTER_AFTER_LINK_REGEX = /\{L:[^<}]*<([A-Za-z-]+):([^>}]*)>\}\[([a-z])\]|\[([a-z])\]/g;

/**
 * What can follow a meaning letter before the link that names the same meaning: an optional quoted
 * gloss, which may itself contain an apostrophe, then an optional comma, then the link, as in
 * `φέρομαι[a] ‘to move from one place to another,’ {L:φέρω<SDBG:φέρω:000014>}`
 */
const LINK_AFTER_LETTER_REGEX =
  /^(?:,?\s*(?:‘[^{}]*?’|“[^{}]*?”|'[^{}]*?'|"[^{}]*?"))?,?\s*\{L:[^<}]*<([A-Za-z-]+):([^>}]*)>\}/;

/**
 * The Greek or Hebrew word directly before a meaning letter, allowing one space or a closing `}`
 * after it. A word in the definition's own language is never a form of an entry.
 */
const WORD_BEFORE_LETTER_REGEX = /([\p{Script=Greek}\p{Script=Hebrew}\p{M}]+)\}?\s?$/u;

/** Splits a cross-reference target into its lemma and its optional `:BBBMMM` meaning position */
function toLinkTarget(dictionaryId: string, rawTarget: string): LinkTarget {
  const position = TARGET_POSITION_REGEX.exec(rawTarget)?.[0] ?? '';
  return {
    dictionaryId,
    lemma: rawTarget.slice(0, rawTarget.length - position.length),
    position: position.slice(1),
  };
}

/** Meaning-letter counts that are all zero */
function emptyMeaningLetterCounts(): MeaningLetterCounts {
  return {
    replaced: 0,
    singleMeaning: 0,
    outOfRange: 0,
    notOutput: 0,
    ownLinkReplaced: 0,
    linkedReplaced: 0,
    linkedUnresolved: 0,
    linkedNoMeaning: 0,
    linkedPositionAgrees: 0,
    linkedPositionDiffers: 0,
    linkedPositionAbsent: 0,
  };
}

/**
 * Replaces `[a]`, `[b]`, … with `(1)`, `(2)`, ….
 *
 * A letter directly after a cross-reference is numbered by `linkedMeaningNumber`; it is left as it
 * is when that returns no number, or when none is given.
 *
 * A letter that follows a word that is not a lemma, such as a middle-voice form (`φέρομαι[a]` in
 * φέρω), and is followed, after at most a quoted gloss and a comma, by a link to the definition's
 * own entry is numbered by the meaning position that link names, as `ownLinkPositionNumber` gives
 * it. The form's meanings can come later in the entry, so the letter's position in the alphabet
 * does not say which meaning it is.
 *
 * Any other letter is numbered when Paratext 9 numbers it: only when the base form whose definition
 * it is has more than one lexical meaning (counting meanings that are not output), and the letter's
 * position is within that count. The number is the one `ownMeaningNumber` gives, which is the
 * meaning's position among the entry's output senses as the Dictionary panel numbers them; in an
 * entry with several base forms that differs from the letter's position in the alphabet. Without
 * `ownMeaningNumber`, the letter's position in the alphabet is used.
 *
 * @param baseFormMeaningCount The number of lexical meanings of the base form whose definition
 *   `text` is, including meanings that are not output
 */
export function replaceMeaningLetters(
  text: string,
  baseFormMeaningCount: number,
  linkedMeaningNumber?: LinkedMeaningNumber,
  ownMeaningNumber?: OwnMeaningNumber,
  ownLinkPositionNumber?: OwnLinkPositionNumber
): MeaningLetterCounts & { text: string } {
  const counts = emptyMeaningLetterCounts();
  const alphabetPosition = (letter: string) => letter.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
  const result = text.replace(
    LETTER_AFTER_LINK_REGEX,
    (
      match,
      dictionaryId: string | undefined,
      rawTarget: string | undefined,
      linkLetter: string | undefined,
      bareLetter: string | undefined,
      offset: number,
      whole: string
    ) => {
      if (linkLetter !== undefined && dictionaryId !== undefined && rawTarget !== undefined) {
        const target = toLinkTarget(dictionaryId, rawTarget);
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
        // The letter is the match's last three characters
        return `${match.slice(0, match.length - 3)}(${number})`;
      }
      const followingLink = LINK_AFTER_LETTER_REGEX.exec(whole.slice(offset + match.length));
      const wordBefore = WORD_BEFORE_LETTER_REGEX.exec(whole.slice(0, offset))?.[1];
      const ownLinkNumber =
        followingLink &&
        wordBefore !== undefined &&
        ownLinkPositionNumber?.(toLinkTarget(followingLink[1], followingLink[2]), wordBefore);
      if (ownLinkNumber) {
        counts.ownLinkReplaced++;
        return `(${ownLinkNumber})`;
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
      const number = ownMeaningNumber ? ownMeaningNumber(position - 1) : position;
      if (number === 'noMeaning') {
        counts.notOutput++;
        return match;
      }
      counts.replaced++;
      return `(${number})`;
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
  /** The entry whose definition or gloss holds the cross-reference */
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
  notOutput: number;
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
  /** Over-long digit runs in `{S:...}` markers of definitions and glosses */
  bibleReferences: { rewritten: number; unresolved: number };
  meaningLetters: MeaningLetterCounts;
}

/** An over-long `{S:...}` digit run, per language and entry */
export interface BibleReferenceProblem {
  language: string;
  field: 'definition' | 'gloss';
  entryId: string;
  original: string;
}

/** An over-long `{S:...}` digit run that was rewritten */
export interface RewrittenBibleReferenceEntry extends BibleReferenceProblem {
  rewritten: string;
}

export interface DefinitionCleanupReport {
  byLanguage: Record<string, LanguageCleanupCounts>;
  /**
   * Targets that do not resolve to an output entry: ambiguous, not output, not found, or in an
   * unknown dictionary
   */
  unresolved: CrossReferenceProblem[];
  /** Targets whose entry exists but the conversion rules leave out */
  excludedByDesign: CrossReferenceProblem[];
  /** `{L:` markers in definitions that are not cross-references; the text is left unchanged */
  malformed: MalformedCrossReference[];
  /** Over-long `{S:...}` digit runs that were rewritten to whole-verse references */
  rewrittenBibleReferences: RewrittenBibleReferenceEntry[];
  /** Over-long `{S:...}` digit runs that were left unchanged */
  unresolvedBibleReferences: BibleReferenceProblem[];
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
    notOutput: 0,
    excludedByDesign: 0,
    unresolved: 0,
  };
}

function emptyCounts(): LanguageCleanupCounts {
  return {
    crossReferences: emptyCrossReferenceCounts(),
    glossCrossReferences: emptyCrossReferenceCounts(),
    malformedCrossReferences: 0,
    symbols: emptySymbolCounts(),
    unspacedSymbols: emptyUnspacedSymbolCounts(),
    glossLeadingEquals: 0,
    bibleReferences: { rewritten: 0, unresolved: 0 },
    meaningLetters: emptyMeaningLetterCounts(),
  };
}

/**
 * Cleans up every output sense, in place: strips the structure symbols from definitions and a
 * leading `=` or `＝` from glosses, rewrites cross-reference targets in definitions and glosses to
 * the exact lemma of an output entry, numbers meaning letters in definitions, and rewrites over-long
 * `{S:...}` references in both to whole-verse references. A target whose dictionary is the one being converted
 * (compared without regard to case, as MARBLE has `sdbh` and `sdbg`) is written with the canonical
 * dictionary ID. Run it once the entries that will be output are final, since a target is rewritten
 * only if its entry is output. Targets are matched against every source entry, so a target that
 * means an entry that is not output is reported rather than matched to a different entry.
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
  const rewrittenBibleReferences: RewrittenBibleReferenceEntry[] = [];
  const unresolvedBibleReferences: BibleReferenceProblem[] = [];

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

  // The sense IDs of every lexical meaning of a sense's base form, by the sense's ID
  const baseFormBySenseId = new Map<string, string[]>();
  for (const baseForms of meaningSenseIdsByEntryId.values())
    for (const senseIds of baseForms)
      for (const senseId of senseIds) if (senseId) baseFormBySenseId.set(senseId, senseIds);

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
          // Another output entry can share the found entry's lemma; only the found entry will do
          if (entries[found.lemma]?.id === `${ENTRY_PREFIX}${found.id}`) {
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
            refs.notOutput++;
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
        if (linkedEntry?.id !== `${ENTRY_PREFIX}${found.entry.id}`) return 'unresolved';
        const baseForms = meaningSenseIdsByEntryId.get(found.entry.id) ?? [];
        const baseFormIndex = target.position.length >= 3 ? Number(target.position.slice(0, 3)) : 0;
        const senseId = baseForms[baseFormIndex]?.[meaningIndex];
        const number =
          senseId === undefined ? -1 : linkedEntry.senses.findIndex(s => s.id === senseId);
        return number === -1 ? 'noMeaning' : number + 1;
      };

      // The number of the meaning a link to this entry names by its meaning position
      const ownLinkPositionNumber: OwnLinkPositionNumber = (target, word) => {
        if (target.position.length < 3) return undefined;
        if (target.dictionaryId.toUpperCase() !== dictionaryId.toUpperCase()) return undefined;
        const found = lookup(target.lemma);
        if (found.kind !== 'found' || entry.id !== `${ENTRY_PREFIX}${found.entry.id}`)
          return undefined;
        // The word must be another form of this entry, not its lemma or another entry's
        const foundWord = lookup(word);
        if (foundWord.kind === 'ambiguous') return undefined;
        if (
          foundWord.kind === 'found' &&
          (foundWord.entry.id !== found.entry.id || foundWord.step !== 'alternateLemma')
        )
          return undefined;
        const number = linkedMeaningNumber(target, Number(target.position.slice(-3)));
        return typeof number === 'number' ? number : undefined;
      };

      // Rewrites over-long Bible references in a definition or gloss and records them
      const fixBibleReferences = (text: string, field: BibleReferenceProblem['field']): string => {
        const result = rewriteOverlongBibleReferences(text);
        for (const { original, rewritten } of result.rewritten) {
          counts.bibleReferences.rewritten++;
          rewrittenBibleReferences.push({
            language,
            field,
            entryId: entry.id,
            original,
            rewritten,
          });
        }
        for (const original of result.unresolved) {
          counts.bibleReferences.unresolved++;
          unresolvedBibleReferences.push({ language, field, entryId: entry.id, original });
        }
        return result.text;
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

        // The number of a meaning of this sense's own base form, as the Dictionary panel shows it
        const ownBaseForm = baseFormBySenseId.get(sense.id);
        const ownMeaningNumber: OwnMeaningNumber = meaningIndex => {
          const senseId = ownBaseForm?.[meaningIndex];
          const number = senseId === undefined ? -1 : entry.senses.findIndex(s => s.id === senseId);
          return number === -1 ? 'noMeaning' : number + 1;
        };

        // Letters are numbered before the targets are rewritten, while the link still reads as written
        const lettered = replaceMeaningLetters(
          stripped.text,
          baseFormMeaningCountBySenseId.get(sense.id) ?? 0,
          linkedMeaningNumber,
          ownMeaningNumber,
          ownLinkPositionNumber
        );
        for (const key of Object.keys(counts.meaningLetters) as (keyof MeaningLetterCounts)[])
          counts.meaningLetters[key] += lettered[key];

        sense.definition = fixBibleReferences(
          rewriteCrossReferenceTargets(lettered.text, resolveInDefinition),
          'definition'
        );
        if (sense.glosses)
          sense.glosses = sense.glosses.map(gloss => {
            const withoutEquals = stripLeadingEquals(gloss);
            if (withoutEquals !== gloss) counts.glossLeadingEquals++;
            return fixBibleReferences(
              rewriteCrossReferenceTargets(withoutEquals, resolveInGloss),
              'gloss'
            );
          });
      }
    }
  }

  return {
    byLanguage,
    unresolved: Array.from(unresolved.values()),
    excludedByDesign: Array.from(excludedByDesign.values()),
    malformed: Array.from(malformed.values()),
    rewrittenBibleReferences,
    unresolvedBibleReferences,
  };
}

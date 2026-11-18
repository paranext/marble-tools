# marble-tools

Scripts and utilities for transforming and preparing MARBLE data for use in Platform and Paratext

## Requirements

This repo assumes that you have access to MARBLE data from the ubsicap organization separately and have cloned the following repositories at the same level (i.e., as siblings in the directory hierarchy) as this repo:

- marble-enhanced-resources
- marble-indexes
- marble-lexicon
- marble-mappings
- marble-tools

Not all of these repositories may be used in scripts at this time. Those are just the known, expected sources of data for scripts and tools in this repository. The dictionary conversion (`npm run convert-sdbg`, `npm run convert-sdbh`) reads only `marble-lexicon`: each lexical meaning's occurrences come from its own `LEXReferences`.

Node is pinned to 22.22.1 with [Volta](https://volta.sh/). Without Volta, use a Node version that satisfies `engines` in `package.json`.

## Getting Started

1. **Clone the repository**:

   ```
   git clone <repository-url>
   cd marble-tools
   ```

2. **Install dependencies**:

   ```
   npm install
   ```

   The prebuilt `sqlite3` binary for Linux needs glibc 2.38 or newer (Ubuntu 24.04+). On older distros, such as Ubuntu 22.04, the install detects this and builds `sqlite3` from source automatically, which needs Python, make and a C++ compiler.

3. **Run scripts as needed**:
   ```
   npm run convert-sdbg
   ```

## Checking the English database

`scripts/verify_english_db.py` (Python 3, standard library only) checks a built `english.db` against the MARBLE lexicon XML. It re-derives the expected senses and occurrences from the source rules instead of sharing code with the converter, and exits non-zero when a check fails:

```
python3 scripts/verify_english_db.py --db english.db --lexicon ../marble-lexicon \
    [--links ../marble-indexes/Full] [--previous-db path/to/lexical.db]
```

1. **Senses:** the database's sense IDs equal the lexical meanings the rules include (SDBH: not marked `N` or `X`, entry version 3 or higher; both: has an English sense with a definition or gloss), every sense ID ends in `000`, and the entries match. Each sense belongs to the entry whose number starts its ID, and each entry's lemma is the lexicon's `Lemma`. It fails when the rules yield no senses for a dictionary, such as when `--lexicon` is the wrong directory.
2. **Occurrences:** each sense's occurrences equal the references in its own `LEXReferences` (first 14 digits, even word IDs, word number not 0, each position once). SDBG meanings marked `N` or `X` are senses without occurrences.
3. **Totals** (with `--previous-db`): entries, lexical senses and distinct word positions of each dictionary may not drop more than 2% (`MAX_DROP_FRACTION`) compared with the previously published database. Only lexical senses are compared, because the published database may still contain contextual senses; if a larger drop is expected, raise `MAX_DROP_FRACTION` in the pull request that causes it. It fails when the previous database has a total of 0 for a dictionary (or lacks the dictionary), since there is nothing to compare with.
4. **Links** (with `--links`): informational only. Compares the database's sense occurrences with the lexical links in the published `MARBLELinks-*.XML` and prints "in step" or "drift". It never fails, because the links can lag behind lexicon edits.
5. **Definition text:** invariants over the cleaned-up text: no `►`, `◄` or `≈` remains in a definition, every `{S:` marker holds a 14-digit reference, each definition keeps as many `{L:` markers as its source, and no definition or gloss that was non-empty in the source is empty. It does not repeat the clean-up, so rewritten cross-reference targets and `(n)` numbers are not checked.

The `Build English Database` workflow runs checks 1, 2, 3 and 5 after the import, comparing with the database published in `paranext/dependencies`.

## Changes to definitions

The conversion changes sense definitions (`DefinitionShort`), in every language, as Paratext 9's dictionary does. Cross-reference targets in glosses are rewritten in the same way, because the Dictionary renders glosses with the same markup parser. Glosses' symbols and `[a]` letters are left alone: in glosses `=` usually means "that is". Paratext 9 strips the symbols from glosses as well; this converter deliberately does not, except for a gloss's leading `=` (see below).

- **Structure symbols:** every `= `, `► `, `◄ ` and `≈ ` (the symbol followed by a space) is removed wherever it occurs. `|` line breaks are kept. Beyond Paratext 9, the conversion also removes every remaining `►`, `◄` and `≈` whatever follows it, and an `=` that starts the definition or follows whitespace and is directly followed by a non-space character (an `=` inside a word or inside `{L:...}` markup is kept), because the source sometimes omits the space after a structure symbol. The full-width `＝` that the Chinese definitions use as their definition marker is removed where it starts the definition or follows whitespace, `：` or `；`. Where removed symbols stood between two words with no other space (for example `sour;◄ due` or `homem◄filho`), a space is left so the words are not joined; italic, underline and bold markup (`|i`, `|u`, `|b`) count as the start or end of a word. No space is left next to whitespace, after an opening bracket or quote (a straight quote counts as opening only at the start or after whitespace), right after a markup opener such as `{L:` or `|i`, or in Chinese or Japanese text.
- **Leading `=` in glosses:** a gloss that starts with `=` (the definition marker) loses it and the spaces after it. Any other `=` in a gloss stays.
- **Cross-references:** in `{L:text<SDBH:lemma>}` (SDBG: `{L:text<SDBG:lemma:000000>}`), the target lemma is replaced with the exact `Lemma` of the entry it means, because the Dictionary looks targets up by exact lemma. Everything else in the markup, including SDBG's trailing meaning position, is kept. A target is compared with each entry's lemma exactly, then after Unicode NFD, then with a no-break space read as a space, then with the entry's `AlternateLemmas` in the same three ways, and finally with sheva + patah, segol or qamats read as the matching hataf vowel. The first comparison that matches decides; if it matches more than one entry, the target is ambiguous. A prefix that equals the dictionary being converted without regard to case (`sdbh`, `sdbg`) is resolved like any other and written with the canonical prefix (`SDBH`, `SDBG`), because the Dictionary compares prefixes case-sensitively. Targets in another known dictionary (`SDBH`, `SDBG`, `BT-OT`, `REALIA`) are left alone; a target with any other prefix is listed as an unknown dictionary and left unchanged.
- **Meaning letters:** `[a]`, `[b]`, … become `(1)`, `(2)`, …, numbered as the Dictionary panel numbers senses: by position among an entry's output senses in that language, across all its base forms.
  - **After a cross-reference:** the letter names a lexical meaning (`a` is the first) of the linked entry, in the base form the target names (its first base form when the target names none), so it gets that meaning's number in the linked entry. **This deliberately differs from Paratext 9**, which numbers every letter by the entry being displayed, and so leaves valid letters unnumbered in entries with one meaning.
  - **Elsewhere:** the letter is numbered only when Paratext 9 numbers it: its base form has more than one lexical meaning, and the letter is within that count. It gets that meaning's number in its own entry, which can differ from its position in the alphabet.
  - **Left unchanged:** a letter whose link does not resolve to an output entry, whose meaning does not exist or is not output, or that Paratext 9 would not number.
- **Over-long Bible references:** the Dictionary reads a `{S:...}` reference as 14 digits (3 for the book, 3 for the chapter, 3 for the verse, 5 for the word). The source sometimes writes more than 14 digits in a run (15 to 17 occur); the Dictionary then shows the raw markup. Such a run is rewritten to a whole-verse reference: its first 9 digits followed by `00000`. The verse is kept and the word position, which the long run does not hold sensibly, is dropped. This applies to definitions and glosses. A run whose first 9 digits are not a known book with a chapter and verse of 1 or more is left unchanged. Every rewrite, and every run left unchanged, is listed at the end of the conversion with its language, field and entry Id, and counted per language in the clean-up summary. Other parts of the marker (other references, separators) are kept.

A target that is not changed is shown as plain text. The conversion lists these at the end, as warnings:

- **Excluded by design:** the target is an entry that the conversion leaves out on purpose: an SDBH entry whose lexical meanings are all marked `N` or `X`, or whose version is below 3. Such an entry has no senses, so it is not in the database.
- **Unresolved:** no entry matches, more than one does, the entry has no senses in that language, or the dictionary prefix is not a known one. Each is listed with whether it was in a definition or a gloss.
- **Malformed:** a `{L:` marker that is not a cross-reference at all (no `<`, no closing `}`, or a broken dictionary prefix) in a definition. The text is left unchanged; the summary counts them per language and lists them.

## License

This project is licensed under the MIT License. All data needed to run this project is licensed under separate terms.

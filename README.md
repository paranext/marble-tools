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

## Changes to definitions

The conversion changes sense definitions (`DefinitionShort`), in every language, as Paratext 9's dictionary does. Glosses are left as they are.

- **Structure symbols:** every `= `, `► `, `◄ ` and `≈ ` (the symbol followed by a space) is removed wherever it occurs. `|` line breaks are kept.
- **Cross-references:** in `{L:text<SDBH:lemma>}` (SDBG: `{L:text<SDBG:lemma:000000>}`), the target lemma is replaced with the exact `Lemma` of the entry it means, because the Dictionary looks targets up by exact lemma. Everything else in the markup, including SDBG's trailing meaning position, is kept. A target is compared with each entry's lemma exactly, then after Unicode NFD, then with a no-break space read as a space, then with the entry's `AlternateLemmas` in the same three ways, and finally with sheva + patah, segol or qamats read as the matching hataf vowel. The first comparison that matches decides; if it matches more than one entry, the target is ambiguous. Targets in another dictionary (such as `BT-OT`) are left alone.
- **Meaning letters:** `[a]`, `[b]`, … become `(1)`, `(2)`, … when the base form whose definition it is has more than one lexical meaning and the letter is within that number, as in Paratext 9. In the MARBLE data such a letter usually follows a cross-reference and names a meaning of that entry.

A target that is not changed is shown as plain text. The conversion lists these at the end, as warnings:

- **Excluded by design:** the target is an entry that the conversion leaves out on purpose: an SDBH entry whose lexical meanings are all marked `N` or `X`, or whose version is below 3. Such an entry has no senses, so it is not in the database.
- **Unresolved:** no entry matches, more than one does, or the entry has no senses in that language.

## License

This project is licensed under the MIT License. All data needed to run this project is licensed under separate terms.

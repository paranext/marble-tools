# marble-tools

Scripts and utilities for transforming and preparing MARBLE data for use in Paratext

## Requirements

This repo assumes that you have access to MARBLE data from the ubsicap organization separately and have cloned the following repositories at the same level (i.e., as siblings in the directory hierarchy) as this repo:

- marble-enhanced-resources
- marble-indexes
- marble-lexicon
- marble-mappings
- marble-tools

Not all of these repositories may be used in scripts at this time. Those are just the known, expected sources of data for scripts and tools in this repository.

The scripts currently read only `../marble-lexicon` (the SDBH and SDBG lexicon and domain XML) and `../marble-indexes/Full` (the MARBLELinks that give each sense its scripture occurrences). The npm scripts hard-code these relative paths, and `--version` is taken from the commit date of `../marble-lexicon` HEAD. Sibling checkouts drift behind upstream, so before drawing conclusions about the data, compare `git -C ../marble-lexicon log -1` with `origin/master`.

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

## Commands

### Development

```bash
npm test                                         # jest, all suites in src/__tests__
npx jest src/__tests__/domain-taxonomy.test.ts   # one suite; add -t '<name>' for one test
npm run lint                                     # eslint src/*.ts (does not cover src/__tests__)
npx tsc --noEmit -p tsconfig.json                # typecheck (no npm script)
npm run format-sql                               # prettier on sql/**/*.sql
```

CI (`.github/workflows/test.yml`) runs `npm test` and `npm run lint` on pushes and PRs to `main`. `npm test` typechecks only the files the tests import, so run `tsc` to cover `src/convert-marble-lexicon.ts` and `src/import-lexicon-to-sqlite.ts`. The `Unknown book ID` warning in the jest output comes from a test that exercises that path on purpose.

### Building the databases

```bash
npm run convert-sdbh      # ../marble-lexicon/SDBH -> output-sdbh/lexicon_<lang>.xml (about 50s)
npm run convert-sdbg      # ../marble-lexicon/SDBG -> output-sdbg/lexicon_<lang>.xml (about 15s)

# english.db (the DB that ships) is imported from english/, which the convert scripts do not update:
mkdir -p english
cp output-sdbg/lexicon_en.xml english/sdbg_en.xml
cp output-sdbh/lexicon_en.xml english/sdbh_en.xml
npm run import-english-to-sqlite

npm run import-to-sqlite  # all languages of both dictionaries -> lexicon.db (takes several minutes)
```

If you skip the copy step, `english.db` is built from whatever XML was last copied into `english/`. To check which source version a DB was built from, run `sqlite3 -readonly english.db "select Id, Version from LexicalReferenceTexts"`.

To convert upstream data without moving your sibling checkouts, extract `origin/master` of both into a scratch directory and run the converter directly against the extract:

```bash
git -C ../marble-lexicon fetch && git -C ../marble-indexes fetch
mkdir -p <dir>
git -C ../marble-lexicon archive origin/master SDBH SDBG | tar -x -C <dir>
git -C ../marble-indexes archive origin/master Full | tar -x -C <dir>
version=$(git -C ../marble-lexicon log -1 --format=%cd --date=iso-strict origin/master)
npx ts-node src/convert-marble-lexicon.ts --dictionary-type SDBH --input <dir>/SDBH \
  --domains <dir>/SDBH --marble-links <dir>/Full --output output-sdbh --version "$version" > <dir>/sdbh.log 2>&1
```

Repeat for SDBG with `output-sdbg`, then run the copy and import steps above. `$version` is upstream's commit date, which is what the shipped DB records. To make output comparable between runs, pass a fixed `--version 2000-01-01T00:00:00Z` instead, as `scripts/diff-output.sh` does.

The logs run to tens of thousands of lines. Search them for `Sense domain check` to find the per-taxonomy summary. Thousands of `Skipping contextual meanings` and `Empty CONDomain code ... NO DATA YET` warnings are expected, because they mark upstream work in progress.

### Checking that a converter change preserves output

```bash
scripts/diff-output.sh [-d SDBH|SDBG|both] [-o out-dir] [base-ref]
```

The script converts with the code at `base-ref` (default: the merge-base with `main`, or with `origin/main` when there is no local `main`) and with the working tree, using the same data and version, then compares the output XML. Outputs and logs go to `out-dir` (default: a new temp dir). It exits 0 when the outputs are identical, 1 when they differ and 2 on errors. Run it from a worktree too: it finds the data repos next to the main checkout, or you can set `MARBLE_LEXICON` and `MARBLE_INDEXES`, and it links the main checkout's `node_modules` into a worktree that has none.

## How it works

1. `src/convert-marble-lexicon.ts` reads the MARBLE lexicon XML, adds occurrences from MARBLELinks, builds the semantic domain taxonomies, and writes one XML file per language. The output format is described in `xml/output.rnc`. The converter checks each sense's domain against the taxonomy label for its code before writing anything, and exits with an error if any disagree (see the "Notes on semantic domains" in `docs/current_lexicon_specification.md`).
2. `src/import-lexicon-to-sqlite.ts` loads that XML into SQLite using `sql/schema.sql`. The views at the end of the schema are what the lexical service in paranext-core queries.
3. `.github/workflows/build-english-db.yml` runs both steps against the upstream default branch of the MARBLE repos, on PRs to `main` and on manual dispatch, and uploads `english.db` as an artifact. That artifact is published through [paranext/dependencies](https://github.com/paranext/dependencies) as described in its `lexical-db/SOURCE.md`.

`src/convert-marble-lexicon.ts` runs `main()` when it is loaded, so tests cannot import it. Logic that needs tests belongs in `src/helpers.ts` or `src/domain-taxonomy.ts`.

The MARBLE source format is described in `docs/current_lexicon_specification.md`, including notes on where the current data differs from that document.

## License

This project is licensed under the MIT License. All data needed to run this project is licensed under separate terms.

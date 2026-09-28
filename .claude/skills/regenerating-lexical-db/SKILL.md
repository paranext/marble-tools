---
name: regenerating-lexical-db
description: Use when regenerating or refreshing the English lexical database (english.db / lexical.db) from MARBLE data, updating the DB that ships in paranext/dependencies for platform-lexical-tools, or checking whether a locally built DB reflects current upstream data.
---

# Regenerating the lexical DB

## Overview

The DB that ships is `lexical-db/lexical.db.xz` in `paranext/dependencies`. paranext-core downloads it whenever its checksum changes, so replacing that file is the release. Most failed regenerations came from building or validating against **stale inputs**, not from code bugs.

Commands live in `README.md` ("Building the databases", "How it works"). Publishing steps live in `lexical-db/SOURCE.md` in the sibling `../dependencies` checkout. Follow those files; this skill gives the order and the checks.

## Procedure

1. **Choose the code ref.** Build from `main`. If converter fixes the DB needs (for example, the sense-domain check) are only on an unmerged branch, say which ref you are using and why.
2. **Build.**
   - **Preferred:** run the `build-english-db.yml` workflow via `workflow_dispatch` on that ref: `gh workflow run build-english-db.yml -R paranext/marble-tools --ref <ref>`. It takes about 8 minutes and always uses upstream's default branch. Download the `english-database` artifact with `gh run download <run-id> -R paranext/marble-tools -n english-database -D <scratch>`.
   - **Local:** fetch the sibling repos in the background, since fetch is slow. If `HEAD` is behind `origin/master`, ask the user to update, or archive `origin/master` into scratch as the README describes. Then run the README steps, including copying the English files into `english/`.
3. **If a convert step fails the sense-domain check,** stop. See "Check failure" below.
4. **Verify the DB you will ship.**
   - `select Id, Version from LexicalReferenceTexts` must show the upstream commit date for both dictionaries.
   - Decompress the currently shipped DB into scratch. Compare row counts per LexicalReferenceText for Entries, Senses, SenseOccurrences and SenseDomains, and explain any large change.
   - Spot-check one verse through `SenseOccurrenceView` and `SenseDomainView`, for example EXO 20:12: `BookNum=2, ChapterNum=20, VerseNum=12`. Filter by reference, not by lemma: lemmas are not NFC (see the docs notes).
5. **Stage.** On a branch in `../dependencies`, replace the DB and checksum as `SOURCE.md` describes. Run `sha256sum` inside `lexical-db/` so the checksum file names the bare file. Commit, then **stop and ask** before pushing or opening a PR.

## Check failure

The converter fails before writing anything. This means entries and taxonomy are numbered out of sync upstream; `docs/current_lexicon_specification.md` explains how that happens.

- Do not raise the limit, drop `--domains`, or patch codes to get a DB out. The currently shipped DB stays in place.
- Give the user the "Most frequent disagreements" list as an upstream issue for Reinier de Blois, and ask before posting it to Jira.
- A "no English labels" failure means a domain file is missing or failed to parse. It is not a numbering problem.

## Common mistakes

| Mistake                                             | Consequence                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| Importing without refreshing `english/`             | A DB built from old XML that passes every local check                    |
| Trusting the sibling repo's `HEAD` without fetching | Both the content and `--version` lag behind upstream                     |
| `git pull` or stashing in `../marble-lexicon`       | Moves or discards the user's data checkout; archive into scratch instead |
| Building `lexicon.db` (`import-to-sqlite`)          | Wrong artifact: all languages, not the English DB that ships             |

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repo converts the private UBS MARBLE semantic dictionaries, SDBH (Hebrew) and SDBG (Greek), into the SQLite lexical database that Paratext ships. This file does not repeat facts kept elsewhere. It only points to them, so update the source rather than copying it here.

## Where things are documented

- **Commands, pipeline, and how the pieces fit:** `README.md` covers building, testing, running the converter against scratch or upstream data, the output-diff script, and how the DB is published.
- **MARBLE source format and data quirks:** `docs/current_lexicon_specification.md`. Read its "Notes on semantic domains" and "Notes on entries" before changing domain or entry handling. `docs/README.md` explains which docs are maintained.
- **Output format:** `xml/output.rnc`. The DB schema and the views that paranext-core queries are in `sql/schema.sql`.
- **Reasons behind the code:** comments in `src/`. "From Reinier:" marks rules from the data owner, and "From data inspection:" marks observed behavior. `src/domain-taxonomy.ts` explains the sense-domain check.
- **Regenerating or shipping the DB:** the `regenerating-lexical-db` skill in `.claude/skills/`.

## Working here

- Run `npm test`, `npm run lint` and `npx tsc --noEmit -p tsconfig.json` before committing. CI does not typecheck.
- When a converter change is not meant to change output, prove it with `scripts/diff-output.sh`.
- Do not move the sibling data checkouts (`../marble-lexicon`, `../marble-indexes`). `.claude/settings.json` denies checkout/reset/pull there. To get another revision, use `git archive`, as the README describes.
- The docs cannot be trusted to be complete. Check structural assumptions against the data before relying on them. Record what you learn in the docs notes sections, or in a "From data inspection:" comment next to the code that depends on it.
- If the sense-domain check fails, the fix belongs in the upstream data. Do not raise the limit or work around it in the converter. Report the disagreements to the user as an upstream issue for Reinier de Blois, the data owner. Keep the tone deferential and include file:line evidence.
- Ask before posting to Jira. PR titles carry the Jira key (e.g. `PT-4547`).
- A project hook runs prettier on each `src/**/*.ts` and `sql/*.sql` file you edit. `sql/schema.sql` is not prettier-clean yet, so the first edit to it also reformats unrelated lines. Commit that reformat separately.

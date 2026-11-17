#!/usr/bin/env python3
"""Checks a built English lexicon database against the MARBLE lexicon XML it was built from.

This script deliberately shares no code with the TypeScript converter: it re-derives, from the
source XML and the documented rules below, what the database should contain, so a converter bug is
not repeated in the check.

Rules (per dictionary, English only):
- A sense is one LEXMeaning (BaseForms/BaseForm/LEXMeanings/LEXMeaning) with an English
  LEXSense (LEXSenses/LEXSense).
  Contextual meanings (CONMeanings) are not senses.
- Sense ID = first 6 digits of the Lexicon_Entry Id + last 9 digits of the LEXMeaning Id.
  The entry ID in the database is the 6-digit entry number.
- SDBH: entries with Version below 3 and meanings with IsBiblicalTerm N or X are left out.
  SDBG: every meaning is a sense, but meanings marked N or X get no occurrences.
- A sense with no definition and no glosses is removed, and an entry left with no senses is removed.
- A sense's occurrences are the values of its LEXMeaning's own LEXReferences/LEXReference elements
  (not those under CONMeanings), reduced to their first 14 digits (BBBCCCVVVPPWWW), skipping an odd
  last digit and word number 0 and counting each (book, chapter, verse, word) once. The word number
  is the last three digits divided by 2.

Checks:
1. Senses: the database's sense IDs equal the expected set, all end in 000, and its entry IDs match.
2. Occurrences: each sense's occurrences equal the expected set.
3. Totals against a previous database (--previous-db): entries, lexical senses and distinct word
   positions may not drop by more than MAX_DROP_FRACTION.
4. Links oracle (--links): informational comparison with the published MARBLELinks lexical links.

Usage: python3 scripts/verify_english_db.py --db english.db --lexicon ../marble-lexicon
           [--links ../marble-indexes/Full] [--previous-db path]
Exits non-zero when any of checks 1-3 fails.
"""
import argparse
import collections
import glob
import os
import re
import sqlite3
import sys
import xml.etree.ElementTree as ET

# Check 3 fails when a total drops by more than this fraction compared with the previous database
MAX_DROP_FRACTION = 0.02

DICTIONARIES = ('SDBG', 'SDBH')
MIN_SDBH_ENTRY_VERSION = 3
LANGUAGE = 'en'
# How many offending items each failed check lists
SAMPLE_SIZE = 8


def lexicon_files(lexicon_root, name):
    """The dictionary's lexicon files, selected as the converter does (a four-character name, a
    dash and two digits, case-insensitive), limited to the dictionary's own prefix."""
    directory = os.path.join(lexicon_root, name)
    if not os.path.isdir(directory):
        return []
    return [
        os.path.join(directory, filename)
        for filename in sorted(os.listdir(directory))
        if re.fullmatch(r'\w{4}-\d{2}\.xml', filename, re.I) and filename.upper().startswith(f'{name}-')
    ]


def text_of(element):
    return ''.join(element.itertext()).strip() if element is not None else ''


def has_content(lex_sense):
    """True when the LEXSense has a non-empty definition or at least one non-empty gloss."""
    if text_of(lex_sense.find('.//DefinitionShort')):
        return True
    glosses = lex_sense.find('.//Glosses')
    return glosses is not None and any(text_of(gloss) for gloss in glosses.iter('Gloss'))


def occurrences_of(references):
    """Distinct (book, chapter, verse, word) from LEXReference texts, by the rules above."""
    result = set()
    for reference in references:
        reference = reference.strip()[:14]
        if len(reference) != 14 or not reference.isdigit():
            raise SystemExit(f'LEXReference "{reference}" is not 14 digits')
        if int(reference[13]) % 2 == 1:
            continue
        word = int(reference[11:]) // 2
        if word == 0:
            continue
        result.add((int(reference[0:3]), int(reference[3:6]), int(reference[6:9]), word))
    return result


def expected_from_lexicon(lexicon_root, name):
    """Returns (senses, entry_ids, stats): senses maps sense ID -> set of occurrences."""
    senses = {}
    stats = collections.Counter()
    # Entries that lose all their senses are not in the database
    entry_ids = set()
    for path in lexicon_files(lexicon_root, name):
        for entry in ET.parse(path).getroot().iter('Lexicon_Entry'):
            entry_id = (entry.get('Id') or '')[:6]
            if name == 'SDBH':
                version = (entry.get('Version') or '').strip()
                if not version.isdigit():
                    raise SystemExit(f'Entry {entry_id} in {path} has no numeric Version')
                if int(version) < MIN_SDBH_ENTRY_VERSION:
                    stats[f'entries below version {MIN_SDBH_ENTRY_VERSION}'] += 1
                    continue
            for meaning in entry.findall('BaseForms/BaseForm/LEXMeanings/LEXMeaning'):
                flag = (meaning.get('IsBiblicalTerm') or '').upper()
                not_linked = flag in ('N', 'X')
                if name == 'SDBH' and not_linked:
                    stats['meanings marked N or X'] += 1
                    continue
                english = [
                    s for s in meaning.findall('LEXSenses/LEXSense') if s.get('LanguageCode') == LANGUAGE
                ]
                if not english:
                    stats['meanings without an English sense'] += 1
                    continue
                if not any(has_content(s) for s in english):
                    stats['empty senses removed'] += 1
                    continue
                sense_id = entry_id + (meaning.get('Id') or '')[-9:]
                if sense_id in senses:
                    raise SystemExit(f'{name}: duplicate sense ID {sense_id}')
                if not_linked:
                    senses[sense_id] = set()
                    stats['SDBG meanings marked N or X (no occurrences)'] += 1
                else:
                    references = [
                        r.text or ''
                        for r in meaning.findall('LEXReferences/LEXReference')
                    ]
                    senses[sense_id] = occurrences_of(references)
                entry_ids.add(entry_id)
    return senses, entry_ids, stats


def load_database(db_path, name):
    """Returns (senses, entry_ids): senses maps sense ID -> set of occurrences."""
    db = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    try:
        senses = {}
        entry_ids = set()
        for entry_id, sense_id in db.execute(
            '''SELECT e.Id, s.Id FROM Senses s
               JOIN Entries e ON e.EntryKey = s.EntryKey
               JOIN LexicalReferenceTexts l ON l.LexicalReferenceTextKey = e.LexicalReferenceTextKey
               JOIN Languages lang ON lang.LanguageKey = s.LanguageKey
               WHERE l.Id = ? AND lang.BCP47Code = ?''',
            (name, LANGUAGE),
        ):
            if sense_id in senses:
                raise SystemExit(f'{db_path}: {name} has sense ID {sense_id} twice')
            senses[sense_id] = set()
            entry_ids.add(entry_id)
        for sense_id, book, chapter, verse, word in db.execute(
            '''SELECT s.Id, o.BookNum, o.ChapterNum, o.VerseNum, o.WordNum
               FROM SenseOccurrences o
               JOIN Senses s ON s.SenseKey = o.SenseKey
               JOIN Entries e ON e.EntryKey = s.EntryKey
               JOIN LexicalReferenceTexts l ON l.LexicalReferenceTextKey = e.LexicalReferenceTextKey
               JOIN Languages lang ON lang.LanguageKey = s.LanguageKey
               WHERE l.Id = ? AND lang.BCP47Code = ?''',
            (name, LANGUAGE),
        ):
            senses[sense_id].add((book, chapter, verse, word))
        return senses, entry_ids
    finally:
        db.close()


def totals_of(db_path, name):
    """Entries, lexical senses (ID ending 000) and distinct word positions of a database."""
    senses, entry_ids = load_database(db_path, name)
    positions = set()
    for occurrences in senses.values():
        positions |= occurrences
    return {
        'entries': len(entry_ids),
        'lexical senses': sum(1 for sense_id in senses if sense_id.endswith('000')),
        'distinct word positions': len(positions),
    }


def sample(items):
    shown = sorted(items)[:SAMPLE_SIZE]
    more = len(items) - len(shown)
    return ', '.join(str(i) for i in shown) + (f' (and {more} more)' if more > 0 else '')


def check_senses_and_occurrences(db_path, lexicon_root):
    failures = []
    for name in DICTIONARIES:
        expected, expected_entries, stats = expected_from_lexicon(lexicon_root, name)
        actual, actual_entries = load_database(db_path, name)

        missing = set(expected) - set(actual)
        extra = set(actual) - set(expected)
        not_lexical = [sense_id for sense_id in actual if not sense_id.endswith('000')]
        entries_missing = expected_entries - actual_entries
        entries_extra = actual_entries - expected_entries
        problems = []
        if not expected:
            problems.append(
                f'the lexicon rules yield no senses for {name}; is --lexicon {lexicon_root} the '
                f'marble-lexicon checkout?'
            )
        if missing:
            problems.append(f'{len(missing)} expected senses missing from the database: {sample(missing)}')
        if extra:
            problems.append(f'{len(extra)} senses in the database that the rules exclude: {sample(extra)}')
        if not_lexical:
            problems.append(f'{len(not_lexical)} sense IDs do not end in 000: {sample(not_lexical)}')
        if entries_missing:
            problems.append(f'{len(entries_missing)} expected entries missing: {sample(entries_missing)}')
        if entries_extra:
            problems.append(f'{len(entries_extra)} unexpected entries: {sample(entries_extra)}')
        print(
            f'[check 1 senses] {name}: expected {len(expected)} senses / {len(expected_entries)} entries, '
            f'database {len(actual)} / {len(actual_entries)}: {"FAIL" if problems else "ok"}'
        )
        print('    lexicon rules excluded: ' + ', '.join(f'{k} {v}' for k, v in sorted(stats.items())))
        for problem in problems:
            print(f'    {problem}')
            failures.append(f'check 1 {name}: {problem}')

        wrong = []
        expected_total = actual_total = 0
        for sense_id, want in expected.items():
            have = actual.get(sense_id)
            if have is None:
                continue
            expected_total += len(want)
            actual_total += len(have)
            if want != have:
                wrong.append((sense_id, len(want - have), len(have - want)))
        print(
            f'[check 2 occurrences] {name}: expected {expected_total}, database {actual_total}, '
            f'senses that differ {len(wrong)}: {"FAIL" if wrong else "ok"}'
        )
        for sense_id, lost, gained in sorted(wrong)[:SAMPLE_SIZE]:
            line = f'sense {sense_id}: {lost} occurrences missing, {gained} unexpected'
            print(f'    {line}')
        if wrong:
            failures.append(
                f'check 2 {name}: {len(wrong)} senses have the wrong occurrences, e.g. '
                + sample([w[0] for w in wrong])
            )
    return failures


def check_previous(db_path, previous_path):
    failures = []
    for name in DICTIONARIES:
        new = totals_of(db_path, name)
        old = totals_of(previous_path, name)
        for metric, old_value in old.items():
            new_value = new[metric]
            # A previous total of 0 (or a dictionary missing from the previous database) gives
            # nothing to compare with, which must not pass as "no drop"
            empty = old_value == 0
            change = (new_value - old_value) / old_value if old_value else 0.0
            drop = not empty and new_value < old_value * (1 - MAX_DROP_FRACTION)
            print(
                f'[check 3 totals] {name} {metric}: previous {old_value}, new {new_value} '
                f'({change:+.1%}): {"FAIL" if drop or empty else "ok"}'
            )
            if empty:
                failures.append(
                    f'check 3 {name}: the previous database has no {metric}, so there is nothing '
                    f'to compare with'
                )
            elif drop:
                failures.append(
                    f'check 3 {name}: {metric} dropped from {old_value} to {new_value} '
                    f'(more than {MAX_DROP_FRACTION:.0%})'
                )
    return failures


def check_links(db_path, links_dir, lexicon_root):
    """Informational: compares database sense occurrences with the published lexical links."""
    # (book, chapter, verse, word, lemma, position) where position is the 3-digit base form index
    # plus the 3-digit index of the meaning among all of the base form's LEXMeanings, from 000.
    links = {name: set() for name in DICTIONARIES}
    for path in glob.glob(os.path.join(links_dir, 'MARBLELinks-*.XML')):
        for marble_link in ET.parse(path).getroot().iter('MARBLELink'):
            word_id = marble_link.get('Id') or ''
            for link in marble_link.iter('LexicalLink'):
                parts = (link.text or '').strip().split(':')
                if parts[0] not in links or len(parts) < 3 or len(word_id) != 14:
                    continue
                if int(word_id[13]) % 2 == 1:
                    continue
                links[parts[0]].add(
                    (int(word_id[:3]), int(word_id[3:6]), int(word_id[6:9]),
                     int(word_id[11:]) // 2, parts[1], parts[2])
                )
    for name in DICTIONARIES:
        positions = {}
        for path in lexicon_files(lexicon_root, name):
            for entry in ET.parse(path).getroot().iter('Lexicon_Entry'):
                entry_id = (entry.get('Id') or '')[:6]
                for base_form_index, base_form in enumerate(entry.findall('BaseForms/BaseForm')):
                    for meaning_index, meaning in enumerate(
                            base_form.findall('LEXMeanings/LEXMeaning')):
                        positions[entry_id + (meaning.get('Id') or '')[-9:]] = (
                            entry.get('Lemma'), f'{base_form_index:03d}{meaning_index:03d}')
        actual, _ = load_database(db_path, name)
        in_db = set()
        for sense_id, occurrences in actual.items():
            lemma, position = positions.get(sense_id, (None, None))
            if lemma is None:
                continue
            for book, chapter, verse, word in occurrences:
                in_db.add((book, chapter, verse, word, lemma, position))
        both = len(in_db & links[name])
        db_only = len(in_db - links[name])
        links_only = len(links[name] - in_db)
        state = 'in step' if db_only == 0 and links_only == 0 else 'drift'
        print(
            f'[check 4 links, informational] {name}: matching {both}, database only {db_only}, '
            f'links only {links_only}: {state}'
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--db', required=True, help='the built english.db')
    parser.add_argument('--lexicon', required=True, help='the marble-lexicon checkout')
    parser.add_argument('--links', help='marble-indexes/Full, for the informational links check')
    parser.add_argument('--previous-db', help='the currently published database, for check 3')
    args = parser.parse_args()

    failures = check_senses_and_occurrences(args.db, args.lexicon)
    if args.previous_db:
        failures += check_previous(args.db, args.previous_db)
    if args.links:
        check_links(args.db, args.links, args.lexicon)

    if failures:
        print('\nFAILED:')
        for failure in failures:
            print(f'  {failure}')
        return 1
    print('\nAll checks passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

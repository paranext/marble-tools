"""Tests for verify_english_db.py, using only the standard library.

Run from the repository root: python3 -m unittest discover -s scripts -p 'test_*.py'
"""
import contextlib
import importlib.util
import io
import os
import sqlite3
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

# Load the script by path so the test also works when the script directory is not on sys.path
_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify_english_db.py')
_spec = importlib.util.spec_from_file_location('verify_english_db', _SCRIPT)
verify = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify)

# Position of the first word of Luke 1:1, as the 14 digits BBBCCCVVVPPWWW (word 1 is stored as 02)
LUKE_1_1_WORD_1 = '04200100100002'
LUKE_1_1_WORD_1_POSITION = (42, 1, 1, 1)


def quiet(function, *args):
    """Calls a check, discarding what it prints"""
    with contextlib.redirect_stdout(io.StringIO()):
        return function(*args)


def lexicon_entry(entry_number, meanings, version=3):
    """A Lexicon_Entry; each meaning is (meaning Id, attributes, [LEXReference], definition)"""
    meaning_xml = ''.join(
        f'''<LEXMeaning Id="{meaning_id}" {attributes}>
              <LEXReferences>{''.join(f'<LEXReference>{r}</LEXReference>' for r in references)}</LEXReferences>
              <LEXSenses><LEXSense LanguageCode="en">
                <DefinitionShort>{definition}</DefinitionShort>
              </LEXSense></LEXSenses>
              <CONMeanings/>
            </LEXMeaning>'''
        for meaning_id, attributes, references, definition in meanings
    )
    return f'''<Lexicon_Entry Id="{entry_number:06d}000000000" Lemma="lemma{entry_number}" Version="{version}">
      <BaseForms><BaseForm Id="{entry_number:06d}001000000">
        <LEXMeanings>{meaning_xml}</LEXMeanings>
      </BaseForm></BaseForms>
    </Lexicon_Entry>'''


def write_lexicon(root, name, entries):
    directory = os.path.join(root, name)
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, f'{name}-01.XML'), 'w', encoding='utf-8') as file:
        file.write(f'<Lexicon>{"".join(entries)}</Lexicon>')


def create_database(path, senses_by_dictionary):
    """Creates just the tables and columns the script reads.

    senses_by_dictionary maps a dictionary name to a list of
    (entry Id, sense Id, [(book, chapter, verse, word)]) in language 'en'.
    """
    db = sqlite3.connect(path)
    db.executescript(
        '''
        CREATE TABLE LexicalReferenceTexts (LexicalReferenceTextKey INTEGER PRIMARY KEY, Id TEXT);
        CREATE TABLE Languages (LanguageKey INTEGER PRIMARY KEY, BCP47Code TEXT);
        CREATE TABLE Entries (EntryKey INTEGER PRIMARY KEY, Id TEXT, LexicalReferenceTextKey INTEGER);
        CREATE TABLE Senses (SenseKey INTEGER PRIMARY KEY, Id TEXT, EntryKey INTEGER, LanguageKey INTEGER);
        CREATE TABLE SenseOccurrences (
          SenseKey INTEGER, BookNum INTEGER, ChapterNum INTEGER, VerseNum INTEGER, WordNum INTEGER);
        INSERT INTO Languages VALUES (1, 'en');
        '''
    )
    entry_keys = {}
    for text_key, (name, senses) in enumerate(senses_by_dictionary.items(), start=1):
        db.execute('INSERT INTO LexicalReferenceTexts VALUES (?, ?)', (text_key, name))
        for entry_id, sense_id, occurrences in senses:
            if (name, entry_id) not in entry_keys:
                cursor = db.execute(
                    'INSERT INTO Entries (Id, LexicalReferenceTextKey) VALUES (?, ?)',
                    (entry_id, text_key),
                )
                entry_keys[(name, entry_id)] = cursor.lastrowid
            cursor = db.execute(
                'INSERT INTO Senses (Id, EntryKey, LanguageKey) VALUES (?, ?, 1)',
                (sense_id, entry_keys[(name, entry_id)]),
            )
            db.executemany(
                'INSERT INTO SenseOccurrences VALUES (?, ?, ?, ?, ?)',
                [(cursor.lastrowid, *occurrence) for occurrence in occurrences],
            )
    db.commit()
    db.close()


class OccurrencesOfTests(unittest.TestCase):
    def test_reduces_a_reference_to_book_chapter_verse_and_word(self):
        self.assertEqual(
            verify.occurrences_of([LUKE_1_1_WORD_1]), {LUKE_1_1_WORD_1_POSITION}
        )

    def test_the_word_number_is_the_last_three_digits_divided_by_two(self):
        self.assertEqual(verify.occurrences_of(['04200100100014']), {(42, 1, 1, 7)})

    def test_skips_references_with_an_odd_last_digit(self):
        self.assertEqual(verify.occurrences_of(['04200100100003']), set())

    def test_skips_word_zero(self):
        self.assertEqual(verify.occurrences_of(['04200100100000']), set())

    def test_counts_a_repeated_position_once(self):
        self.assertEqual(
            verify.occurrences_of([LUKE_1_1_WORD_1, LUKE_1_1_WORD_1 + '{N:001}', ' ' + LUKE_1_1_WORD_1]),
            {LUKE_1_1_WORD_1_POSITION},
        )

    def test_ignores_everything_after_the_first_14_digits(self):
        self.assertEqual(
            verify.occurrences_of(['04200100100004{N:001}']), {(42, 1, 1, 2)}
        )

    def test_rejects_a_reference_that_is_not_14_digits(self):
        with self.assertRaises(SystemExit) as raised:
            verify.occurrences_of(['0420010010'])
        self.assertIn('0420010010', str(raised.exception))
        with self.assertRaises(SystemExit):
            verify.occurrences_of(['0420010010000x'])


class CheckPreviousTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def database(self, name, sdbg_count, sdbh_count=None):
        """A database with that many entries, each with one lexical sense and its own position"""
        sdbh_count = sdbg_count if sdbh_count is None else sdbh_count
        path = os.path.join(self.temp.name, name)
        create_database(
            path,
            {
                dictionary: [
                    (f'{i:06d}', f'{i:06d}001001000', [(42, 1, i, 1)])
                    for i in range(1, count + 1)
                ]
                for dictionary, count in (('SDBG', sdbg_count), ('SDBH', sdbh_count))
            },
        )
        return path

    def test_passes_when_totals_are_unchanged(self):
        failures = quiet(
            verify.check_previous, self.database('new.db', 100), self.database('old.db', 100)
        )
        self.assertEqual(failures, [])

    def test_passes_when_a_total_grows(self):
        failures = quiet(
            verify.check_previous, self.database('new.db', 120), self.database('old.db', 100)
        )
        self.assertEqual(failures, [])

    def test_passes_a_drop_of_exactly_the_allowed_fraction(self):
        # 100 -> 98 is a 2% drop, which is not more than MAX_DROP_FRACTION
        failures = quiet(
            verify.check_previous, self.database('new.db', 98), self.database('old.db', 100)
        )
        self.assertEqual(failures, [])

    def test_fails_a_drop_just_over_the_allowed_fraction(self):
        failures = quiet(
            verify.check_previous, self.database('new.db', 97), self.database('old.db', 100)
        )
        self.assertTrue(any('SDBG' in f and 'dropped from 100 to 97' in f for f in failures))
        self.assertTrue(any('SDBH' in f and 'dropped from 100 to 97' in f for f in failures))

    def test_names_only_the_dictionary_that_dropped(self):
        failures = quiet(
            verify.check_previous,
            self.database('new.db', 100, 50),
            self.database('old.db', 100, 100),
        )
        self.assertTrue(failures)
        self.assertTrue(all('SDBH' in failure for failure in failures))

    def test_fails_when_the_previous_database_has_nothing_to_compare_with(self):
        failures = quiet(
            verify.check_previous, self.database('new.db', 10), self.database('old.db', 10, 0)
        )
        self.assertTrue(any('SDBH' in f and 'nothing to compare with' in f for f in failures))
        self.assertFalse(any('SDBG' in f for f in failures))


class CheckSensesAndOccurrencesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.lexicon = os.path.join(self.temp.name, 'lexicon')
        self.db_path = os.path.join(self.temp.name, 'english.db')

    def lexicon_with(self, sdbh_meanings, sdbh_version=3):
        write_lexicon(
            self.lexicon,
            'SDBG',
            [lexicon_entry(1, [('000001001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'g')])],
        )
        write_lexicon(self.lexicon, 'SDBH', [lexicon_entry(2, sdbh_meanings, sdbh_version)])

    def check(self, senses_by_dictionary):
        create_database(self.db_path, senses_by_dictionary)
        return quiet(verify.check_senses_and_occurrences, self.db_path, self.lexicon)

    GREEK_SENSE = ('000001', '000001001001000', [LUKE_1_1_WORD_1_POSITION])

    def test_returns_no_failures_when_the_database_matches(self):
        self.lexicon_with([('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h')])

        failures = self.check(
            {
                'SDBG': [self.GREEK_SENSE],
                'SDBH': [('000002', '000002001001000', [LUKE_1_1_WORD_1_POSITION])],
            }
        )

        self.assertEqual(failures, [])

    def test_fails_when_an_expected_sense_is_missing_from_the_database(self):
        self.lexicon_with([('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h')])

        failures = self.check({'SDBG': [self.GREEK_SENSE], 'SDBH': []})

        self.assertTrue(
            any('SDBH' in f and 'expected senses missing' in f and '000002001001000' in f for f in failures)
        )
        self.assertFalse(any('SDBG' in f for f in failures))

    def test_fails_when_the_database_has_a_sense_the_rules_exclude(self):
        # An SDBH meaning marked N is left out, so having it in the database is an error
        self.lexicon_with(
            [
                ('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h'),
                ('000002001002000', 'IsBiblicalTerm="N"', [LUKE_1_1_WORD_1], 'h'),
            ]
        )

        failures = self.check(
            {
                'SDBG': [self.GREEK_SENSE],
                'SDBH': [
                    ('000002', '000002001001000', [LUKE_1_1_WORD_1_POSITION]),
                    ('000002', '000002001002000', [LUKE_1_1_WORD_1_POSITION]),
                ],
            }
        )

        self.assertTrue(any('SDBH' in f and 'rules exclude' in f and '000002001002000' in f for f in failures))

    def test_fails_when_a_sense_has_the_wrong_occurrences(self):
        self.lexicon_with([('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h')])

        failures = self.check(
            {
                'SDBG': [self.GREEK_SENSE],
                'SDBH': [('000002', '000002001001000', [(42, 1, 1, 2)])],
            }
        )

        self.assertTrue(any('check 2 SDBH' in f and '000002001001000' in f for f in failures))

    def test_an_sdbg_meaning_marked_n_expects_no_occurrences(self):
        write_lexicon(
            self.lexicon,
            'SDBG',
            [lexicon_entry(1, [('000001001001000', 'IsBiblicalTerm="N"', [LUKE_1_1_WORD_1], 'g')])],
        )
        write_lexicon(
            self.lexicon,
            'SDBH',
            [lexicon_entry(2, [('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h')])],
        )

        failures = self.check(
            {
                'SDBG': [('000001', '000001001001000', [])],
                'SDBH': [('000002', '000002001001000', [LUKE_1_1_WORD_1_POSITION])],
            }
        )

        self.assertEqual(failures, [])

    def write_sdbh(self, entries):
        write_lexicon(
            self.lexicon,
            'SDBG',
            [lexicon_entry(1, [('000001001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'g')])],
        )
        write_lexicon(self.lexicon, 'SDBH', entries)

    HEBREW_SENSE = ('000002', '000002001001000', [LUKE_1_1_WORD_1_POSITION])

    def test_leaves_out_an_sdbh_entry_below_version_3(self):
        self.write_sdbh(
            [
                lexicon_entry(2, [('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h')]),
                lexicon_entry(
                    3, [('000003001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h')], version=2
                ),
            ]
        )

        failures = self.check(
            {
                'SDBG': [self.GREEK_SENSE],
                'SDBH': [self.HEBREW_SENSE, ('000003', '000003001001000', [LUKE_1_1_WORD_1_POSITION])],
            }
        )

        self.assertTrue(any('rules exclude' in f and '000003001001000' in f for f in failures))
        self.assertTrue(any('unexpected entries' in f and '000003' in f for f in failures))

    def test_leaves_out_a_sense_with_no_definition_and_no_glosses(self):
        self.write_sdbh(
            [
                lexicon_entry(
                    2,
                    [
                        ('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h'),
                        ('000002001002000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], ''),
                    ],
                )
            ]
        )

        self.assertEqual(self.check({'SDBG': [self.GREEK_SENSE], 'SDBH': [self.HEBREW_SENSE]}), [])

    def test_fails_on_a_sense_id_that_does_not_end_in_000(self):
        self.write_sdbh(
            [lexicon_entry(2, [('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h')])]
        )

        failures = self.check(
            {
                'SDBG': [self.GREEK_SENSE],
                'SDBH': [self.HEBREW_SENSE, ('000002', '000002001001001', [])],
            }
        )

        self.assertTrue(any('do not end in 000' in f and '000002001001001' in f for f in failures))

    def test_fails_when_an_expected_entry_is_missing(self):
        self.write_sdbh(
            [lexicon_entry(2, [('000002001001000', 'IsBiblicalTerm="Y"', [LUKE_1_1_WORD_1], 'h')])]
        )

        failures = self.check({'SDBG': [self.GREEK_SENSE], 'SDBH': []})

        self.assertTrue(any('expected entries missing' in f and '000002' in f for f in failures))

    def test_fails_when_the_lexicon_yields_no_senses(self):
        # A wrong --lexicon path must not pass as an empty match of an empty database
        failures = self.check({'SDBG': [], 'SDBH': []})

        self.assertTrue(any('yield no senses' in f for f in failures))


if __name__ == '__main__':
    unittest.main()

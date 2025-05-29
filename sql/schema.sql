-- Lexicon schema for SQLite database

-- Main table for lexical reference texts
CREATE TABLE IF NOT EXISTS LexicalReferenceTexts (
  LexicalReferenceTextKey INTEGER PRIMARY KEY,
  Id TEXT NOT NULL, -- Original ID from XML
  Version TEXT NOT NULL,
  UNIQUE (Id, Version)
);

-- Table for lexical entries
CREATE TABLE IF NOT EXISTS Entries (
  EntryKey INTEGER PRIMARY KEY,
  LexicalReferenceTextKey INTEGER NOT NULL,
  Id TEXT NOT NULL, -- Original ID from XML
  Lemma TEXT NOT NULL, -- Word/term
  UNIQUE (Id, LexicalReferenceTextKey),
  UNIQUE (Lemma, LexicalReferenceTextKey),
  FOREIGN KEY (LexicalReferenceTextKey) REFERENCES LexicalReferenceTexts (LexicalReferenceTextKey)
);

-- Table for languages using BCP47 codes
CREATE TABLE IF NOT EXISTS Languages (
  LanguageKey INTEGER PRIMARY KEY,
  BCP47Code TEXT NOT NULL UNIQUE -- ISO language code in BCP47 format
);

-- Table for senses (meanings of entries)
CREATE TABLE IF NOT EXISTS Senses (
  SenseKey INTEGER PRIMARY KEY,
  EntryKey INTEGER NOT NULL,
  LanguageKey INTEGER NOT NULL,
  Id TEXT NOT NULL, -- Original ID from XML
  Definition TEXT,
  UNIQUE (Id, EntryKey, LanguageKey),
  FOREIGN KEY (EntryKey) REFERENCES Entries (EntryKey),
  FOREIGN KEY (LanguageKey) REFERENCES Languages (LanguageKey)
);

-- Table for glosses (short translations/explanations) of senses
CREATE TABLE IF NOT EXISTS Glosses (
  SenseKey INTEGER NOT NULL,
  Gloss TEXT NOT NULL,
  PRIMARY KEY (SenseKey, Gloss),
  FOREIGN KEY (SenseKey) REFERENCES Senses (SenseKey)
) WITHOUT ROWID;

-- Table for Corpora references
CREATE TABLE IF NOT EXISTS Corpora (
  CorpusKey INTEGER PRIMARY KEY,
  Id TEXT NOT NULL UNIQUE
);

-- Table for domain taxonomies
CREATE TABLE IF NOT EXISTS Taxonomies (
  TaxonomyKey INTEGER PRIMARY KEY,
  Id TEXT NOT NULL UNIQUE
);

-- Table for taxonomy domains (categories within taxonomies)
CREATE TABLE IF NOT EXISTS TaxonomyDomains (
  TaxonomyDomainKey INTEGER PRIMARY KEY,
  TaxonomyKey INTEGER NOT NULL,
  ParentTaxonomyDomainKey INTEGER,
  DomainCode TEXT NOT NULL,
  UNIQUE (TaxonomyKey, DomainCode),
  FOREIGN KEY (TaxonomyKey) REFERENCES Taxonomies (TaxonomyKey),
  FOREIGN KEY (ParentTaxonomyDomainKey) REFERENCES TaxonomyDomains (TaxonomyDomainKey)
);

-- Table for domain codes associated with taxonomies
CREATE TABLE IF NOT EXISTS TaxonomyDomainLabels (
  TaxonomyDomainKey INTEGER NOT NULL,
  LanguageKey INTEGER NOT NULL,
  Label TEXT NOT NULL,
  PRIMARY KEY (TaxonomyDomainKey, LanguageKey),
  FOREIGN KEY (TaxonomyDomainKey) REFERENCES TaxonomyDomains (TaxonomyDomainKey)
) WITHOUT ROWID;

-- Table for Strongs codes associated with entries
CREATE TABLE IF NOT EXISTS EntryStrongsCodes (
  EntryKey INTEGER NOT NULL,
  StrongsCode TEXT NOT NULL,
  PRIMARY KEY (EntryKey, StrongsCode),
  FOREIGN KEY (EntryKey) REFERENCES Entries (EntryKey)
) WITHOUT ROWID;

-- Table for Strongs codes associated with senses
CREATE TABLE IF NOT EXISTS SenseStrongsCodes (
  SenseKey INTEGER NOT NULL,
  StrongsCode TEXT NOT NULL,
  PRIMARY KEY (SenseKey, StrongsCode),
  FOREIGN KEY (SenseKey) REFERENCES Senses (SenseKey)
) WITHOUT ROWID;

-- Table for occurrences associated with entries
CREATE TABLE IF NOT EXISTS EntryOccurrences (
  EntryKey INTEGER NOT NULL,
  CorpusKey INTEGER NOT NULL,
  BookNum INTEGER NOT NULL,
  ChapterNum INTEGER NOT NULL,
  VerseNum INTEGER NOT NULL,
  WordNum INTEGER NOT NULL,
  PRIMARY KEY (
    EntryKey,
    CorpusKey,
    BookNum,
    ChapterNum,
    VerseNum,
    WordNum
  ),
  FOREIGN KEY (EntryKey) REFERENCES Entries (EntryKey),
  FOREIGN KEY (CorpusKey) REFERENCES Corpora (CorpusKey)
) WITHOUT ROWID;

-- Table for occurrences associated with senses
CREATE TABLE IF NOT EXISTS SenseOccurrences (
  SenseKey INTEGER NOT NULL,
  CorpusKey INTEGER NOT NULL,
  BookNum INTEGER NOT NULL,
  ChapterNum INTEGER NOT NULL,
  VerseNum INTEGER NOT NULL,
  WordNum INTEGER NOT NULL,
  PRIMARY KEY (
    SenseKey,
    CorpusKey,
    BookNum,
    ChapterNum,
    VerseNum,
    WordNum
  ),
  FOREIGN KEY (SenseKey) REFERENCES Senses (SenseKey),
  FOREIGN KEY (CorpusKey) REFERENCES Corpora (CorpusKey)
) WITHOUT ROWID;

-- Table for domains associated with entries
CREATE TABLE IF NOT EXISTS EntryDomains (
  EntryKey INTEGER NOT NULL,
  TaxonomyKey INTEGER NOT NULL,
  DomainCode TEXT NOT NULL, -- Can't enforce foreign key constraint as taxonomy domain may not exist for lexicon language
  PRIMARY KEY (EntryKey, TaxonomyKey, DomainCode),
  FOREIGN KEY (EntryKey) REFERENCES Entries (EntryKey),
  FOREIGN KEY (TaxonomyKey) REFERENCES Taxonomies (TaxonomyKey)
) WITHOUT ROWID;

-- Table for domains associated with senses
CREATE TABLE IF NOT EXISTS SenseDomains (
  SenseKey INTEGER NOT NULL,
  TaxonomyKey INTEGER NOT NULL,
  DomainCode TEXT NOT NULL, -- Can't enforce foreign key constraint as taxonomy domain may not exist for lexicon language
  PRIMARY KEY (SenseKey, TaxonomyKey, DomainCode),
  FOREIGN KEY (SenseKey) REFERENCES Senses (SenseKey),
  FOREIGN KEY (TaxonomyKey) REFERENCES Taxonomies (TaxonomyKey)
) WITHOUT ROWID;

-- Add indexes only for columns that will be frequently searched but aren't already
-- indexed as part of a UNIQUE constraint or PRIMARY KEY
CREATE INDEX IF NOT EXISTS idx_entries_lemma ON Entries (Lemma);
CREATE INDEX IF NOT EXISTS idx_entryoccurrences_entry ON EntryOccurrences (EntryKey);
CREATE INDEX IF NOT EXISTS idx_entryoccurrences_reference ON EntryOccurrences (BookNum, ChapterNum, VerseNum);
CREATE INDEX IF NOT EXISTS idx_senseoccurrences_sense ON SenseOccurrences (SenseKey);
CREATE INDEX IF NOT EXISTS idx_senseoccurrences_reference ON SenseOccurrences (BookNum, ChapterNum, VerseNum);

-- Create a view for easy access to sense occurrence data with relevant joins
CREATE VIEW IF NOT EXISTS SenseOccurrenceView AS
SELECT
  s.SenseKey,
  s.Id AS SenseId,
  lrt.Id AS LexiconId,
  lrt.LexicalReferenceTextKey,
  lrt.Version as LexiconVersion,
  c.Id AS SourceTextId,
  e.Lemma,
  e.Id AS EntryId,
  e.EntryKey,
  s.Definition,
  so.BookNum,
  so.ChapterNum,
  so.VerseNum,
  so.WordNum,
  l.BCP47Code
FROM
  Senses s
  JOIN Entries e ON s.EntryKey = e.EntryKey
  JOIN LexicalReferenceTexts lrt ON e.LexicalReferenceTextKey = lrt.LexicalReferenceTextKey
  JOIN Languages l ON s.LanguageKey = l.LanguageKey
  LEFT JOIN SenseOccurrences so ON s.SenseKey = so.SenseKey
  LEFT JOIN Corpora c ON so.CorpusKey = c.CorpusKey;

-- Create a view for easy access to sense domain data with relevant joins
CREATE VIEW IF NOT EXISTS SenseDomainView AS
SELECT
  sd.SenseKey,
  t.Id AS TaxonomyId,
  sd.DomainCode,
  tdl.Label,
  l.BCP47Code
FROM
  SenseDomains sd
  JOIN Taxonomies t ON sd.TaxonomyKey = t.TaxonomyKey
  LEFT JOIN TaxonomyDomains td ON sd.DomainCode = td.DomainCode AND sd.TaxonomyKey = td.TaxonomyKey
  LEFT JOIN TaxonomyDomainLabels tdl ON td.TaxonomyDomainKey = tdl.TaxonomyDomainKey
  LEFT JOIN Languages l ON tdl.LanguageKey = l.LanguageKey;

-- Create a view for easy access to entry occurrence data with relevant joins
CREATE VIEW IF NOT EXISTS EntryOccurrenceView AS
SELECT
  e.EntryKey,
  e.Id AS EntryId,
  lrt.Id AS LexiconId,
  lrt.LexicalReferenceTextKey,
  lrt.Version as LexiconVersion,
  e.Lemma,
  c.Id AS SourceTextId,
  eo.BookNum,
  eo.ChapterNum,
  eo.VerseNum,
  eo.WordNum
FROM
  Entries e
  JOIN LexicalReferenceTexts lrt ON e.LexicalReferenceTextKey = lrt.LexicalReferenceTextKey
  LEFT JOIN EntryOccurrences eo ON e.EntryKey = eo.EntryKey
  LEFT JOIN Corpora c ON eo.CorpusKey = c.CorpusKey;

-- Create a view for easy access to entry domain data with relevant joins
CREATE VIEW IF NOT EXISTS EntryDomainView AS
SELECT
    ed.EntryKey,
    t.Id AS TaxonomyId,
    ed.DomainCode,
    tdl.Label,
    l.BCP47Code
  FROM
    EntryDomains ed
    JOIN Taxonomies t ON ed.TaxonomyKey = t.TaxonomyKey
    LEFT JOIN TaxonomyDomains td ON ed.DomainCode = td.DomainCode AND ed.TaxonomyKey = td.TaxonomyKey
    LEFT JOIN TaxonomyDomainLabels tdl ON td.TaxonomyDomainKey = tdl.TaxonomyDomainKey
    LEFT JOIN Languages l ON tdl.LanguageKey = l.LanguageKey;

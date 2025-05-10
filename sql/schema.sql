-- Lexicon schema for SQLite database
-- This schema is designed to support Unicode text in multiple scripts and languages
-- All TEXT columns should properly store any Unicode character
-- SQLite natively supports UTF-8 and Unicode, but we add comments to ensure awareness
-- for all implementers and database users
-- Main table for lexical reference texts
CREATE TABLE IF NOT EXISTS LexicalReferenceTexts (
  Key INTEGER PRIMARY KEY,
  Id TEXT NOT NULL, -- Original ID from XML, may contain international characters
  Version TEXT NOT NULL, -- Version information, typically a date/timestamp
  LanguageBCP47 TEXT NOT NULL, -- ISO language code
  UNIQUE (Id, Version, LanguageBCP47) -- Ensure this combination is unique
);

-- Table for lexical entries
CREATE TABLE IF NOT EXISTS Entries (
  Key INTEGER PRIMARY KEY,
  Id TEXT NOT NULL, -- Original ID from XML
  Lemma TEXT NOT NULL, -- Word/term in potentially any script or language
  LexicalReferenceTextKey INTEGER NOT NULL,
  UNIQUE (Lemma, LexicalReferenceTextKey), -- Ensure this combination is unique
  UNIQUE (Id, LexicalReferenceTextKey), -- Ensure this combination is unique
  FOREIGN KEY (LexicalReferenceTextKey) REFERENCES LexicalReferenceTexts (Key)
);

-- Table for Strongs codes associated with entries
CREATE TABLE IF NOT EXISTS StrongsCodes (
  Key INTEGER PRIMARY KEY,
  EntryKey INTEGER NOT NULL,
  Code TEXT NOT NULL, -- Strongs code reference
  UNIQUE (EntryKey, Code),
  FOREIGN KEY (EntryKey) REFERENCES Entries (Key)
);

-- Table for senses (meanings of entries)
CREATE TABLE IF NOT EXISTS Senses (
  Key INTEGER PRIMARY KEY,
  Id TEXT NOT NULL, -- Original ID from XML
  EntryKey INTEGER NOT NULL,
  Definition TEXT, -- Definition text which may contain any Unicode character
  UNIQUE (Id, EntryKey), -- Ensure this combination is unique
  FOREIGN KEY (EntryKey) REFERENCES Entries (Key)
);

-- Table for glosses (short translations/explanations) of senses
CREATE TABLE IF NOT EXISTS Glosses (
  Key INTEGER PRIMARY KEY,
  SenseKey INTEGER NOT NULL,
  Gloss TEXT NOT NULL, -- Short explanation that may contain any Unicode character
  UNIQUE (SenseKey, Gloss), -- Ensure this combination is unique
  FOREIGN KEY (SenseKey) REFERENCES Senses (Key)
);

-- Table for Corpora references
CREATE TABLE IF NOT EXISTS Corpora (
  Key INTEGER PRIMARY KEY,
  Id TEXT NOT NULL UNIQUE -- Original ID from XML
);

-- Table for occurrences associated with entries
-- This table handles occurrences linked to entries
CREATE TABLE IF NOT EXISTS EntryOccurrences (
  Key INTEGER PRIMARY KEY,
  EntryKey INTEGER NOT NULL,
  CorpusKey INTEGER NOT NULL,
  BookId TEXT NOT NULL, -- Book code reference
  Chapter INTEGER NOT NULL, -- Chapter number
  Verse INTEGER NOT NULL, -- Verse number
  WordIndex INTEGER NOT NULL, -- Word index in the verse
  UNIQUE(EntryKey, CorpusKey, BookId, Chapter, Verse, WordIndex), -- Ensure this combination is unique
  FOREIGN KEY (EntryKey) REFERENCES Entries (Key),
  FOREIGN KEY (CorpusKey) REFERENCES Corpora (Key)
);

-- Table for occurrences associated with senses
-- This table handles occurrences linked to senses
CREATE TABLE IF NOT EXISTS SenseOccurrences (
  Key INTEGER PRIMARY KEY,
  SenseKey INTEGER NOT NULL,
  CorpusKey INTEGER NOT NULL,
  BookId TEXT NOT NULL, -- Book code reference
  Chapter INTEGER NOT NULL, -- Chapter number
  Verse INTEGER NOT NULL, -- Verse number
  WordIndex INTEGER NOT NULL, -- Word index in the verse
  UNIQUE(SenseKey, CorpusKey, BookId, Chapter, Verse, WordIndex), -- Ensure this combination is unique
  FOREIGN KEY (SenseKey) REFERENCES Senses (Key),
  FOREIGN KEY (CorpusKey) REFERENCES Corpora (Key)
);

-- Table for domain taxonomies
CREATE TABLE IF NOT EXISTS Taxonomies (
  Key INTEGER PRIMARY KEY,
  Id TEXT NOT NULL UNIQUE -- Original ID from XML
);

-- Table for domains associated with entries
CREATE TABLE IF NOT EXISTS EntryDomains (
  Key INTEGER PRIMARY KEY,
  EntryKey INTEGER NOT NULL,
  TaxonomyKey INTEGER NOT NULL,
  Code TEXT NOT NULL, -- Domain code
  Description TEXT, -- Description that may contain any Unicode character
  UNIQUE (EntryKey, TaxonomyKey, Code), -- Ensure this combination is unique
  FOREIGN KEY (EntryKey) REFERENCES Entries (Key),
  FOREIGN KEY (TaxonomyKey) REFERENCES Taxonomies (Key)
);

-- Table for domains associated with senses
CREATE TABLE IF NOT EXISTS SenseDomains (
  Key INTEGER PRIMARY KEY,
  SenseKey INTEGER NOT NULL,
  TaxonomyKey INTEGER NOT NULL,
  Code TEXT NOT NULL, -- Domain code
  Description TEXT, -- Description that may contain any Unicode character
  UNIQUE (SenseKey, TaxonomyKey, Code), -- Ensure this combination is unique
  FOREIGN KEY (SenseKey) REFERENCES Senses (Key),
  FOREIGN KEY (TaxonomyKey) REFERENCES Taxonomies (Key)
);

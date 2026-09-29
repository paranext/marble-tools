> This is a copy of Reinier de Blois's "Semantic Dictionaries - Structure" document. It is kept as written; see [Notes on semantic domains](#notes-on-semantic-domains) and [Notes on entries](#notes-on-entries) at the end for clarifications from Reinier and for how the current data differs.

### **SEMANTIC DICTIONARIES \- STRUCTURE**

The two UBS semantic dictionaries are available in both JSON and XML formats:

- Semantic Dictionary of Biblical Hebrew (SDBH)
- Semantic Dictionary of the Greek New Testament (SDBG or SDGNT)

There are four hierarchical levels in the data. Please take note of the following color coding:

- Black: both lexicons
- Blue: SDBH only
- Green: SDBG/SDGNT only
- Red: internal use only, unused or deprecated

These are all fields organized by hierarchic level:

- **Lexicon_Entry**, containing the following fields:

  - Attributes:

    - **Id** \- 6 digits representing the entry and 9 digits representing each level (base form index, lexical meaning index, contextual meaning index)
    - **Lemma**
    - **Version** \- use from version 3 only
    - **HasAramaic** \- entry occurs in Aramaic
    - **InLXX** \- entry is shared with LXX
    - **AlphaPos**

  - Arrays:

    - **AlternateLemmas** \- alternative lemma forms
    - **StrongCodes \- Strong’s numbers, e.g. A0003, H0004, G0005**
    - **Authors** \- name of main author of entry
    - **Contributors** \- names of contributing authors
    - **MainLinks \- links to articles pertaining to the entire entry**
    - **Notes** (see below)
    - **Localizations**
    - **Dates**
    - **BaseForms** (see below)

  - Elements:

    - **ContributorNote**

- **BaseForm**

  - Attributes:

    - **Id** \- 6 digits representing the entry and 9 digits representing each level (base form index, lexical meaning index, contextual meaning index)

  - Arrays:

    - **PartsofSpeech** \- encoded parts of speech
    - **Inflections** \- inflected or conjugated forms (see below)
    - **Constructs** \- analysis of elements of which this lemma is made up (see below)
    - **Etymologies**
    - **RelatedLemmas** \- related lemmas, consisting of a word, and sometimes a meaning
    - **RelatedNames** \- related names, consisting of a word, and sometimes a meaning
    - **MeaningsOfName** \- meaning of Hebrew name
    - **CrossReferences**
    - **BaseFormLinks** \- links to articles pertaining this base form
    - **LEXMeanings** (see below)

- **LEXMeaning** \- lexical meaning

  - Attributes:

    - **Id** \- 6 digits representing the entry and 9 digits representing each level (base form index, lexical meaning index, contextual meaning index)
    - **IsBiblicalTerm**
    - **EntryCode**
    - **Indent**

  - Arrays:

    - **LEXDomains** \- lexical semantic domains (for details, see below)
    - **LEXSubDomains** \- lexical semantic subdomains (for details, see below)
    - **LEXForms** \- parts of speech representing this lexical meaning
    - **LEXValencies** \- valency patterns
    - **LEXCollocations** \- collocations
    - **LEXSynonyms** \- synonymic forms
    - **LEXAntonyms** \- antonymic forms
    - **LEXCrossReferences**
    - **LEXSenses** \- a range of senses; one for each localization
    - **LEXIllustrations** \- see below
    - **LEXReferences** \- 14-digit Scripture references (BBBCCCVVVSSWWW), which can carry notes {N:001}
    - **LEXImages** \- links to images
    - **LEXVideos** \- links to video clips
    - **LEXCoordinates** \- geographical coordinates
    - **LEXCoreDomains** \- contextual semantic domains relating to all references; for details, see below
    - **CONMeanings** \- contextual meanings

- **CONMeaning** \- contextual meaning, mostly analogous to lexical meaning, tags starting with **CON** instead of **LEX**; one notable additional attribute:

  - Attributes:

    - **Type** \- type of contextual meaning:

      - **CON** \- regular contextual meaning, focus on contextual semantic domain
      - **GRM** \- grammatical contextual meaning, focus on collocation
      - **VAL** \- valency contextual meaning, focus on valency

- **Note** \- footnotes, called with markers such as {N:001}

  - Attributes:

    - **Caller** \- number of note, corresponding to callers such as {N:001}
    - **LanguageCode**
    - **LastEdited**
    - **LastEditedBy**

  - Arrays:

    - **References** \- 14-digit Scripture references (BBBCCCVVVSSWWW), which can carry notes, such as {N:001}

  - Elements:

    - **Content**

- **Sense**

  - Attributes:

    - **LanguageCode**
    - **LastEdited**
    - **LastEditedBy**

  - Elements

    - **DefinitionLong**
    - **DefinitionShort** \- can have embedded links, such as:
      - **Abbreviation**, e.g. {A:NIV}
      - **Domain**, e.g. {D:84.13}
      - **Lexical**, e.g. {L:this entry\<SDBH:other entry\>}
      - **Note**, e.g. {N:001}
      - **Scripture**, e.g. {S:00100100100002 0020030000006}
    - **Comments** \- with potentially same embedded links as above

  - Arrays:

    - **Glosses** \- can carry notes {N:001}

- **Semantic Domain**

  - Attributes:

    - **Code** \- numeric code representing the domain
    - **Source** \- source domain in an extension of meaning
    - **SourceCode** \- numeric code of the above

  - Text:

    - **Domain** \- main semantic domain label

  - Rendering:

    - Some domains have a source domain attribute specified; if desired, the domain can be displayed as **Source \> Domain**, signifying that **Domain** is an extension of the meaning of **Source**.

    - Some domain codes are prefixed by **001002** followed by a colon. This code represents the lexical semantic domain **Parts**.

      e.g. **001002:001003** can be displayed as **Parts: Vegetation**

    - Some domain codes contain a period at the beginning, the end, or in the middle. This is normally displayed as an **ellipsis**. Some examples:

      **089.056** is displayed as **Human … Divine** (signifying that an event has a divine actor and is affecting humans)

      **.089** is displayed as **…** **Human** (meaning that the event is affecting humans)

      **.056** is displayed as **Divine …** (meaning that an event has a divine actor)

    It is easy to consider all these details as unnecessary and superfluous. Note, however, that the primary value of these labels is that they make all these domains (and configurations of domains) searchable, to allow the user to do very meaningful searches. For example, a search for lexical domain **Speak** in combination with contextual domain configuration **Human \> Animal** would enable the user to locate passages like Balaam’s donkey speaking.

    Details about semantic domains, including their localization data, can be found in **SDBH-DOMAINS1.XML** and **SDBG-DOMAINS1.XML** (lexical semantic domains) and **SDBH-DOMAINS2.XML** (contextual semantic domains).

- **Inflection** \- inflected or conjugated form

  - Attributes:

    - **Lemma** \- identical to main entry lemma
    - **BaseFormIndex** \- refers to index base form

  - Arrays:

    - **Realizations** \- actual surface form in Greek text (e.g. ἤγαγον)
    - **Comments** \- with language code attribute

  - Elements:

    - **Form** \- abbreviated grammatical form (e.g. aor.)

- **Construct** \- lemma consists of different elements

  - Attributes:

    - **Lemma** \- identical to main entry lemma
    - **BaseFormIndex** \- refers to index base form

  - Arrays:

    - **WordMeaningSets** \- each consisting of a word element and (sometimes) an array of glosses

- **Illustration** \- an example from the source text with

- Attributes:

  - **Lemma** \- identical to main entry lemma
  - **EntryCode** \- refers the entry code of the Greek form
  - **Source** \- e.g. apparatus

- Arrays:

  - **ILLReferences** \- 14-digit Scripture references (BBBCCCVVVSSWWW), which can carry notes {N:001}
  - **ILLTranslations** \- an array of translations, each with a language code attribute and the translation as inner text

- Elements:

  - **ILLSourceText** \- (part of) a verse from the Greek source text featuring this lemma

---

## Notes on semantic domains

Not part of Reinier's document. These notes record later clarifications from Reinier and how the data in marble-lexicon (checked at commit 26d7112, 2026-09-28) differs from the rendering notes above.

### Relation markers

From Reinier:

- **A > B** marks an extension of meaning: a mapping from domain A to domain B. For example, **Human > Animal** marks contexts where animals engage in human activities, such as Balaam's donkey talking.
- **A … B** marks an event with an A agent and a B object. For example, **Human … Animal** marks events featuring a human agent and an animal object.
- Markers combine, for example **Human … Animal > Tool … Animal** (a trap seizes humans as if they were animals).

The first ellipsis example above ("**089.056** ... signifying that an event has a divine actor and is affecting humans") reads the other way round from this and from the **.089** and **.056** examples, which put the actor on the left. This is an open question for Reinier.

In the current data:

- The example codes above use older numbering. Human is now **084** and Divine is **051** in SDBH-DOMAINS2.XML.
- Extensions of meaning use the **Source** and **SourceCode** attributes, with only the extended-to domain as the text, e.g. `<CONDomain Code="051" Source="Human" SourceCode="084">Divine</CONDomain>`. The converter uses neither attribute.
- No extensions are written inline in the code (such as `002003002023>002001002006` for **Serve>Diligent**). The converter would keep the target domain.
- Relations are coded: in SDBH, 1,358 two-sided codes such as `084.051` (**Human … Divine**) and 1,844 one-sided codes such as `084.` (**Human …**). The converter keeps each coded domain but not the relation between them.

### Parts

From Reinier: Parts was a semantic domain of its own. **Parts: Trees** covered terms such as bark, branch and leaf, as opposed to **Trees**, which covers kinds of trees.

Reinier has since removed the **Parts:** prefix entirely. The current data has no `001002:` codes and no **Parts: X** domain text: former **Parts: X** domains are now plain **X** with X's own code, and body parts have their own domain, **Body Parts** (`001001005`). The rendering note above about `001002:` codes no longer applies.

### Codes and hierarchy

DOMAINS1 files hold the lexical domains and DOMAINS2 files hold the contextual domains. SDBG has only DOMAINS1. Codes are sequences of 3-digit segments. SDBH-DOMAINS1 codes are 3 to 15 digits long and SDBG-DOMAINS1 codes are 3 or 6 digits. SDBH-DOMAINS2 codes are all 3 digits, so it has no hierarchy.

The hierarchy follows from the codes: a domain's parent is its code minus the last 3 digits. In every snapshot checked, each parent was present in the same file, and **Level** always matched the segment count. **HasSubDomains** is wrong on several parents (e.g. 001001 Beings, 001002008 Vegetation, 003001017 Titles), so the converter builds the hierarchy from the codes and only warns when the flag disagrees.

Codes are positional, not stable identifiers. SDBH-DOMAINS2 lists its domains in roughly alphabetical order of their English labels. Inserting or renaming a domain therefore renumbers every domain after it. The lexicon entries are renumbered separately, sometimes later. Between the two, entries after the insertion point carry the code of a neighboring domain, while entries before it are still correct. This produced PT-4547. The database stores only the code for each sense, so a shifted code shows the wrong domain label to users.

### Domain text on senses

The text of a LEXDomain, LEXCoreDomain or CONDomain element is the English label that the author saw when tagging, whatever the language of the lexicon file. The converter uses this to check the codes. For each taxonomy, it compares every sense's domain text with the English label for its code, and fails the conversion if any disagree or have no code. At commit 26d7112, none disagree. At commit 018b05a, fewer than 0.25% disagreed in each taxonomy: small shifts where entries had not yet been renumbered after recent taxonomy edits. A snapshot with entries and taxonomy out of sync disagrees by tens of percent.

LEXCoreDomain uses the contextual taxonomy, like CONDomain.

### Localizations

Only some languages have domain labels: 7 in SDBH-DOMAINS1, 6 in SDBH-DOMAINS2 and 10 in SDBG-DOMAINS1. Output files for other languages have no taxonomy. SDBG-DOMAINS1 labels Indonesian with LanguageCode `in`, while the SDBG lexicon files use `id`, so the SDBG Indonesian output gets no taxonomy.

## Notes on entries

Not part of Reinier's document.

- From Reinier: SDBH entries with a **Version** below 3 are not ready and are excluded. Versions 3 and 4 have only the lexical analysis done, so their contextual meanings are ignored. Version 5 has both analyses. SDBG is complete, so its Version is ignored. As a result, some common SDBH words, such as עַל and כִּי, have no entry yet.
- **Lemma** text is not in Unicode normalization form C (NFC). Greek acute accents are the oxia characters (U+1F7x), and Hebrew marks are in a non-canonical order (e.g. dagesh or shin dot before the vowel). Normalize both sides before comparing with text typed or copied from elsewhere.

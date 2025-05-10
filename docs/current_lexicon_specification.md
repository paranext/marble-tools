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

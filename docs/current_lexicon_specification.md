# **SEMANTIC DICTIONARY STRUCTURE**

The hierarchical structure of the semantic dictionaries (SD) consists of 4 different levels:

* entries  
* base forms  
* lexical meanings  
* contextual meanings

At the entry level, we find the following fields:

* **Lexicon\_Entry** \- main entry

*Attributes*:

* **Id** \- a unique Id for each entry, which can be used for SDBG, but better to be ignored for SDBH until the lexicon is fully completed  
  * **Lemma** \- the lemma or citation form for this entry, to be used to look up an entry  
  * **Version** \- the version number (0-5) marking the level of completion of SDBH (3 \- lexical analysis completed; 5 \- contextual analysis completed); to be ignored for SDBG  
  * **hasAramaic** \- a true/false value indicating whether this entry includes Aramaic data  
  * **InLXX** \- SDBG only: a true/false value indicating whether this entry is found in the LXX corpus  
  * **AlphaPos** \- ignore

	*Elements*:

* **StrongCodes** \- one or more 4 digit Strong codes, preceded by a letter representing the language (H \- Hebrew; A \- Aramaic; G \- Greek)  
* **Authors** \- the full names of the main authors of the article  
* **Contributors** \- the full names of people who have contributed to this article by making substantial suggestions for improval that were implemented  
* **AlternateLemmas** \- alternate forms of the lemma that are known from other lexical resources  
* **MainLinks** \- links to other online lexical resources applying to the entire entry  
* **Notes** \- notes to a particular entry; each note has a language code, caller, 14-digit reference code and content  
* **Localizations** \- ignore  
* **Dates** \- ignore  
* **ContributorNotes** \- notes provided by contributors (see above)  
* **BaseForms** \- the next level in the hierarchy; see below

* **BaseForm** \- subentries with the same lemma, but with (as far as can be established) an unrelated meaning, such as homonyms and homographs.

*Attributes*:

* **Id** \- a unique Id for each base form, which can be used for Greek, but better to be ignored for Hebrew until the lexicon is fully completed

	*Elements*:

* **PartsOfSpeech** \- parts of speech are encoded, to make it easier to interpret localized editions, e.g. **nsfp** stands for noun, substantive, feminine, plural  
* **Inflections** \- used in SDBG only, showing somewhat irregular inflected forms of the current lemma, e.g. ἄβυσσος has a genitive form ending in \-ου  
* **Constructs** \- used in SDBG only, showing the different elements making up a particular lemma, e.g. ἀβαρής can be explained as a combination of the prefix ἀ- and βάρος; in some cases the meaning of each element is given  
* **RelatedLemmas** \- lemmas (not including names) that are etymologically related to the main lemma  
* **RelatedNames** \- names that are etymologically related to the main lemma  
* **MeaningsOfName** \- possible translations of a name  
* **BaseFormLinks** \- links to other online lexical resources applying to the current base form only  
* **LEXMeanings** \- the next level in the hierarchy; see below

* **LEXMeaning** \- lexical meaning

*Attributes*:

* **Id** \- a unique Id for each lexical meaning, which can be used for Greek, but better to be ignored for Hebrew until the lexicon is fully completed

	*Elements*:

* **LEXDomains** \- lexical semantic domain(s), with a semicolon as separator; a ‘\>’ is used to mark a mapping from one domain onto another.  
* **LEXSubDomains** \- used in SDBG only: a lexical semantic subdomain, as used in Louw-Nida’s lexicon  
* **LEXForms** \- encoded parts of speech featuring this lexical meaning,   
* **LEXValencies** \- valency information for this lexical meaning, separated by a comma  
* **LEXCollocations** \- specific collocations with this lexical meaning  
* **LEXSynonyms** \- lemmas with similar lexical meanings, usually sharing the same lexical semantic domain   
* **LEXAntonyms** \- lemmas with opposite lexical meanings  
* **LEXCrossReferences** \- other related lemmas  
* **LEXSenses** \- definition, gloss(es), and comments for the current lexical meaning; the long definition field is not in use  
* **LEXIllustrations** \- only used in SDBG but not included in open access release: a Greek illustration accompanied by a translation  
* **LEXReferences** \- all Scripture references, using 14-digit encoding marking book, chapter, verse, segment, and word (BBBCCCVVVSSWWW); the word index uses even numbers only  
* **LEXLinks** \- links to entries in the Flora, Fauna, and Realia resources  
* **LEXImages** \- links to images  
* **LEXVideos** \- links to video clips  
* **LEXCoordinates** \- geographic coordinates for names of locations  
* **LEXCoreDomains** \- contextual semantic domains that apply to all Scripture references, with a semicolon as separator  
* **CONMeanings** \- the next level in the hierarchy; see below

* **CONMeaning** \- contextual meaning; not included in the open access release

*Attributes*:

* **Id** \- a unique Id for each contextual meaning, which can be used for Greek, but better to be ignored for Hebrew until the lexicon is fully completed

	*Elements*:

* **CONDomains** \- contextual semantic domain(s), with a semicolon as separator; a ‘\>’ is used to mark a mapping from one domain onto another.  
* **CONForms** \- encoded parts of speech featuring this contextual meaning,   
* **CONValencies** \- valency information for this contextual meaning, separated by a comma  
* **CONCollocations** \- specific collocations with this contextual meaning  
* **CONSynonyms** \- lemmas with similar contextual meanings, usually sharing the same lexical semantic domain   
* **CONAntonyms** \- lemmas with opposite contextual meanings  
* **CONCrossReferences** \- other related lemmas  
* **CONSenses** \- definition, gloss(es), and comments for the current contextual meaning; only the gloss(es) field is in use at this level  
* **CONLinks** \- links to entries in the Flora, Fauna, and Realia resources  
* **CONImages** \- links to images  
* **CONReferences** \- all Scripture references, using 14-digit encoding marking book, chapter, verse, segment, and word (BBBCCCVVVSSWW); the word index uses even numbers only

**Additional Encodings:**

**{N:001}** \- note caller  
**{A:NIV}** \- abbreviation  
**{D:001:033}** \- link to a entry code in SDBG  
**{L:Abraham\<SDBH:אַבְרָהָם\>}** \- the word Abraham in the text is linked to lemma אַבְרָהָם in SDBH  
**{S:00100200300010}** \- a link to Genesis 2:3, 5th element
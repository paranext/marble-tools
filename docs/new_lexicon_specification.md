# **Enhanced Resources for Paratext 10 Studio**

## **1\. Scripture Texts in .USX with Identifiers**

Enhanced Resources require both the source (e.g., Greek or Hebrew) and the target (e.g., English) scripture texts to be in **USX 3.1** format, with additional identifiers for each lexical word.

### **Requirements**

* Each lexical word must be wrapped in a [wordlist entry element](https://docs.usfm.bible/usfm/3.1/char/features/w.html) containing a lemma attribute.
* Each element must follow the [USX specification](https://docs.usfm.bible/usfm/3.1) without any modifications.
* Punctuation must not be wrapped in elements.

### **Example (Greek USX)**

```
<verse number="1" style="v" sid="1JN 1:1"/>
<char type="w" lemma="ὅ">Ὃ</w> 
<char type="w" lemma="εἰμί">ἦν</w>
```

## **2\. Lexicon Format**

Lexicons are stored in XML format. Each lemma has one or more sense entries.

### **Lexicon Entry Example**

```
<entry lemma="ὅς" id="lex-92.27">
  <sense id="sense-92.27.1">
    <definition>A relative reference to any entity...</definition>
    <glosses>
      <gloss>who</gloss>
      <gloss>which</gloss>
    </glosses>
    <domain>Relative Reference (92.27)</domain>
    <references>
      <reference>1JN 1:1!1</reference>
    </references>
  </sense>
</entry>
```

### **Rules**

* Each sense must have a globally unique `id`.  
* Glosses, domains, and references are optional but recommended.
* References should be formatted in terms of U23003.

## **3\. Aligning Dictionary Senses to Text Instances**

Lexical sense alignment is maintained in a separate **sense alignment file** (JSON), not in the lexicon.

### **Sense Alignment File Example**

```json
{
  "type": "lexicon",
  "source": "GNT",
  "target": "LEXICON-EXAMPLE",
  "records": 
  "1JN 1:1": [
    {
      "id": "1JN 1:1!1",
      "token": "Ὃ",
      "lemma": "ὅ",
      "sense_id": "sense-92.27.1"
    },
  ]
}
```

### **Rules**

* Each entry aligns a specific `<char type="w">` token to a lexicon `sense_id`. Each `id` is provided in U23003 form.
* Multiple entries can exist per segment.  

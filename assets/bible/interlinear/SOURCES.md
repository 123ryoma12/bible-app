# Interlinear sources

Greek: TAGNT (Translators Amalgamated Greek New Testament).
Hebrew and Aramaic: TAHOT (Translators Amalgamated Hebrew Old Testament).
Hebrew and Aramaic parsing labels: TEHMC (Translators Expansion of Hebrew Morphology Codes).

Data by [STEP Bible](https://www.STEPBible.org), based on work at Tyndale House Cambridge,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Upstream files: [STEPBible-Data](https://github.com/STEPBible/STEPBible-Data).

The Hebrew importer groups the primary word rows into chapter JSON using TAHOT's
English verse references. It follows the supplied Qere readings, omits empty
Qere entries, and keeps Psalm superscriptions separately at verse 0. Alternative
readings and duplicate summary rows are not imported. Restored and reconstructed
primary words are retained and labelled in the word detail popover.

Hebrew segmentation slashes are removed for display; vowel points, cantillation,
and punctuation are preserved. Transliteration syllable/stress notation and
English gloss brackets are preserved. Root lexical forms and Strong's identifiers
come from the expanded tags; internal sense identifiers are omitted from lemma
glosses. Grammar codes are expanded using TEHMC, including prefixes and suffixes.

Regenerate with `node bible-fetch/fetch-hebrew-interlinear.js` (all 39 books), or
append book IDs such as `GEN PSA DAN`. Downloads are cached locally.

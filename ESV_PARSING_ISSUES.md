# ESV Parsing Issues — Audit Log

> Documented: 2026-09-20  
> Context: Audit of `bible-fetch/fetch-esv.js` parser against cached ESV API responses.  
> Plan: Tomorrow, re-fetch all chapters fresh from ESV API, store raw JSON, then re-parse cleanly.

---

## Overview of Issues Found

Three distinct parser bugs were identified, affecting **93+ verses** across all 66 books.

---

## Bug 1 — Leading Text Mis-Attribution

### What happens
The ESV API sometimes places text **before** the first `[n]` verse marker on a prose line:

```
"So they took Jesus, [17] and he went out bearing his own cross..."
```

The old parser either:
- **Dropped** the leading text entirely when starting a fresh paragraph block (e.g. Rev 1:4, 1 Cor 14:34)
- **Appended** it to the **previous** verse instead of the first verse on that line

### Root cause
```js
// OLD — appends leading text to last already-parsed verse
if (leading && pending.verses.length) {
  const last = pending.verses[pending.verses.length - 1];
  last.text = cleanText(`${last.text} ${leading}`);
}
```
When `pending.verses` was empty (fresh paragraph), the leading text was silently dropped.

### Fix applied
Leading text is now **prepended** to the first verse on the line (`i === 1` in the split loop), regardless of whether prior verses exist in the block.

### Affected verses (confirmed instances)
All 93 instances across 65 books were fixed. Notable examples:

| Ref | Missing leading text |
|-----|---------------------|
| 1CO 14:34 | "As in all the churches of the saints," |
| REV 1:4 | "Grace to you and peace from him who is and who was and who is to come, and from the seven spirits who are before his throne," |
| REV 1:5 | "To him who loves us and has freed us from our sins by his blood" |
| JHN 19:17 | "So they took Jesus," |
| MAT 1:7 | "And David was the father of Solomon by the wife of Uriah," |
| PHP 1:19 | "Yes, and I will rejoice," |
| EXO 15:26 | "There the LORD made for them a statute and a rule, and there he tested them," |
| NEH 1:2 | "Now it happened in the month of Chislev, in the twentieth year, as I was in Susa the citadel," |
| NEH 7:8 | "The number of the men of the people of Israel:" |
| EZR 2:3 | "The number of the men of the people of Israel:" |
| 2PE 2:11 | "Bold and willful, they do not tremble as they blaspheme the glorious ones," |
| EZK 29:7 | "Because you have been a staff of reed to the house of Israel," |
| EZK 29:10 | "Because you said, 'The Nile is mine, and I made it,'" |
| EZK 41:16 | "The inside of the nave and the vestibules of the court," |
| ISA 22:9 | "In that day you looked to the weapons of the House of the Forest," |
| REV 4:7 | "And around the throne, on each side of the throne, are four living creatures, full of eyes in front and behind:" |

---

## Bug 2 — Incomplete `looksLikePoetryLine` Heuristic

### What happens
The parser uses `looksLikePoetryLine()` to distinguish markerless, indent-0 lines that are **verse text** (poetic continuations) from genuine **editorial section headings**. The old heuristic only checked for:
- Opening with a quote char
- Opening with a lowercase letter
- Ending with `,` `;` `:`

This missed lines ending with `.` `!` `?` or containing `?` `!` mid-line.

### Affected verses

| Ref | Misclassified as `[s1]` heading | Correct text |
|-----|----------------------------------|--------------|
| EZK 19:2 | "What was your mother? A lioness!" | v2 poetry — contains `?` and `!` |
| SNG 8:5 | "Under the apple tree I awakened you." | v5 text — ends with `.` |
| ISA 59:15 | (see Bug 3 — also caught by lookahead) | |

### Fix applied
Extended `looksLikePoetryLine` to return `true` when:
- Last character is `.` `!` or `?`
- Line contains `?` or `!` anywhere

---

## Bug 3 — Unpunctuated Poetry Openers (Lookahead Fix)

### What happens
Some poetry stanzas open with a Title Case line that has **no end punctuation** and no other signals — they look identical to ESV section headings, but are the first line of a multi-line stanza. The following lines (starting with lowercase) are correctly identified as poetry, but the opening line is mis-tagged as `[s1]`.

### ESV API raw format example (Isaiah 19:1)
```
[1] An oracle concerning Egypt.

Behold, the LORD is riding on a swift cloud   ← looks like a heading
and is coming to Egypt;                        ← lowercase, correctly caught as poetry
and the idols of Egypt will tremble...
```

### Affected verses

| Ref | Misclassified opener | Following line (correctly caught) |
|-----|----------------------|-----------------------------------|
| ISA 17:1 | "Behold, Damascus will cease to be a city" | "and will become a heap of ruins." |
| ISA 19:1 | "Behold, the LORD is riding on a swift cloud" | "and is coming to Egypt;" |
| ISA 59:15 | "The LORD saw it, and it displeased him" | "that there was no justice." |
| MIC 5:5 | "When the Assyrian comes into our land" | "and treads in our palaces," |

### Fix applied
Added a **lookahead**: before classifying an indent-0, markerless, unpunctuated line as a section heading, check if the **next non-blank line** also has no verse marker and passes `looksLikePoetryLine`. If so, treat the current line as the first poetry line of the stanza.

---

## Bug 4 — `books.js` Slice Logic (Secondary Fix)

### What happens
The fetch script reads `src/data/books.js` and extracts the `BOOKS` array by slicing from the first `[` to `lastIndexOf("]")`. Because `books.js` now contains utility functions after the array (with `]` chars inside them), `lastIndexOf` grabbed a `]` deep inside a function body — causing a JSON parse error.

### Fix applied
Changed to `indexOf("];")` to find the true closing `];` of the array:
```js
// OLD
return JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));

// NEW
const start = src.indexOf("[");
const end = src.indexOf("];", start);
return JSON.parse(src.slice(start, end + 1));
```

---

## Known Legitimate Ambiguities (Not Bugs)

These were checked and confirmed **correct** — not parser errors:

| Ref | Looks like | Actually |
|-----|------------|----------|
| SNG 4:16 | `[s1]` "Together in the Garden of Love" between two v16 blocks | Genuine ESV section heading mid-verse (speaker transition) |
| SNG — "He", "She", "Others" | `[s1]` speaker labels | Genuine ESV speaker labels |
| OBA 1:1 | `[s1]` heading before v1 | Genuine ESV section heading |
| 1CH 29:22 | `[s1]` heading mid-chapter | Genuine ESV section heading |
| PRO 25:8 | v8 starts lowercase after v7 ends `.` | Poetry — v7 and v8 are a two-line proverb unit |
| REV 1:6 | v6 starts "and" | ESV joins v5-6 as a doxology; "and" is correct continuation |

---

## Tomorrow's Plan

1. **Re-fetch all 66 books** fresh from ESV API (`Authorization: Token cf8448e02a6ec381e25c068fa92f95bd971c7ebb`)
2. **Store raw API response JSON** alongside parsed output so future parser issues can be re-diagnosed without re-fetching
3. **Re-parse everything** with the fixed parser — all 3 bugs above should be resolved automatically
4. **Re-run verification scan** (leading-text check + misclassified-s1 check) to confirm clean output

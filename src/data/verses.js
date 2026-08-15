// Verse-level accessors over the statically bundled Bible text.
//
// bibleData.js exposes chapters as { chapter, blocks: [{ verses: [{verse,text}] }] }
// where a chapter's verses are spread across multiple presentation blocks
// (headings, paragraphs, poetry). The memory feature needs a simple, flat,
// in-order list of { chapter, verse, text } for a book, so this module walks
// the blocks once and flattens them.

import { BIBLE_DATA } from "./bibleData";
import { BOOKS } from "./books";

// Flat, in-order [{ chapter (number), verse (number), text }] for one chapter.
export function getChapterVerses(bookId, chapterNumber) {
  const book = BIBLE_DATA[bookId];
  if (!book) return [];
  const chapter = book.chapters.find(
    (c) => Number(c.chapter) === Number(chapterNumber)
  );
  if (!chapter || !Array.isArray(chapter.blocks)) return [];

  const out = [];
  for (const block of chapter.blocks) {
    if (!Array.isArray(block.verses)) continue;
    for (const v of block.verses) {
      if (v == null || v.verse == null) continue;
      out.push({
        chapter: Number(chapterNumber),
        verse: Number(v.verse),
        text: (v.text || "").trim(),
      });
    }
  }
  return out;
}

// Number of chapters in a book (0 if unknown).
export function getChapterCount(bookId) {
  const book = BOOKS.find((b) => b.id === bookId);
  return book ? book.chapterCount : 0;
}

// Highest verse number present in a given chapter (0 if unknown/empty). Derived
// from the bundled text so pickers only ever offer verses that actually exist.
export function getVerseCount(bookId, chapterNumber) {
  const verses = getChapterVerses(bookId, chapterNumber);
  let max = 0;
  for (const v of verses) {
    if (v.verse > max) max = v.verse;
  }
  return max;
}

// Human-readable book name (falls back to the id).
export function getBookName(bookId) {
  const book = BOOKS.find((b) => b.id === bookId);
  return book ? book.name : bookId;
}

// Collects verses for an inclusive range within a SINGLE book, in canonical
// order. Ranges may span chapters (e.g. 3:16 -> 4:2) but never books. Returns
// [] if the range is empty/invalid.
export function getVersesInRange(
  bookId,
  chapterStart,
  verseStart,
  chapterEnd,
  verseEnd
) {
  const cs = Number(chapterStart);
  const vs = Number(verseStart);
  const ce = Number(chapterEnd);
  const ve = Number(verseEnd);
  if (!bookId || cs < 1 || ce < cs) return [];
  if (cs === ce && ve < vs) return [];

  const out = [];
  for (let ch = cs; ch <= ce; ch++) {
    const verses = getChapterVerses(bookId, ch);
    for (const v of verses) {
      if (ch === cs && v.verse < vs) continue;
      if (ch === ce && v.verse > ve) continue;
      out.push(v);
    }
  }
  return out;
}

// "John 3:16" or "John 3:16-18" or "John 3:16-4:2" (single-book ranges).
export function formatReference(bookId, chapterStart, verseStart, chapterEnd, verseEnd) {
  const name = getBookName(bookId);
  if (chapterStart === chapterEnd && verseStart === verseEnd) {
    return `${name} ${chapterStart}:${verseStart}`;
  }
  if (chapterStart === chapterEnd) {
    return `${name} ${chapterStart}:${verseStart}-${verseEnd}`;
  }
  return `${name} ${chapterStart}:${verseStart}-${chapterEnd}:${verseEnd}`;
}

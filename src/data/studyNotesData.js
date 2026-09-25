// Study notes from the Reformation Study Bible (ESV, 2015).
// Each book is a separate bundled JSON module, loaded when first selected.
// The combined data/study_notes.json remains the source for generating assets.
//
// getStudyNotes(bookName, chapterNumber) returns all notes for that chapter,
// sorted by their starting verse number.

import { BOOKS } from "./books";

const BOOK_ID_BY_NAME = Object.fromEntries(BOOKS.map((book) => [book.name, book.id]));
const LOADERS = {
  "GEN": () => require("../../data/study-notes/GEN.json"),
  "EXO": () => require("../../data/study-notes/EXO.json"),
  "LEV": () => require("../../data/study-notes/LEV.json"),
  "NUM": () => require("../../data/study-notes/NUM.json"),
  "DEU": () => require("../../data/study-notes/DEU.json"),
  "JOS": () => require("../../data/study-notes/JOS.json"),
  "JDG": () => require("../../data/study-notes/JDG.json"),
  "RUT": () => require("../../data/study-notes/RUT.json"),
  "1SA": () => require("../../data/study-notes/1SA.json"),
  "2SA": () => require("../../data/study-notes/2SA.json"),
  "1KI": () => require("../../data/study-notes/1KI.json"),
  "2KI": () => require("../../data/study-notes/2KI.json"),
  "1CH": () => require("../../data/study-notes/1CH.json"),
  "2CH": () => require("../../data/study-notes/2CH.json"),
  "EZR": () => require("../../data/study-notes/EZR.json"),
  "NEH": () => require("../../data/study-notes/NEH.json"),
  "EST": () => require("../../data/study-notes/EST.json"),
  "JOB": () => require("../../data/study-notes/JOB.json"),
  "PSA": () => require("../../data/study-notes/PSA.json"),
  "PRO": () => require("../../data/study-notes/PRO.json"),
  "ECC": () => require("../../data/study-notes/ECC.json"),
  "SNG": () => require("../../data/study-notes/SNG.json"),
  "ISA": () => require("../../data/study-notes/ISA.json"),
  "JER": () => require("../../data/study-notes/JER.json"),
  "LAM": () => require("../../data/study-notes/LAM.json"),
  "EZK": () => require("../../data/study-notes/EZK.json"),
  "DAN": () => require("../../data/study-notes/DAN.json"),
  "HOS": () => require("../../data/study-notes/HOS.json"),
  "JOL": () => require("../../data/study-notes/JOL.json"),
  "AMO": () => require("../../data/study-notes/AMO.json"),
  "OBA": () => require("../../data/study-notes/OBA.json"),
  "JON": () => require("../../data/study-notes/JON.json"),
  "MIC": () => require("../../data/study-notes/MIC.json"),
  "NAM": () => require("../../data/study-notes/NAM.json"),
  "HAB": () => require("../../data/study-notes/HAB.json"),
  "ZEP": () => require("../../data/study-notes/ZEP.json"),
  "HAG": () => require("../../data/study-notes/HAG.json"),
  "ZEC": () => require("../../data/study-notes/ZEC.json"),
  "MAL": () => require("../../data/study-notes/MAL.json"),
  "MAT": () => require("../../data/study-notes/MAT.json"),
  "MRK": () => require("../../data/study-notes/MRK.json"),
  "LUK": () => require("../../data/study-notes/LUK.json"),
  "JHN": () => require("../../data/study-notes/JHN.json"),
  "ACT": () => require("../../data/study-notes/ACT.json"),
  "ROM": () => require("../../data/study-notes/ROM.json"),
  "1CO": () => require("../../data/study-notes/1CO.json"),
  "2CO": () => require("../../data/study-notes/2CO.json"),
  "GAL": () => require("../../data/study-notes/GAL.json"),
  "EPH": () => require("../../data/study-notes/EPH.json"),
  "PHP": () => require("../../data/study-notes/PHP.json"),
  "COL": () => require("../../data/study-notes/COL.json"),
  "1TH": () => require("../../data/study-notes/1TH.json"),
  "2TH": () => require("../../data/study-notes/2TH.json"),
  "1TI": () => require("../../data/study-notes/1TI.json"),
  "2TI": () => require("../../data/study-notes/2TI.json"),
  "TIT": () => require("../../data/study-notes/TIT.json"),
  "PHM": () => require("../../data/study-notes/PHM.json"),
  "HEB": () => require("../../data/study-notes/HEB.json"),
  "JAS": () => require("../../data/study-notes/JAS.json"),
  "1PE": () => require("../../data/study-notes/1PE.json"),
  "2PE": () => require("../../data/study-notes/2PE.json"),
  "1JN": () => require("../../data/study-notes/1JN.json"),
  "2JN": () => require("../../data/study-notes/2JN.json"),
  "3JN": () => require("../../data/study-notes/3JN.json"),
  "JUD": () => require("../../data/study-notes/JUD.json"),
  "REV": () => require("../../data/study-notes/REV.json"),
};
const bookCache = new Map();

function loadBookNotes(bookName) {
  const bookId = BOOK_ID_BY_NAME[bookName];
  if (!bookId || !LOADERS[bookId]) return null;
  if (!bookCache.has(bookId)) bookCache.set(bookId, LOADERS[bookId]());
  return bookCache.get(bookId);
}

/**
 * Returns an array of study note objects for the given book + chapter.
 * Each object: { verse_ref: string, note: string }
 *
 * bookName   – must match books.js `name` exactly, e.g. "Genesis", "1 Samuel"
 * chapter    – number or string, e.g. 3 or "3"
 */
export function getStudyNotes(bookName, chapter) {
  const bookNotes = loadBookNotes(bookName);
  if (!bookNotes) return [];
  const ch = String(chapter);
  return bookNotes.filter((n) => n.chapter === ch);
}

/**
 * Returns true if the verse_ref is a heading/title ref — a bare chapter number
 * with no verse (e.g. "102:", "2", "119"). These notes are about the psalm
 * heading or chapter overview, not a specific verse.
 */
function isHeadingRef(verseRef) {
  if (!verseRef) return false;
  return /^\d+:?$/.test(verseRef.trim());
}

/**
 * Parses the first verse number from a verse_ref string.
 * Handles formats like: "1:5", "1:3–31", "1:1–2:3", "1; 2"
 * Always returns the verse number within the chapter (ignores chapter prefix).
 * Returns null if unparseable or if it's a heading ref.
 */
function parseFirstVerse(verseRef) {
  if (!verseRef || isHeadingRef(verseRef)) return null;
  // Strip any leading "chapter:" prefix (e.g. "1:5" → "5", "1:1–2:3" → "1")
  const withoutChapter = verseRef.replace(/^\d+:/, "");
  // Take only digits at the start (before any range, dash, or semicolon)
  const match = withoutChapter.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Returns the heading/title note for a chapter if one exists, otherwise null.
 * Heading notes have bare chapter refs like "2", "119", or "102:".
 */
export function getHeadingNote(bookName, chapter) {
  const notes = getStudyNotes(bookName, chapter);
  return notes.find((n) => isHeadingRef(n.verse_ref)) ?? null;
}

/**
 * Returns a Map<verseNumber, note[]> for the given book + chapter.
 * Each key is a verse number (integer); the value is an array of all notes
 * anchored to that verse (there may be more than one).
 *
 * Notes that span multiple verses (e.g. "1:3–31") are anchored to the first
 * verse in the ref. Notes spanning chapters (e.g. "1:1–2:3") are anchored to
 * the first verse in the first chapter referenced.
 *
 * bookName   – must match books.js `name` exactly, e.g. "Genesis", "1 Samuel"
 * chapter    – number or string, e.g. 3 or "3"
 */
export function getStudyNotesByVerse(bookName, chapter) {
  const notes = getStudyNotes(bookName, chapter);
  const map = new Map();
  for (const note of notes) {
    const verse = parseFirstVerse(note.verse_ref);
    if (verse == null) continue;
    if (!map.has(verse)) map.set(verse, []);
    map.get(verse).push(note);
  }
  return map;
}

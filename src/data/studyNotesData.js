// Study notes from the Reformation Study Bible (ESV, 2015).
// Each chapter is a separate bundled text asset, read when opened.
// The combined data/study_notes.json remains the source for generating assets.
//
// getStudyNotes(bookName, chapterNumber) returns all notes for that chapter,
// sorted by their starting verse number.

import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { BOOKS } from "./books";
import { STUDY_NOTE_CHAPTER_ASSETS } from "./studyNoteChapterAssets";

const BOOK_ID_BY_NAME = Object.fromEntries(BOOKS.map((book) => [book.name, book.id]));
const cache = new Map();
const inFlight = new Map();
const pins = new Map();
let retainedKeys = new Set();

const keyFor = (bookId, chapter) => `${bookId}:${Number(chapter)}`;

function prune() {
  for (const key of cache.keys()) {
    if (!retainedKeys.has(key) && !pins.has(key)) cache.delete(key);
  }
}

export function retainStudyNotesChapters(tabs) {
  retainedKeys = new Set(tabs.filter((tab) => Number(tab.chapterNumber) > 0)
    .map((tab) => keyFor(tab.bookId, tab.chapterNumber)));
  prune();
}

export function pinStudyNotesChapter(bookId, chapter) {
  const key = keyFor(bookId, chapter);
  pins.set(key, (pins.get(key) ?? 0) + 1);
  return () => {
    const next = pins.get(key) - 1;
    if (next > 0) pins.set(key, next);
    else pins.delete(key);
    prune();
  };
}

export async function loadStudyNotesChapter(bookId, chapter) {
  const loader = STUDY_NOTE_CHAPTER_ASSETS[bookId]?.[Number(chapter)];
  if (!loader) return [];
  const key = keyFor(bookId, chapter);
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    const asset = Asset.fromModule(loader());
    const text = Platform.OS === "web"
      ? await (await fetch(asset.uri)).text()
      : await new File((await asset.downloadAsync()).localUri).text();
    return JSON.parse(text);
  })();
  inFlight.set(key, task);
  try {
    const notes = await task;
    if (retainedKeys.has(key) || pins.has(key)) cache.set(key, notes);
    return notes;
  } finally {
    inFlight.delete(key);
  }
}

export function hasStudyNotesChapter(bookId, chapter) {
  return cache.has(keyFor(bookId, chapter));
}

/**
 * Returns an array of study note objects for the given book + chapter.
 * Each object: { verse_ref: string, note: string }
 *
 * bookName   – must match books.js `name` exactly, e.g. "Genesis", "1 Samuel"
 * chapter    – number or string, e.g. 3 or "3"
 */
export function getStudyNotes(bookName, chapter) {
  const bookId = BOOK_ID_BY_NAME[bookName];
  return cache.get(keyFor(bookId, chapter)) ?? [];
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

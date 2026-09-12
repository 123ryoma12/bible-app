// Study notes from the Reformation Study Bible (ESV, 2015).
// Keyed by book name (Title Case, matching books.js `name` field) →
// array of { chapter, verse_ref, note } objects.
//
// getStudyNotes(bookName, chapterNumber) returns all notes for that chapter,
// sorted by their starting verse number.

import STUDY_NOTES from "../../data/study_notes.json";

/**
 * Returns an array of study note objects for the given book + chapter.
 * Each object: { verse_ref: string, note: string }
 *
 * bookName   – must match books.js `name` exactly, e.g. "Genesis", "1 Samuel"
 * chapter    – number or string, e.g. 3 or "3"
 */
export function getStudyNotes(bookName, chapter) {
  const bookNotes = STUDY_NOTES[bookName];
  if (!bookNotes) return [];
  const ch = String(chapter);
  return bookNotes.filter((n) => n.chapter === ch);
}

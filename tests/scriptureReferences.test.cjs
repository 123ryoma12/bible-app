const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findScriptureReferences, parseStudyNote } = require('../src/data/scriptureReferences.js');
const context = { bookId: 'GEN', chapterNumber: 1 };
const targets = (text, ctx = context) => findScriptureReferences(text, ctx).map(({ bookId, chapterNumber, verseNumber }) => [bookId, chapterNumber, verseNumber]);

test('abbreviations, full names, cross-chapter ranges and verse suffixes', () => {
  assert.deepEqual(targets('Genesis 2; Exod. 3:2–4:5; 1 Chron. 4:9a; Song of Solomon 2:3; Pss. 4:6, 7'), [
    ['GEN', 2, null], ['EXO', 3, 2], ['1CH', 4, 9], ['SNG', 2, 3], ['PSA', 4, 6], ['PSA', 4, 7],
  ]);
});
test('lists inherit the named book and chapter only within the citation', () => {
  assert.deepEqual(targets('Is. 40:21, 28; 43:10; John 1:1. Compare 3:1–6 and v. 2.'), [
    ['ISA', 40, 21], ['ISA', 40, 28], ['ISA', 43, 10], ['JHN', 1, 1], ['GEN', 3, 1], ['GEN', 1, 2],
  ]);
});
test('local verse and chapter lists support punctuation and conjunctions', () => {
  assert.deepEqual(targets('vv. 3–5, 14–19; verses 26 and 28; chs. 5; 9; 11; and 25'), [
    ['GEN', 1, 3], ['GEN', 1, 14], ['GEN', 1, 26], ['GEN', 1, 28], ['GEN', 5, null], ['GEN', 9, null], ['GEN', 11, null], ['GEN', 25, null],
  ]);
});
test('single-chapter books use verse numbers, and numbered books are not list items', () => {
  assert.deepEqual(targets('Jude 7; 2 John 4–6; 3 John 3, 4; Philem. 24; Obad. 10–14; 1 Cor. 3:16'), [
    ['JUD', 1, 7], ['2JN', 1, 4], ['3JN', 1, 3], ['3JN', 1, 4], ['PHM', 1, 24], ['OBA', 1, 10], ['1CO', 3, 16],
  ]);
});
test('prose book names, annotations, ff. and imperfect source spacing', () => {
  assert.deepEqual(targets('Leviticus (19:9, 10; 23:22) and Deuteronomy (24:19). Job in 38:1–40:2. Gal 3:12ff. and Rom 10:5ff.'), [
    ['LEV', 19, 9], ['LEV', 19, 10], ['LEV', 23, 22], ['DEU', 24, 19], ['JOB', 38, 1], ['GAL', 3, 12], ['ROM', 10, 5],
  ]);
  assert.deepEqual(targets('Exodus.\n\n46:1 offered sacrifices.'), [['GEN', 46, 1]]);
  assert.deepEqual(targets('3:13Your words', { bookId: 'MAL', chapterNumber: 3 }), [['MAL', 3, 13]]);
  assert.deepEqual(targets('Deut. 4:26; 30:19 and note; 31:28; 32:1'), [['DEU', 4, 26], ['DEU', 30, 19], ['DEU', 31, 28], ['DEU', 32, 1]]);
  assert.deepEqual(targets('demons (Acts 5:16; 8:7); tongues (2:1–11; 10:44–46); serpents (28:3–5). See 1:1.'), [
    ['ACT', 5, 16], ['ACT', 8, 7], ['ACT', 2, 1], ['ACT', 10, 44], ['ACT', 28, 3], ['GEN', 1, 1],
  ]);
});
test('ordinary numbers, unsupported works and impossible chapters stay plain', () => {
  assert.deepEqual(targets('Day 1, 24-hour days, 4,000–10,000 B.C., 1 Macc. 2:42; 2 Esdras 7:4; Gen. 99:2; v. 0'), []);
});
test('corpus regressions: sentence boundaries, prose names and compact citations', () => {
  assert.deepEqual(targets('His servant.\n\n86:17 have helped.', { bookId: 'PSA', chapterNumber: 86 }), [['PSA', 86, 17]]);
  assert.deepEqual(targets('paralleled by Jer. 52:1–27. Zechariah (2 Kin. 15:8–10). 1 Cor.14:16; Rev.3:14; 22:20.'), [
    ['JER', 52, 1], ['2KI', 15, 8], ['1CO', 14, 16], ['REV', 3, 14], ['REV', 22, 20],
  ]);
  assert.deepEqual(targets('animals (47:6; Ex. 9:3, 4); foreign shepherds (43:32 note).'), [
    ['GEN', 47, 6], ['EXO', 9, 3], ['EXO', 9, 4], ['GEN', 43, 32],
  ]);
  assert.deepEqual(targets('John 14:6 mentions truth. He remains with them (15:5; 14:18, 23).', {bookId: '2JN', chapterNumber: 1}), [
    ['JHN', 14, 6], ['JHN', 15, 5], ['JHN', 14, 18], ['JHN', 14, 23],
  ]);
});
test('markdown survives and bold subsections update the local chapter', () => {
  const spans = parseStudyNote('**2:1 Finished.** See _John 3:16_, 18.\n\n**2:2 Rest.** See v. 3.', context);
  assert.equal(spans.map(s => s.text).join(''), '2:1 Finished. See John 3:16, 18.\n\n2:2 Rest. See v. 3.');
  assert.equal(spans.find(s => s.text === 'John 3:16').kind, 'italic');
  assert.deepEqual(spans.filter(s => s.reference).map(s => [s.text, s.reference.bookId, s.reference.chapterNumber, s.reference.verseNumber]), [
    ['2:1', 'GEN', 2, 1], ['John 3:16', 'JHN', 3, 16], ['18', 'JHN', 3, 18], ['2:2', 'GEN', 2, 2], ['v. 3', 'GEN', 2, 3],
  ]);
});
test('every note preserves its text and produces ordered valid reference spans', () => {
  const corpus = require('../data/study_notes.json');
  const { BOOKS } = require('../src/data/books.js');
  let count = 0;
  for (const [name, notes] of Object.entries(corpus)) {
    const book = BOOKS.find(b => b.name.toLowerCase() === name.toLowerCase() || (name === 'Song Of Solomon' && b.id === 'SNG'));
    assert.ok(book, name);
    for (const note of notes) {
      const spans = parseStudyNote(note.note, { bookId: book.id, chapterNumber: parseInt(note.verse_ref, 10) || +note.chapter });
      assert.equal(spans.map(s => s.text).join(''), note.note.replace(/\*\*(.+?)\*\*|_(.+?)_/g, (_, bold, italic) => bold ?? italic));
      for (const span of spans) if (span.reference) count++;
    }
  }
  assert.ok(count > 40000, `Expected broad corpus coverage, found ${count} reference spans`);
});

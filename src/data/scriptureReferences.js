import { BOOKS } from "./books.js";

// Includes the spellings used throughout the study-note corpus, as well as
// common full/short names. Longest names win (e.g. 1 John before John).
const ALIASES = {
  GEN: ['Gen'], EXO: ['Ex', 'Exod'], LEV: ['Lev'], NUM: ['Num'], DEU: ['Deut'],
  JOS: ['Josh'], JDG: ['Judg'], RUT: [], '1SA': ['1 Sam'], '2SA': ['2 Sam'],
  '1KI': ['1 Kin', '1 Kgs'], '2KI': ['2 Kin', '2 Kgs'],
  '1CH': ['1 Chr', '1 Chron'], '2CH': ['2 Chr', '2 Chron'],
  EZR: [], NEH: ['Neh'], EST: ['Esth', 'Est'], JOB: [], PSA: ['Ps', 'Pss', 'Psalm', 'Psalms'],
  PRO: ['Prov'], ECC: ['Eccl'], SNG: ['Song', 'Song of Songs', 'Song of Solomon', 'Cant'],
  ISA: ['Is', 'Isa'], JER: ['Jer'], LAM: ['Lam'], EZK: ['Ezek'], DAN: ['Dan'],
  HOS: ['Hos'], JOL: [], AMO: [], OBA: ['Obad'], JON: ['Jon'], MIC: ['Mic'],
  NAM: ['Nah'], HAB: ['Hab'], ZEP: ['Zeph'], HAG: ['Hag'], ZEC: ['Zech'], MAL: ['Mal'],
  MAT: ['Matt', 'Mt'], MRK: ['Mk'], LUK: ['Lk'], JHN: ['Jn'], ACT: [], ROM: ['Rom'],
  '1CO': ['1 Cor'], '2CO': ['2 Cor'], GAL: ['Gal'], EPH: ['Eph'], PHP: ['Phil'], COL: ['Col'],
  '1TH': ['1 Thess'], '2TH': ['2 Thess'], '1TI': ['1 Tim'], '2TI': ['2 Tim'],
  TIT: [], PHM: ['Philem', 'Phlm'], HEB: ['Heb'], JAS: ['Jas'],
  '1PE': ['1 Pet'], '2PE': ['2 Pet'], '1JN': ['1 Jn'], '2JN': ['2 Jn'], '3JN': ['3 Jn'],
  JUD: [], REV: ['Rev'],
};
const normalize = (name) => name.replace(/\./g, '').replace(/\s+/g, ' ').toLowerCase();
const byName = new Map();
for (const book of BOOKS) {
  for (const name of [book.name, ...(ALIASES[book.id] || [])]) byName.set(normalize(name), book);
}
const names = [...byName.keys()].sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/ /g, '\\s+')).join('|');
const number = String.raw`\d{1,3}(?:[a-d]|ff?\.?)?(?![\d\w])`;
const point = `${number}(?:\\s*:\\s*${number})?`;
const passage = `${point}(?:\\s*[–—-]\\s*${point})?`;
const referenceRE = new RegExp(
  `\\b(?:(${names})(?:\\.[ \\t]*|[ \\t]+)(?:(?:in|at)[ \\t]+|\\([ \\t]*(?:(?:e\\.g\\.,|cf\\.)[ \\t]*)?)?(${passage})|((?:vv?|chs?)\\.|verses?|chapters?)\\s+(${passage})|(\\d{1,3}\\s*:\\s*\\d{1,3}(?:[a-d]\\b|ff?\\.?(?!\\w))?(?!\\d)(?:\\s*[–—-]\\s*${point})?))`, 'gi');
const continuationRE = new RegExp(`^((?:[ \\t]+(?:and[ \\t]+)?notes?)?(?:[ \\t]*[,;][ \\t]*(?:(?:and|cf\\.|see|also)[ \\t]+)*|[ \\t]+and[ \\t]+))(${passage})`, 'i');
const namedStartRE = new RegExp(`^(?:${names})\\.?\\s+\\d`, 'i');

function targetFor(book, chapter, verse) {
  if (!book || chapter < 1 || chapter > book.chapterCount || (verse != null && (verse < 1 || verse > 176))) return null;
  return { bookId: book.id, chapterNumber: chapter, verseNumber: verse ?? null };
}

/** Reference offsets in plain text. Lists get a separate link for each passage;
 * ranges navigate to their beginning. Unqualified references belong to the note,
 * except immediately continued citations, which inherit the preceding book.
 */
export function findScriptureReferences(text, { bookId, chapterNumber, sectionStarts = [] } = {}) {
  const localBook = BOOKS.find((book) => book.id === bookId);
  let localChapter = Number(chapterNumber) || 1;
  const references = [];
  const re = new RegExp(referenceRE);
  let previousCitation = null;
  let lastNamedBook = null;
  let match;
  while ((match = re.exec(text))) {
    const [, name, namedPassage, prefix, localPassage, barePassage] = match;
    // Do not turn non-canonical citations into references to the current book.
    if (barePassage && /\b(?:Macc\.|Esdras|Enoch|Jub\.|Ant\.|War|Confession)\s*$/i.test(text.slice(0, match.index))) continue;
    // “exodus”, “revelation” and “is” also occur as ordinary prose. Likewise,
    // “by Luke (...)” names an author, not necessarily the cited Bible book.
    if (name && (!/[A-Z]/.test(name) || (match[0].includes('(') && /\bby\s+$/i.test(text.slice(0, match.index))))) {
      re.lastIndex = match.index + name.length;
      continue;
    }
    if (name && namedStartRE.test(text.slice(re.lastIndex - namedPassage.length))) {
      // “Zechariah (2 Kin. 15:8)” refers to a person and a different book.
      re.lastIndex -= namedPassage.length;
      continue;
    }
    let book = name ? byName.get(normalize(name)) : localBook;
    let value = namedPassage || localPassage || barePassage;
    let verseMode = prefix ? /^(?:v\b|vv\b|verse)/i.test(prefix) : !!(name && book.chapterCount === 1);
    let chapter = name ? 1 : localChapter;
    // A semicolon may separate annotated citations: “Acts 5:16); new tongues
    // (2:1–11)”. Keep that list's book through the intervening label, but never
    // carry it into a new sentence, paragraph, or explicit local v./ch. form.
    if (barePassage && previousCitation && /^[^.!?\n]*;[^.!?\n]*$/.test(text.slice(previousCitation.end, match.index))) {
      if (targetFor(previousCitation.book, parseInt(value, 10), null)) book = previousCitation.book;
    }
    if (barePassage && !targetFor(book, parseInt(value, 10), null)) {
      // Some notes discuss a previously named passage over several sentences.
      // Only use that book when this chapter cannot belong to the local book.
      if (targetFor(lastNamedBook, parseInt(value, 10), null)) book = lastNamedBook;
      else if (/\bpsalms?\b/i.test(text.slice(0, match.index))) book = byName.get('psalms');
    }
    const add = (raw, start, end) => {
      const nums = raw.match(/\d+/g).map(Number);
      const firstPoint = raw.split(/[–—-]/)[0];
      const colon = firstPoint.includes(':');
      const verse = colon ? nums[1] : verseMode ? nums[0] : null;
      chapter = colon || !verseMode ? nums[0] : chapter;
      verseMode = colon || verseMode;
      const target = targetFor(book, chapter, verse);
      if (target) references.push({ start, end, ...target });
      const rangeEnd = raw.split(/[–—-]/)[1];
      if (rangeEnd?.includes(':')) chapter = parseInt(rangeEnd, 10);
      return !!target;
    };
    if (!add(value, match.index, re.lastIndex)) continue;
    if (name) lastNamedBook = book;
    // Multi-chapter notes often contain bold subsection headings such as 2:1.
    if (barePassage && sectionStarts.includes(match.index)) localChapter = chapter;
    let end = re.lastIndex;
    let next;
    while ((next = continuationRE.exec(text.slice(end)))) {
      const start = end + next[1].length;
      const nextEnd = end + next[0].length;
      // A number beginning another named book is not a list item (1 John 3:16).
      if (/^\s+[A-Za-z]/.test(text.slice(nextEnd)) && namedStartRE.test(text.slice(start))) break;
      if (!add(next[2], start, nextEnd)) break;
      end = nextEnd;
    }
    re.lastIndex = end;
    previousCitation = { book, end };
  }
  return references;
}

// Parse emphasis before finding references so links may cross markdown spans
// without losing formatting or the book/chapter inherited within a list.
export function parseStudyNote(text, context = {}) {
  const runs = [];
  let plain = '';
  let last = 0;
  const append = (value, kind) => {
    if (!value) return;
    runs.push({ start: plain.length, end: plain.length + value.length, kind });
    plain += value;
  };
  for (const match of text.matchAll(/\*\*(.+?)\*\*|_(.+?)_/g)) {
    append(text.slice(last, match.index), 'plain');
    append(match[1] ?? match[2], match[1] != null ? 'bold' : 'italic');
    last = match.index + match[0].length;
  }
  append(text.slice(last), 'plain');
  const sectionStarts = runs.filter((run) => run.kind === 'bold' && /(?:^|\n\s*\n)$/.test(plain.slice(0, run.start))).map((run) => run.start);
  const refs = findScriptureReferences(plain, { ...context, sectionStarts });
  const boundaries = [...new Set([0, plain.length, ...runs.flatMap((run) => [run.start, run.end]), ...refs.flatMap((ref) => [ref.start, ref.end])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, i) => ({
    text: plain.slice(start, boundaries[i + 1]),
    kind: runs.find((run) => run.start <= start && run.end > start)?.kind || 'plain',
    reference: refs.find((ref) => ref.start <= start && ref.end > start) || null,
  }));
}

// Interlinear Greek data from STEPBible TAGNT (CC BY 4.0).
// Keyed by book id → chapter → verse → array of word objects.
//
// Each word object:
//   { greek, translit, gloss, strongs, morph, lemma, lemmaGloss }
//
// Only NT books have data. OT books return empty maps.
//
// getInterlinearVerse(bookId, chapter, verse) → word[] | null
// getInterlinearChapter(bookId, chapter)      → Map<verseNum, word[]>

// Lazily loaded per-book cache so unused books never hit memory.
const _cache = {};

function loadBook(bookId) {
  if (_cache[bookId] !== undefined) return _cache[bookId];
  try {
    // Each NT book is a pre-built JSON asset. Require is synchronous and
    // bundled by Metro, identical to how bibleData.js loads scripture.
    const data = requireBook(bookId);
    _cache[bookId] = data?.chapters ?? null;
  } catch {
    _cache[bookId] = null;
  }
  return _cache[bookId];
}

// Metro requires a static require() call per file — we can't use a dynamic
// string directly. Map each NT book id to its asset.
function requireBook(bookId) {
  switch (bookId) {
    case "MAT": return require("../../assets/bible/interlinear/MAT.json");
    case "MRK": return require("../../assets/bible/interlinear/MRK.json");
    case "LUK": return require("../../assets/bible/interlinear/LUK.json");
    case "JHN": return require("../../assets/bible/interlinear/JHN.json");
    case "ACT": return require("../../assets/bible/interlinear/ACT.json");
    case "ROM": return require("../../assets/bible/interlinear/ROM.json");
    case "1CO": return require("../../assets/bible/interlinear/1CO.json");
    case "2CO": return require("../../assets/bible/interlinear/2CO.json");
    case "GAL": return require("../../assets/bible/interlinear/GAL.json");
    case "EPH": return require("../../assets/bible/interlinear/EPH.json");
    case "PHP": return require("../../assets/bible/interlinear/PHP.json");
    case "COL": return require("../../assets/bible/interlinear/COL.json");
    case "1TH": return require("../../assets/bible/interlinear/1TH.json");
    case "2TH": return require("../../assets/bible/interlinear/2TH.json");
    case "1TI": return require("../../assets/bible/interlinear/1TI.json");
    case "2TI": return require("../../assets/bible/interlinear/2TI.json");
    case "TIT": return require("../../assets/bible/interlinear/TIT.json");
    case "PHM": return require("../../assets/bible/interlinear/PHM.json");
    case "HEB": return require("../../assets/bible/interlinear/HEB.json");
    case "JAS": return require("../../assets/bible/interlinear/JAS.json");
    case "1PE": return require("../../assets/bible/interlinear/1PE.json");
    case "2PE": return require("../../assets/bible/interlinear/2PE.json");
    case "1JN": return require("../../assets/bible/interlinear/1JN.json");
    case "2JN": return require("../../assets/bible/interlinear/2JN.json");
    case "3JN": return require("../../assets/bible/interlinear/3JN.json");
    case "JUD": return require("../../assets/bible/interlinear/JUD.json");
    case "REV": return require("../../assets/bible/interlinear/REV.json");
    default: return null;
  }
}

/**
 * Returns the interlinear word array for a specific verse, or null if
 * the book/chapter/verse is not in the dataset (all OT books return null).
 *
 * bookId  – e.g. "JHN"
 * chapter – number or string, e.g. 3 or "3"
 * verse   – number or string, e.g. 16 or "16"
 */
export function getInterlinearVerse(bookId, chapter, verse) {
  const chapters = loadBook(bookId);
  if (!chapters) return null;
  const ch = String(chapter);
  const v = String(verse);
  return chapters[ch]?.[v] ?? null;
}

/**
 * Returns a Map<verseNumber, word[]> for the given book + chapter.
 * Keys are integer verse numbers. Returns an empty Map for OT books.
 *
 * bookId  – e.g. "JHN"
 * chapter – number or string
 */
export function getInterlinearChapter(bookId, chapter) {
  const chapters = loadBook(bookId);
  const map = new Map();
  if (!chapters) return map;
  const ch = String(chapter);
  const verseMap = chapters[ch];
  if (!verseMap) return map;
  for (const [v, words] of Object.entries(verseMap)) {
    const num = parseInt(v, 10);
    if (!Number.isNaN(num)) map.set(num, words);
  }
  return map;
}

/**
 * Returns true if the book has interlinear data (i.e. it's an NT book).
 */
export function hasInterlinear(bookId) {
  return loadBook(bookId) !== null;
}

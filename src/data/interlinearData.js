// Interlinear Greek data from STEPBible TAGNT (CC BY 4.0).
// Keyed by book id → chapter → verse → array of word objects.
//
// Each word object:
//   { greek, translit, gloss, strongs, morph, lemma, lemmaGloss }
//
// Only NT books have data. OT books return empty maps.
//
// loadInterlinearBook(bookId)                 → Promise<chapters | null>
// getInterlinearVerse(bookId, chapter, verse) → word[] | null after load
// getInterlinearChapter(bookId, chapter)      → Map<verseNum, word[]> after load

// JSON text is bundled as a file asset rather than a JSON module. Metro keeps
// required JSON modules alive, preventing tab closure from freeing word data.
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Platform } from "react-native";

const SUPPORTED_BOOK_IDS = new Set([
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
  "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM",
  "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
]);
const cache = new Map();
const inFlight = new Map();
let retainedBookIds = null;

/** Keep parsed books only while at least one open reader tab uses them. */
export function retainInterlinearBooks(bookIds) {
  retainedBookIds = new Set(bookIds);
  for (const bookId of cache.keys()) {
    if (!retainedBookIds.has(bookId)) cache.delete(bookId);
  }
}

/** Load one book once, sharing in-flight work if multiple callers need it. */
export async function loadInterlinearBook(bookId) {
  if (!SUPPORTED_BOOK_IDS.has(bookId)) return null;
  if (cache.has(bookId)) return cache.get(bookId);
  if (inFlight.has(bookId)) return inFlight.get(bookId);

  const task = (async () => {
    const asset = Asset.fromModule(requireBook(bookId));
    const text = Platform.OS === "web"
      ? await (await fetch(asset.uri)).text()
      : await new File((await asset.downloadAsync()).localUri).text();
    return JSON.parse(text).chapters ?? null;
  })();
  inFlight.set(bookId, task);
  try {
    const chapters = await task;
    if (chapters && (retainedBookIds === null || retainedBookIds.has(bookId))) {
      cache.set(bookId, chapters);
    }
    return chapters;
  } finally {
    inFlight.delete(bookId);
  }
}

// Metro requires a static require() call per file — we can't use a dynamic
// string directly. Map each NT book id to its asset.
function requireBook(bookId) {
  switch (bookId) {
    case "MAT": return require("../../assets/bible/interlinear/MAT.txt");
    case "MRK": return require("../../assets/bible/interlinear/MRK.txt");
    case "LUK": return require("../../assets/bible/interlinear/LUK.txt");
    case "JHN": return require("../../assets/bible/interlinear/JHN.txt");
    case "ACT": return require("../../assets/bible/interlinear/ACT.txt");
    case "ROM": return require("../../assets/bible/interlinear/ROM.txt");
    case "1CO": return require("../../assets/bible/interlinear/1CO.txt");
    case "2CO": return require("../../assets/bible/interlinear/2CO.txt");
    case "GAL": return require("../../assets/bible/interlinear/GAL.txt");
    case "EPH": return require("../../assets/bible/interlinear/EPH.txt");
    case "PHP": return require("../../assets/bible/interlinear/PHP.txt");
    case "COL": return require("../../assets/bible/interlinear/COL.txt");
    case "1TH": return require("../../assets/bible/interlinear/1TH.txt");
    case "2TH": return require("../../assets/bible/interlinear/2TH.txt");
    case "1TI": return require("../../assets/bible/interlinear/1TI.txt");
    case "2TI": return require("../../assets/bible/interlinear/2TI.txt");
    case "TIT": return require("../../assets/bible/interlinear/TIT.txt");
    case "PHM": return require("../../assets/bible/interlinear/PHM.txt");
    case "HEB": return require("../../assets/bible/interlinear/HEB.txt");
    case "JAS": return require("../../assets/bible/interlinear/JAS.txt");
    case "1PE": return require("../../assets/bible/interlinear/1PE.txt");
    case "2PE": return require("../../assets/bible/interlinear/2PE.txt");
    case "1JN": return require("../../assets/bible/interlinear/1JN.txt");
    case "2JN": return require("../../assets/bible/interlinear/2JN.txt");
    case "3JN": return require("../../assets/bible/interlinear/3JN.txt");
    case "JUD": return require("../../assets/bible/interlinear/JUD.txt");
    case "REV": return require("../../assets/bible/interlinear/REV.txt");
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
  const chapters = cache.get(bookId);
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
  const chapters = cache.get(bookId);
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
  return SUPPORTED_BOOK_IDS.has(bookId);
}

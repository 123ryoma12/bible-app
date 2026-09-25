// One-off importer: downloads the STEPBible TAGNT (Translators Amalgamated
// Greek NT) and converts it into per-book JSON text assets under
// assets/bible/interlinear/<BOOKID>.txt. Metro treats these as files rather
// than JSON modules so parsed books can be released when their tabs close.
//
// Only NT books are produced (OT Hebrew interlinear is a separate dataset).
//
// Output shape per book:
//   {
//     book: "Matthew",
//     bookId: "MAT",
//     chapters: {
//       "1": {
//         "1": [
//           {
//             greek: "Βίβλος",
//             translit: "Biblos",
//             gloss: "book",
//             strongs: "G0976",
//             morph: "N-NSF",
//             lemma: "βίβλος",
//             lemmaGloss: "book"
//           },
//           ...
//         ],
//         ...
//       },
//       ...
//     }
//   }
//
// Usage:
//   node bible-fetch/fetch-interlinear.js            # process all NT books
//   node bible-fetch/fetch-interlinear.js MAT JHN    # only given book ids
//
// Requires Node 18+ (global fetch).

const fs = require("fs");
const path = require("path");

// ── Paths ────────────────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, "../assets/bible/interlinear");
const CACHE_DIR = path.join(__dirname, ".cache/interlinear");

const TAGNT_FILES = [
  {
    url: "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAGNT%20Mat-Jhn%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt",
    cache: "TAGNT_Mat-Jhn.txt",
  },
  {
    url: "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT/TAGNT%20Act-Rev%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt",
    cache: "TAGNT_Act-Rev.txt",
  },
];

// ── TAGNT book code → app book id ────────────────────────────────────────────
// TAGNT uses 3-letter codes like "Mat", "Mrk", "Jhn", "Act", "1Co", etc.
// These map to our uppercase book IDs.

const TAGNT_BOOK_MAP = {
  Mat: "MAT", Mrk: "MRK", Luk: "LUK", Jhn: "JHN",
  Act: "ACT", Rom: "ROM", "1Co": "1CO", "2Co": "2CO",
  Gal: "GAL", Eph: "EPH", Php: "PHP", Col: "COL",
  "1Th": "1TH", "2Th": "2TH", "1Ti": "1TI", "2Ti": "2TI",
  Tit: "TIT", Phm: "PHM", Heb: "HEB", Jas: "JAS",
  "1Pe": "1PE", "2Pe": "2PE", "1Jn": "1JN", "2Jn": "2JN",
  "3Jn": "3JN", Jud: "JUD", Rev: "REV",
};

// App book id → canonical book name (for the output JSON)
const BOOKS = (() => {
  const src = fs.readFileSync(path.join(__dirname, "../src/data/books.js"), "utf8");
  // Strip ES module export syntax, keep only the array literal
  const stripped = src
    .replace(/export\s+const\s+\w+\s*=\s*/, "")
    .replace(/export\s+function[\s\S]*$/m, "")
    .trim()
    .replace(/;$/, "");
  const json = stripped.slice(stripped.indexOf("["), stripped.lastIndexOf("]") + 1);
  return JSON.parse(json);
})();

const BOOK_NAME_BY_ID = Object.fromEntries(BOOKS.map((b) => [b.id, b.name]));

// ── Morphology code expander ──────────────────────────────────────────────────
// TAGNT uses Robinson-style morphology codes. We expand them to human-readable
// strings for the word detail sheet.

function expandMorph(code) {
  if (!code) return null;

  // Split on "-" — first segment is part of speech, rest are features
  const parts = code.split("-");
  const pos = parts[0];
  const features = parts.slice(1).join("-");

  const posMap = {
    N: "Noun", V: "Verb", T: "Article", A: "Adjective",
    P: "Preposition", ADV: "Adverb", CONJ: "Conjunction",
    PRT: "Particle", INJ: "Interjection", COND: "Conditional",
    HEB: "Hebrew", ARAM: "Aramaic", X: "Pronoun", I: "Pronoun",
    "N-PRI": "Proper Noun", "N-OI": "Noun",
  };

  const caseMap = { N: "Nominative", G: "Genitive", D: "Dative", A: "Accusative", V: "Vocative" };
  const numberMap = { S: "Singular", P: "Plural" };
  const genderMap = { M: "Masculine", F: "Feminine", N: "Neuter" };
  const tenseMap = { P: "Present", I: "Imperfect", F: "Future", A: "Aorist", R: "Perfect", L: "Pluperfect" };
  const voiceMap = { A: "Active", M: "Middle", P: "Passive", E: "Middle or Passive", D: "Deponent" };
  const moodMap = { I: "Indicative", S: "Subjunctive", O: "Optative", M: "Imperative", N: "Infinitive", P: "Participle" };
  const personMap = { "1": "1st Person", "2": "2nd Person", "3": "3rd Person" };

  const posLabel = posMap[pos] || pos;

  if (!features) return posLabel;

  const result = [posLabel];

  // Verb: T-V-M-P e.g. P-AAI-3S → tense, voice, mood, person, number
  if (pos === "V") {
    // Format: TVMP-PNS e.g. AAI-3S
    const verbMatch = features.match(/^([PIFARLX2])([AMPED])([ISOMN P])(?:-([123])([SP]))?/);
    if (verbMatch) {
      const [, t, v, m, person, num] = verbMatch;
      if (tenseMap[t]) result.push(tenseMap[t]);
      if (voiceMap[v]) result.push(voiceMap[v]);
      if (moodMap[m]) result.push(moodMap[m]);
      if (person && personMap[person]) result.push(personMap[person]);
      if (num && numberMap[num]) result.push(numberMap[num]);
    }
    return result.join(", ");
  }

  // Noun/Adjective/Article/Pronoun: case, number, gender e.g. NSM, GSF, APM
  const nominalMatch = features.match(/([NGDAV])([SP])([MFN])/);
  if (nominalMatch) {
    const [, c, n, g] = nominalMatch;
    if (caseMap[c]) result.push(caseMap[c]);
    if (numberMap[n]) result.push(numberMap[n]);
    if (genderMap[g]) result.push(genderMap[g]);
  }

  return result.join(", ");
}

// ── Fetch with cache ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithCache(url, cacheFile) {
  const cachePath = path.join(CACHE_DIR, cacheFile);
  if (fs.existsSync(cachePath)) {
    process.stdout.write(`  (from cache: ${cacheFile})\n`);
    return fs.readFileSync(cachePath, "utf8");
  }
  process.stdout.write(`  Downloading ${cacheFile}... `);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath, text, "utf8");
      process.stdout.write(`done\n`);
      return text;
    } catch (e) {
      if (attempt === 4) throw e;
      process.stdout.write(`retry ${attempt}... `);
      await sleep(1000 * attempt);
    }
  }
}

// ── Parse TAGNT text into a map of bookId → chapters → verses → words ────────

function parseTAGNT(text) {
  // Result: { MAT: { "1": { "1": [ wordObj, ... ], "2": [...] }, "2": {...} }, MRK: ... }
  const result = {};

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/^\uFEFF/, "").trim(); // strip BOM
    if (!line || line.startsWith("=") || line.startsWith("\t") || line.startsWith("TAGNT")) continue;

    const cols = line.split("\t");
    if (cols.length < 4) continue;

    // Col 0: "Mat.1.1#01=NKO"
    const refCol = cols[0].trim();
    const refMatch = refCol.match(/^(\w+)\.(\d+)\.(\d+)#\d+/);
    if (!refMatch) continue;

    const [, tagntBook, chStr, vStr] = refMatch;
    const bookId = TAGNT_BOOK_MAP[tagntBook];
    if (!bookId) continue; // skip OT books if any bleed through

    // Col 1: "Βίβλος (Biblos)" — greek (translit)
    const wordCol = cols[1]?.trim() || "";
    const wordMatch = wordCol.match(/^(.+?)\s+\((.+?)\)/);
    const greek = wordMatch ? wordMatch[1].replace(/[.,;:·!?'"»«\u2019\u2018]+$/, "").trim() : wordCol;
    const translit = wordMatch ? wordMatch[2] : "";

    // Col 2: "[The] book" — gloss (strip optional brackets)
    const gloss = (cols[2]?.trim() || "").replace(/^\[|\]$/g, "").replace(/\[|\]/g, "").trim();

    // Col 3: "G0976=N-NSF" — strongs=morph
    const strongsMorphCol = cols[3]?.trim() || "";
    const smMatch = strongsMorphCol.match(/^([A-Z]\d+[A-Z]?)(?:G|H)?=(.+)/);
    const strongs = smMatch ? smMatch[1] : strongsMorphCol.split("=")[0];
    const morphCode = smMatch ? smMatch[2] : strongsMorphCol.split("=")[1] || "";
    const morph = expandMorph(morphCode);

    // Col 4: "βίβλος=book" — lemma=lemmaGloss
    const lemmaCol = cols[4]?.trim() || "";
    const lemmaMatch = lemmaCol.match(/^(.+?)=(.+)/);
    const lemma = lemmaMatch ? lemmaMatch[1] : lemmaCol;
    const lemmaGloss = lemmaMatch ? lemmaMatch[2] : "";

    // Build nested structure
    if (!result[bookId]) result[bookId] = {};
    if (!result[bookId][chStr]) result[bookId][chStr] = {};
    if (!result[bookId][chStr][vStr]) result[bookId][chStr][vStr] = [];

    result[bookId][chStr][vStr].push({
      greek,
      translit,
      gloss,
      strongs,
      morph,
      lemma,
      lemmaGloss,
    });
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Fetch and parse both TAGNT files into one merged map
  const merged = {};
  for (const file of TAGNT_FILES) {
    const text = await fetchWithCache(file.url, file.cache);
    const parsed = parseTAGNT(text);
    for (const [bookId, chapters] of Object.entries(parsed)) {
      if (!merged[bookId]) merged[bookId] = {};
      Object.assign(merged[bookId], chapters);
    }
  }

  // Write one JSON file per NT book
  const ntBooks = BOOKS.filter((b) => b.testament === "NT");
  const targets = only.length ? ntBooks.filter((b) => only.includes(b.id)) : ntBooks;

  let done = 0;
  for (const book of targets) {
    const chapters = merged[book.id];
    if (!chapters) {
      console.warn(`  WARNING: no data found for ${book.id}`);
      continue;
    }
    const out = {
      book: book.name,
      bookId: book.id,
      chapters,
    };
    const outFile = path.join(OUT_DIR, `${book.id}.txt`);
    fs.writeFileSync(outFile, JSON.stringify(out));
    done++;
    console.log(`  ${book.id} → ${path.relative(process.cwd(), outFile)}`);
  }

  console.log(`\nWrote ${done} book(s) to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});

// One-off importer: fetches the KJV from API.Bible and converts each book into
// the app's NIV-shaped JSON under assets/bible/kjv/<BOOKID>.json.
//
// Output shape (matches assets/bible/niv/*.json):
//   { book, bookId, count, chapters: [ { chapter, blocks: [
//       { style, verses: [ { verse, text } ], text } ] } ] }
//
// API.Bible chapter JSON is an array of "para" blocks, each with attrs.style
// (p, q1, q2, s1, ...). Inside a block, `verse` tags mark verse boundaries and
// `text` nodes carry the words. We accumulate text per verse, join fragments,
// and also build the block-level concatenated `text` the reader uses.
//
// Usage:
//   node bible-fetch/fetch-kjv.js            # fetch all 66 books
//   node bible-fetch/fetch-kjv.js GEN EXO    # only the given book ids
//
// Requires Node 18+ (global fetch). The API key is read from the API_BIBLE_KEY
// env var, falling back to the value passed on the command line via --key=...

const fs = require("fs");
const path = require("path");

// Pull the canonical book list straight from the app so ids/names/counts match.
const BOOKS = require("../src/data/books.js").BOOKS ||
  // books.js is an ES module; if require fails, fall back to a tiny parser.
  (() => {
    const src = fs.readFileSync(path.join(__dirname, "../src/data/books.js"), "utf8");
    const json = src.slice(src.indexOf("["), src.lastIndexOf("]") + 1);
    return JSON.parse(json);
  })();

const BIBLE_ID = "de4e12af7f28f599-01"; // engKJV - King James (Authorised) Version
const BASE = "https://api.scripture.api.bible/v1";
const OUT_DIR = path.join(__dirname, "../assets/bible/kjv");
const CACHE_DIR = path.join(__dirname, ".cache/kjv");

const KEY =
  process.env.API_BIBLE_KEY ||
  (process.argv.find((a) => a.startsWith("--key=")) || "").slice(6);

if (!KEY) {
  console.error("Missing API key. Set API_BIBLE_KEY or pass --key=...");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Normalise raw text: strip API.Bible paragraph markers (pilcrow ¶) and any
// stray control markers, collapse whitespace, and trim. The pilcrow denotes a
// new paragraph in the source; our block model already captures paragraphs via
// the block `style`, so the glyph itself must not appear in the verse text.
function cleanText(s) {
  return String(s || "")
    .replace(/\u00B6/g, " ") // ¶ pilcrow / paragraph mark
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchChapterJson(bookId, chapter) {
  const cacheFile = path.join(CACHE_DIR, `${bookId}.${chapter}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  }
  const url =
    `${BASE}/bibles/${BIBLE_ID}/chapters/${bookId}.${chapter}` +
    `?content-type=json&include-notes=false&include-titles=true` +
    `&include-verse-numbers=true&include-chapter-numbers=false`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "api-key": KEY } });
      if (res.status === 429) {
        await sleep(1500 * attempt); // rate limited - back off
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(body));
      return body;
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(800 * attempt);
    }
  }
}

// Walk a block's item tree, emitting { verse, textParts } as verse tags are
// encountered. A leading `verse` tag switches the "current verse"; text nodes
// append to whichever verse is current. Non-verse tags (e.g. char/wj) are
// descended into so their inner text is preserved.
function extractVersesFromBlock(block) {
  const verses = []; // [{ verse:Number, parts:[str] }]
  let current = null;

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === "tag" && node.name === "verse") {
      const num = Number(node.attrs && node.attrs.number);
      // The verse tag's inner text is just the printed verse number - skip it.
      current = { verse: num, parts: [] };
      verses.push(current);
      return;
    }
    if (node.type === "text") {
      if (current && typeof node.text === "string") current.parts.push(node.text);
      return;
    }
    if (node.items) walk(node.items);
  }

  walk(block.items || []);

  return verses.map((v) => ({
    verse: v.verse,
    text: cleanText(v.parts.join("")),
  }));
}

function convertChapter(chapterNumber, content) {
  const blocks = [];
  for (const node of content || []) {
    if (!node || node.type !== "tag") continue;
    const style = (node.attrs && node.attrs.style) || "p";
    const verses = extractVersesFromBlock(node);
    // Heading blocks (s1, s2, ...) carry title text but no verses.
    const headingText =
      verses.length === 0 ? cleanText(collectPlainText(node)) : "";
    const blockText =
      verses.length > 0
        ? cleanText(verses.map((v) => v.text).join(" "))
        : headingText;
    blocks.push({ style, verses, text: blockText });
  }
  return { chapter: String(chapterNumber), blocks };
}

function collectPlainText(node) {
  let out = "";
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === "text" && typeof n.text === "string") out += n.text;
    if (n.items) walk(n.items);
  };
  walk(node.items || []);
  return out;
}

async function convertBook(meta) {
  const chapters = [];
  for (let ch = 1; ch <= meta.chapterCount; ch++) {
    const body = await fetchChapterJson(meta.id, ch);
    if (!body || !body.data) throw new Error(`No data for ${meta.id}.${ch}`);
    chapters.push(convertChapter(ch, body.data.content));
    await sleep(120); // be polite to the API
  }
  return {
    book: meta.name,
    bookId: meta.id,
    count: meta.chapterCount,
    chapters,
  };
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const targets = only.length
    ? BOOKS.filter((b) => only.includes(b.id))
    : BOOKS;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let done = 0;
  for (const meta of targets) {
    process.stdout.write(`Fetching ${meta.id} (${meta.chapterCount} ch)... `);
    const book = await convertBook(meta);
    const outFile = path.join(OUT_DIR, `${meta.id}.json`);
    fs.writeFileSync(outFile, JSON.stringify(book));
    done++;
    console.log(`done -> ${path.relative(process.cwd(), outFile)}`);
  }
  console.log(`\nWrote ${done} book(s) to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});

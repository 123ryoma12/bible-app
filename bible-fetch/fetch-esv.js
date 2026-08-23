// One-off importer: fetches the ESV from api.esv.org and converts each book
// into the app's NIV-shaped JSON under assets/bible/esv/<BOOKID>.json.
//
// NOTE ON LICENSING: ESV text is copyrighted by Crossway. Use of this data is
// subject to the api.esv.org license terms (attribution, usage limits). The
// project owner has accepted responsibility for compliance.
//
// Output shape (matches assets/bible/niv/*.json):
//   { book, bookId, count, chapters: [ { chapter, blocks: [
//       { style, verses: [ { verse, text } ], text } ] } ] }
//
// The ESV text endpoint returns a plain-text passage where:
//   - headings sit on their own line (no [n] verse marker),
//   - verses are marked inline as "[n] ...".
// We fetch ONE chapter per request (q="Book N") - always <= one chapter of
// verses, comfortably under the 500-verse cap - and parse the text into blocks.
//
// Rate limits (api.esv.org): 60/min, 1000/hr, 5000/day. We pace at ~40/min.
//
// Usage:
//   node bible-fetch/fetch-esv.js            # all 66 books
//   node bible-fetch/fetch-esv.js JHN PSA    # only the given book ids
//
// Node 18+ (global fetch). Token from ESV_API_TOKEN env or --token=...

const fs = require("fs");
const path = require("path");

const BOOKS = (() => {
  const src = fs.readFileSync(path.join(__dirname, "../src/data/books.js"), "utf8");
  return JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));
})();

const BASE = "https://api.esv.org/v3/passage/text/";
const OUT_DIR = path.join(__dirname, "../assets/bible/esv");
const CACHE_DIR = path.join(__dirname, ".cache/esv");
const REQUEST_SPACING_MS = 1500; // ~40 requests/min - safely under 60/min

const TOKEN =
  process.env.ESV_API_TOKEN ||
  (process.argv.find((a) => a.startsWith("--token=")) || "").slice(8);

if (!TOKEN) {
  console.error("Missing ESV token. Set ESV_API_TOKEN or pass --token=...");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanText(s) {
  return String(s || "")
    .replace(/\u00B6/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fetch one chapter's plain text (cached). `ref` is like "John 3".
async function fetchChapterText(bookName, chapter) {
  const safeName = bookName.replace(/\s+/g, "_");
  const cacheFile = path.join(CACHE_DIR, `${safeName}.${chapter}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8")).passages[0] || "";
  }
  const params = new URLSearchParams({
    q: `${bookName} ${chapter}`,
    "include-passage-references": "false",
    "include-verse-numbers": "true",
    "include-first-verse-numbers": "true",
    "include-footnotes": "false",
    "include-headings": "true",
    "include-short-copyright": "false",
    "include-passage-horizontal-lines": "false",
    "include-heading-horizontal-lines": "false",
    "indent-poetry": "false",
    "include-selahs": "true",
  });
  const url = `${BASE}?${params.toString()}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Token ${TOKEN}` } });
      if (res.status === 429) {
        await sleep(4000 * attempt); // throttled - back off hard
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(body));
      return (body.passages && body.passages[0]) || "";
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(1200 * attempt);
    }
  }
}

// Parse one chapter's ESV plain text into NIV-style blocks.
//
// Strategy: split into lines. A non-empty line with NO leading/embedded [n]
// verse marker is a heading (style "s1"). Any line/segment containing [n]
// markers is verse content (style "p"); we split it on the markers to recover
// { verse, text }. Consecutive verse content accumulates into one paragraph
// block; a heading flushes the current paragraph and emits its own block.
function convertChapter(chapterNumber, passageText) {
  const lines = String(passageText || "")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""));

  const blocks = [];
  let pending = null; // current paragraph: { style:"p", verses:[], text:"" }

  const flush = () => {
    if (pending && pending.verses.length) {
      pending.text = cleanText(pending.verses.map((v) => v.text).join(" "));
      blocks.push(pending);
    }
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const hasVerseMarker = /\[\d+\]/.test(line);
    if (!hasVerseMarker) {
      // Heading line (no verse markers). Flush any open paragraph first.
      flush();
      blocks.push({ style: "s1", verses: [], text: cleanText(line) });
      continue;
    }
    // Verse content. Split into [n] segments and append to the pending paragraph.
    if (!pending) pending = { style: "p", verses: [], text: "" };
    const parts = line.split(/\[(\d+)\]/); // ["", "1", "text", "2", "text", ...]
    // parts[0] is any text before the first marker (rare - continuation); if it
    // has content, append to the previous verse in this paragraph.
    if (parts[0] && parts[0].trim() && pending.verses.length) {
      const last = pending.verses[pending.verses.length - 1];
      last.text = cleanText(`${last.text} ${parts[0]}`);
    }
    for (let i = 1; i < parts.length; i += 2) {
      const verseNum = Number(parts[i]);
      const text = cleanText(parts[i + 1] || "");
      const existing = pending.verses.find((v) => v.verse === verseNum);
      if (existing) {
        existing.text = cleanText(`${existing.text} ${text}`);
      } else {
        pending.verses.push({ verse: verseNum, text });
      }
    }
  }
  flush();

  return { chapter: String(chapterNumber), blocks };
}

async function convertBook(meta) {
  const chapters = [];
  for (let ch = 1; ch <= meta.chapterCount; ch++) {
    const text = await fetchChapterText(meta.name, ch);
    chapters.push(convertChapter(ch, text));
    await sleep(REQUEST_SPACING_MS);
  }
  return { book: meta.name, bookId: meta.id, count: meta.chapterCount, chapters };
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const targets = only.length ? BOOKS.filter((b) => only.includes(b.id)) : BOOKS;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let done = 0;
  for (const meta of targets) {
    process.stdout.write(`Fetching ESV ${meta.id} (${meta.chapterCount} ch)... `);
    const book = await convertBook(meta);
    const outFile = path.join(OUT_DIR, `${meta.id}.json`);
    fs.writeFileSync(outFile, JSON.stringify(book));
    done++;
    console.log(`done -> ${path.relative(process.cwd(), outFile)}`);
  }
  console.log(`\nWrote ${done} ESV book(s) to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});

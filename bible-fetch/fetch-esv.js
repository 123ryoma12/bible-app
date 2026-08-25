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

// A token is only required when we actually hit the network. In --from-cache
// mode we rebuild solely from previously cached text, so no token is needed.
if (!TOKEN && !process.argv.includes("--from-cache")) {
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

// When true, regenerate purely from the local cache (no network). Useful after
// a parser change: `node bible-fetch/fetch-esv.js --from-cache` rebuilds every
// assets/bible/esv/*.json from the already-fetched raw text, no token needed.
const FROM_CACHE = process.argv.includes("--from-cache");

// Fetch one chapter's plain text (cached). A number after a one-chapter book
// is interpreted by the ESV API as a VERSE reference (e.g. "3 John 1" means
// verse 1), so those books must be queried by name alone.
async function fetchChapterText(bookName, chapter, isSingleChapterBook = false) {
  const safeName = bookName.replace(/\s+/g, "_");
  const reference = isSingleChapterBook ? bookName : `${bookName} ${chapter}`;
  const cacheKey = isSingleChapterBook ? "full-book" : chapter;
  const cacheFile = path.join(CACHE_DIR, `${safeName}.${cacheKey}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf8")).passages[0] || "";
  }
  if (FROM_CACHE) {
    throw new Error(`--from-cache but no cached text for ${reference}`);
  }
  const params = new URLSearchParams({
    q: reference,
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
// The ESV text endpoint encodes structure through LINE INDENTATION, which is
// the key signal (so we must NOT trim before inspecting it):
//   - Headings: indent 0, NO [n] marker, separated from verses by a blank line.
//   - Prose: paragraph-start lines are indented 2 spaces ("  [1] ...") and pack
//     the whole paragraph's verses onto one physical line.
//   - Poetry: every line is indent 0. The first line of a verse carries its
//     "[n]" marker; continuation lines have NO marker and follow immediately
//     (no blank line between them).
//
// Distinguishing the two indent-0, marker-less cases (heading vs poetry
// continuation): a heading follows a blank line (nothing "open"), while a
// poetry continuation follows a verse line with no blank line in between. We
// track that with `openPoetryVerse` (the verse a continuation would extend),
// which a blank line clears.
//
// Poetry is emitted as one "q1" block per source line (each carrying its
// verse), so the reader shows real line breaks; the renderer prints a verse
// number only the first time it sees it, so multi-line verses number once.
// Prose stays a single flowing "p" paragraph, exactly as before.
//
// `bookId` enables Psalm-specific handling: a Psalm's superscription (e.g.
// "A Psalm of David.") is part of the biblical text, not an editorial section
// heading, so it is retagged from "s1" to "d" (descriptive title) — see
// markPsalmSuperscription below.
function convertChapter(chapterNumber, passageText, bookId) {
  // Keep raw lines (do NOT trim) so we can read the leading indent. Strip only
  // trailing whitespace.
  const lines = String(passageText || "")
    .split("\n")
    .map((l) => l.replace(/\s+$/g, ""));

  const blocks = [];
  // Open prose paragraph: { style:"p", verses:[], text:"" }.
  let pending = null;
  // Verse number of the poetry line most recently emitted, so a following
  // markerless (continuation) line attaches to it. Cleared by a blank line.
  let openPoetryVerse = null;
  // Verse number most recently emitted anywhere in the chapter (prose or
  // poetry), surviving blank lines. Used to attach verse CONTINUATIONS that the
  // ESV separates from their verse with a blank line - e.g. the second half of
  // a salutation ("Grace to you and peace...", Rom 1:7) or an embedded poetic
  // quotation ("That you may be justified...", Rom 3:4). Without this we would
  // mis-tag those continuation lines as editorial section headings.
  let lastVerse = null;

  const flush = () => {
    if (pending && pending.verses.length) {
      pending.text = cleanText(pending.verses.map((v) => v.text).join(" "));
      blocks.push(pending);
    }
    pending = null;
  };

  // Emit a poetry line as its own indented block. `verse` is the verse this line
  // belongs to; the renderer only prints the number the first time it appears.
  const pushPoetry = (verse, text) => {
    const t = cleanText(text);
    if (!t) return;
    if (verse != null) lastVerse = verse;
    blocks.push({
      style: "q1",
      verses: verse != null ? [{ verse, text: t }] : [],
      text: t,
    });
  };

  // Distinguish an embedded poetic line (part of the current verse) from a real
  // editorial section heading when both arrive as markerless, unindented lines
  // separated from their verse by a blank line. ESV headings are Title Case
  // prose fragments that never carry clause/sentence punctuation and never open
  // with a quote glyph; poetic verse lines routinely do. A line is therefore
  // treated as POETRY (not a heading) when any of these hold:
  //   - it opens with a quotation mark (embedded quote, e.g. Rom 3:4), or
  //   - it opens with a lowercase letter or a non-letter (a continuation such as
  //     "and prevail...", or a bracketed acrostic remnant "[...]"), or
  //   - it ends with clause punctuation ("," ";" ":") - a poetic line-break that
  //     no ESV heading ever uses (e.g. Dan 7:9 "thrones were placed,").
  // This preserves genuine headings, including ESV speaker labels ("He",
  // "Others") and Hebrew acrostic letters ("Aleph"), which are Title Case and
  // unpunctuated.
  const QUOTE_CHARS = "\u201C\u201D\u2018\u2019\"'";
  const looksLikePoetryLine = (s) => {
    if (!s) return false;
    const first = s[0];
    if (QUOTE_CHARS.includes(first)) return true;
    if (!/[A-Za-z]/.test(first)) return true; // starts with [ , digit, etc.
    if (first === first.toLowerCase() && first !== first.toUpperCase()) return true; // lowercase
    const last = s[s.length - 1];
    if (last === "," || last === ";" || last === ":") return true;
    return false;
  };

  for (const rawLine of lines) {
    const indent = (rawLine.match(/^(\s*)/)[1] || "").length;
    const line = rawLine.trim();
    if (!line) {
      // Blank line: closes any prose paragraph and any open poetry verse.
      flush();
      openPoetryVerse = null;
      continue;
    }
    const hasVerseMarker = /\[\d+\]/.test(line);

    if (!hasVerseMarker) {
      if (openPoetryVerse != null) {
        // Continuation line of the current poetry verse (no blank line before).
        pushPoetry(openPoetryVerse, line);
      } else if (indent >= 2 && lastVerse != null) {
        // Indented, markerless line with a blank line before it: this is a PROSE
        // continuation of the current verse that the ESV split onto its own
        // paragraph (e.g. the salutation's second half, "Grace to you and
        // peace...", Rom 1:7). Headings are never indented, so this is never a
        // heading. Re-open a prose paragraph carrying it under the last verse.
        if (!pending) pending = { style: "p", verses: [] };
        const existing = pending.verses.find((v) => v.verse === lastVerse);
        if (existing) {
          existing.text = cleanText(`${existing.text} ${line}`);
        } else {
          pending.verses.push({ verse: lastVerse, text: cleanText(line) });
        }
      } else if (indent === 0 && lastVerse != null && looksLikePoetryLine(line)) {
        // Indent-0 markerless line that reads as verse text (embedded quotation
        // or a poetic continuation), NOT an editorial heading - e.g. Rom 3:4
        // "That you may be justified...", Dan 7:9 "thrones were placed,". Emit it
        // as poetry under the last verse and keep it open so subsequent
        // markerless lines in the same stanza continue it.
        flush();
        pushPoetry(lastVerse, line);
        openPoetryVerse = lastVerse;
      } else {
        // Genuine section heading (nothing open, unindented, not a quotation).
        flush();
        blocks.push({ style: "s1", verses: [], text: cleanText(line) });
      }
      continue;
    }

    // Line carries [n] marker(s). A 2-space indent means a prose paragraph
    // start; indent 0 means a poetry verse's first line.
    const parts = line.split(/\[(\d+)\]/); // ["", "1", "text", "2", "text", ...]
    const leading = parts[0] ? parts[0].trim() : "";
    const isProse = indent >= 2;

    if (isProse) {
      // Prose: accumulate the whole paragraph into one flowing "p" block.
      openPoetryVerse = null;
      if (!pending) pending = { style: "p", verses: [], text: "" };
      if (leading && pending.verses.length) {
        const last = pending.verses[pending.verses.length - 1];
        last.text = cleanText(`${last.text} ${leading}`);
      }
      for (let i = 1; i < parts.length; i += 2) {
        const verseNum = Number(parts[i]);
        const text = cleanText(parts[i + 1] || "");
        lastVerse = verseNum;
        const existing = pending.verses.find((v) => v.verse === verseNum);
        if (existing) {
          existing.text = cleanText(`${existing.text} ${text}`);
        } else {
          pending.verses.push({ verse: verseNum, text });
        }
      }
      continue;
    }

    // Poetry: first line of one (or more) verses. Flush any open prose first,
    // then emit each verse segment on the line as its own poetry line. The last
    // verse on the line stays "open" so a following markerless line continues it.
    flush();
    // Rare: leading text before the first marker continues the prior verse.
    if (leading && openPoetryVerse != null) pushPoetry(openPoetryVerse, leading);
    for (let i = 1; i < parts.length; i += 2) {
      const verseNum = Number(parts[i]);
      pushPoetry(verseNum, parts[i + 1] || "");
      openPoetryVerse = verseNum;
    }
  }
  flush();

  if (bookId === "PSA") markPsalmSuperscription(blocks);

  return { chapter: String(chapterNumber), blocks };
}

// In Psalms, the superscription (e.g. "A Psalm of David.", "To the choirmaster.
// A Psalm of David.") is part of the inspired Hebrew text, unlike the ESV's
// editorial section headings which are not. Both arrive as markerless lines and
// are initially tagged "s1", so we retag the superscription to "d" (descriptive
// title) which the reader styles distinctly (italic, subdued) rather than as a
// bold heading.
//
// Not every Psalm has a superscription (e.g. Ps 1, 2, 150 open with only an
// editorial heading), so position alone is insufficient - we must recognise the
// superscription by its wording. ESV superscriptions use a bounded, formulaic
// vocabulary and always open with one of these forms:
//   - "To the choirmaster..."         (performance direction)
//   - "A Psalm/Song/Prayer/Maskil/Miktam/Shiggaion/Testimony..."  (genre)
//   - "Of David/Solomon/Asaph/..."    (attribution: "Of " + a proper name)
// Validated against all 150 Psalms: this matcher tags every real superscription
// (116 of them) and never matches an editorial heading or Psalm 119's acrostic
// label "Aleph".
const PSALM_SUPERSCRIPTION_RE =
  /^(To the choirmaster|A (Psalm|Song|Prayer|Maskil|Miktam|Shiggaion|Testimony)\b|Of [A-Z])/;

function markPsalmSuperscription(blocks) {
  for (const b of blocks) {
    // The superscription precedes all verses - stop once verse text begins.
    if (b.verses && b.verses.length) break;
    if (b.style === "s1" && b.text && PSALM_SUPERSCRIPTION_RE.test(b.text.trim())) {
      b.style = "d";
      break; // at most one superscription per psalm
    }
  }
}

async function convertBook(meta) {
  const chapters = [];
  for (let ch = 1; ch <= meta.chapterCount; ch++) {
    const text = await fetchChapterText(meta.name, ch, meta.chapterCount === 1);
    chapters.push(convertChapter(ch, text, meta.id));
    // No need to pace when rebuilding offline from cache.
    if (!FROM_CACHE) await sleep(REQUEST_SPACING_MS);
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

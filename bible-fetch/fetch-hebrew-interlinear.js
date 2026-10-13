// STEPBible TAHOT + TEHMC (CC BY 4.0) → chapter assets for the reader.
// Usage: node bible-fetch/fetch-hebrew-interlinear.js [GEN EXO ...]
// See assets/bible/interlinear/SOURCES.md for attribution and transformations.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(__dirname, ".cache", "hebrew-interlinear");
const SOURCE = "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/";
const PARTS = ["Gen-Deu", "Jos-Est", "Job-Sng", "Isa-Mal"];
const MORPH_FILE = "TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt";

function parseMorphology(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const labels = new Map();
  lines.forEach((line, i) => {
    const match = line.match(/^([HA][A-Za-z0-9]+)\tFunction=/);
    if (match) labels.set(match[1], lines[i + 1].trim().replace(/^"|"$/g, ""));
  });
  if (!labels.size) throw new Error("No TEHMC morphology definitions found");
  return labels;
}

function expandMorphology(code, labels) {
  if (!code) return "";
  const language = code[0];
  return code.slice(1).split("/").filter((part) => part.trim()).map((part) => {
    const key = language + part.trim();
    const label = labels.get(key);
    if (!label) throw new Error(`Unknown Hebrew/Aramaic morphology: ${key}`);
    return label;
  }).join(" + ");
}

function parseTAHOT(text, labels) {
  const books = {};
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split("\t");
    // Always use the English reference before parentheses, not the Hebrew
    // reference inside them. Psalm headings use verse 0 and remain separate.
    const ref = cols[0].match(/^(\w+)\.(\d+)\.(\d+)(?:\([^)]*\))?#\d+[a-z]?=(.+)$/);
    if (!ref) continue; // Skip the duplicate interlinear summary and headers.
    if (cols.length < 12) throw new Error(`Incomplete TAHOT row: ${cols[0]}`);
    if (!cols[1].trim()) continue; // A Qere omission has no spoken word.

    const [, book, chapter, verse, textType] = ref;
    const roots = [...cols[11].matchAll(/\{([^={}]+)=([^={}]+)=([^{}]*)\}/g)];
    const word = {
      hebrew: cols[1].replace(/[\/\\]/g, "").trim(),
      language: cols[5].startsWith("A") ? "arc" : "he",
      translit: cols[2].replace(/\//g, "").trim(),
      gloss: cols[3].replace(/\s*\/\s*/g, " ").trim(),
      strongs: [...new Set(roots.map((root) => root[1]))].join(" / "),
      morph: expandMorphology(cols[5], labels),
      morphCode: cols[5],
      lemma: roots.map((root) => root[2]).join(" · "),
      lemmaGloss: roots.map((root) => root[3].split("»")[0].replace(/^:\s*/, "").replace(/_/g, " ")).join("; "),
    };
    if (textType.startsWith("X")) word.textualNote = "Additional text reconstructed from the Septuagint in TAHOT.";
    if (textType.startsWith("R")) word.textualNote = "Text restored from a parallel passage in TAHOT.";
    if (!word.strongs || !word.morph) throw new Error(`Missing word details: ${cols[0]}`);
    const chapters = books[book.toUpperCase()] ??= {};
    const verses = chapters[Number(chapter)] ??= {};
    (verses[Number(verse)] ??= []).push(word);
  }
  return books;
}

function download(folder, filename) {
  fs.mkdirSync(CACHE, { recursive: true });
  const target = path.join(CACHE, filename);
  if (!fs.existsSync(target)) {
    const url = SOURCE + [folder, filename].map(encodeURIComponent).join("/");
    // Rename only after a successful download, so failures don't poison cache.
    execFileSync("curl", ["-L", "--fail", "--silent", "--show-error", "--retry", "3", url, "-o", target + ".tmp"]);
    fs.renameSync(target + ".tmp", target);
  }
  return fs.readFileSync(target, "utf8");
}

function main() {
  const source = fs.readFileSync(path.join(ROOT, "src/data/books.js"), "utf8");
  const books = JSON.parse(source.match(/export const BOOKS = (\[[\s\S]*?\n\]);/)[1])
    .filter((book) => book.testament === "OT");
  const only = process.argv.slice(2).map((id) => id.toUpperCase());
  if (only.some((id) => !books.some((book) => book.id === id))) throw new Error("Expected Old Testament book IDs");
  const labels = parseMorphology(download("Morphology codes", MORPH_FILE));
  const parsed = {};
  for (const part of PARTS) {
    const filename = `TAHOT ${part} - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt`;
    Object.assign(parsed, parseTAHOT(download("Translators Amalgamated OT+NT", filename), labels));
  }
  const targets = books.filter((book) => !only.length || only.includes(book.id));
  // Validate every selected book before writing any assets.
  for (const book of targets) {
    const chapters = parsed[book.id];
    if (!chapters || Object.keys(chapters).length !== book.chapterCount) throw new Error(`Incomplete book: ${book.id}`);
    for (let chapter = 1; chapter <= book.chapterCount; chapter++) {
      if (!chapters[chapter]?.[1]?.length) throw new Error(`Missing chapter: ${book.id} ${chapter}`);
    }
  }
  for (const book of targets) {
    const dir = path.join(ROOT, "assets/bible/interlinear", book.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [chapter, verses] of Object.entries(parsed[book.id])) {
      const payload = { book: book.name, bookId: book.id, chapter: Number(chapter), verses };
      fs.writeFileSync(path.join(dir, `${chapter}.txt`), JSON.stringify(payload) + "\n");
    }
    console.log(`${book.id}: ${book.chapterCount} chapters`);
  }
  execFileSync("python3", [path.join(ROOT, "scripts/split-bible-chapters.py")], { stdio: "inherit" });
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { parseMorphology, expandMorphology, parseTAHOT };

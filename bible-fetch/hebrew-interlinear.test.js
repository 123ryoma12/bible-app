const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseMorphology, expandMorphology, parseTAHOT } = require("./fetch-hebrew-interlinear");

// Selected upstream TAHOT/TEHMC rows, CC BY 4.0; attribution in
// assets/bible/interlinear/SOURCES.md. Tests run without network or cache.
const fixture = (name) => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
  return name.endsWith(".json") ? JSON.parse(text).join("\n") : text;
};
const labels = parseMorphology(fixture("tehmc.txt"));
const parsed = parseTAHOT(fixture("tahot.json"), labels);
const assets = path.join(__dirname, "../assets/bible");
const chapter = (book, number) => JSON.parse(fs.readFileSync(path.join(assets, "interlinear", book, `${number}.txt`), "utf8"));

test("preserves Hebrew pointing, reads distinct columns, and expands prefix grammar", () => {
  const word = parsed.GEN[1][1][0];
  assert.equal(word.hebrew, "בְּרֵאשִׁ֖ית");
  assert.equal(word.translit, "be.re.Shit");
  assert.equal(word.gloss, "in beginning");
  assert.equal(word.strongs, "H7225G");
  assert.equal(word.lemma, "רֵאשִׁית");
  assert.equal(word.lemmaGloss, "beginning");
  assert.equal(word.morph, "Preposition + Noun (Singular Feminine, Absolute)");
  assert.equal(parsed.GEN[1][1].length, 2);
  assert.throws(() => expandMorphology("HUnknown", labels), /Unknown/);
});

test("uses English numbering and keeps Psalm titles outside verse 1", () => {
  assert.ok(parsed.ISA[9][1].length);
  assert.equal(parsed.ISA[8], undefined);
  assert.ok(parsed.PSA[3][0].length);
  assert.equal(parsed.PSA[3][1], undefined);
  assert.match(chapter("MAL", 4).verses[1][0].hebrew, /[\u05d0-\u05ea]/);
});

test("recognises Aramaic within a verse and omits empty Qere readings", () => {
  assert.ok(parsed.DAN[2][4].some((word) => word.language === "arc"));
  assert.ok(parsed.DAN[2][4].some((word) => word.language === "he"));
  assert.equal(parsed.JDG, undefined);
});

test("labels reconstructed text and ignores duplicate summary rows", () => {
  assert.ok(parsed.GEN[4][8].some((word) => word.textualNote?.includes("Septuagint")));
  const original = fixture("tahot.json");
  assert.deepEqual(parseTAHOT("# Gen.1.1\tduplicate summary\n" + original, labels), parsed);
});

test("all 39 OT books and 929 chapters cover every numbered NIV verse", () => {
  const booksSource = fs.readFileSync(path.join(__dirname, "../src/data/books.js"), "utf8");
  const books = JSON.parse(booksSource.match(/export const BOOKS = (\[[\s\S]*?\n\]);/)[1])
    .filter((book) => book.testament === "OT");
  const manifest = fs.readFileSync(path.join(__dirname, "../src/data/bibleChapterAssets.js"), "utf8");
  assert.equal(books.length, 39);
  let count = 0;
  for (const book of books) {
    for (let number = 1; number <= book.chapterCount; number++) {
      const data = chapter(book.id, number);
      assert.equal(data.bookId, book.id);
      assert.equal(data.chapter, number);
      assert.ok(manifest.includes(`assets/bible/interlinear/${book.id}/${number}.txt`));
      const niv = JSON.parse(fs.readFileSync(path.join(assets, "niv", book.id, `${number}.txt`), "utf8"));
      for (const block of niv.chapter.blocks) {
        for (const verse of block.verses) {
          if (/^\d+$/.test(verse.verse)) assert.ok(data.verses[verse.verse]?.length, `${book.id} ${number}:${verse.verse}`);
        }
      }
      for (const words of Object.values(data.verses)) {
        for (const word of words) {
          assert.ok(word.hebrew && word.translit && word.gloss && word.strongs && word.morph && word.lemma);
          assert.ok(["he", "arc"].includes(word.language));
        }
      }
      count++;
    }
  }
  assert.equal(count, 929);
});

test("Greek chapter assets retain their existing word format", () => {
  const word = chapter("JHN", 1).verses[1][0];
  assert.ok(word.greek && word.translit && word.gloss && word.strongs && word.morph);
  assert.equal(word.hebrew, undefined);
});

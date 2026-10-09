#!/usr/bin/env python3
"""Generate bundled per-book intro assets from the canonical combined JSON."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "book-info.json"
OUTPUT = ROOT / "data" / "book-intros"
NAME_OVERRIDES = {"Psalm": "Psalms", "Song of Songs": "Song of Solomon"}


def main():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    books_source = (ROOT / "src" / "data" / "books.js").read_text(encoding="utf-8")
    match = re.search(r"export const BOOKS = (\[.*?\]);", books_source, re.DOTALL)
    if not match:
        raise ValueError("Could not read BOOKS from src/data/books.js")
    books = json.loads(match.group(1))

    expected = {NAME_OVERRIDES.get(book["name"], book["name"]) for book in books}
    if set(source) != expected:
        raise ValueError(f"Intro books differ: missing={expected - set(source)}, extra={set(source) - expected}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for book in books:
        name = NAME_OVERRIDES.get(book["name"], book["name"])
        target = OUTPUT / f"{book['id']}.txt"
        target.write_text(json.dumps(source[name], ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    print(f"Wrote {len(books)} book intros to {OUTPUT}")


if __name__ == "__main__":
    main()

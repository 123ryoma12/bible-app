#!/usr/bin/env python3
"""Generate per-book study note assets from the canonical combined JSON."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "study_notes.json"
OUTPUT = ROOT / "data" / "study-notes"


def main():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    books_source = (ROOT / "src" / "data" / "books.js").read_text(encoding="utf-8")
    match = re.search(r"export const BOOKS = (\[.*?\]);", books_source, re.DOTALL)
    if not match:
        raise ValueError("Could not read BOOKS from src/data/books.js")
    books = json.loads(match.group(1))

    names = {book["name"] for book in books}
    note_names = {"Song of Songs": "Song Of Solomon"}
    expected = {note_names.get(name, name) for name in names}
    if set(source) != expected:
        raise ValueError(f"Study note books differ: missing={expected - set(source)}, extra={set(source) - expected}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for book in books:
        name = note_names.get(book["name"], book["name"])
        target = OUTPUT / f"{book['id']}.json"
        target.write_text(json.dumps(source[name], ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    print(f"Wrote {len(books)} books and {sum(len(notes) for notes in source.values())} notes to {OUTPUT}")


if __name__ == "__main__":
    main()

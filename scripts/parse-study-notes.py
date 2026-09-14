#!/usr/bin/env python3
"""
Parse study notes from studybible.epub into study_notes_new.json.

Format per entry:
  {
    "chapter": "1",
    "verse_ref": "1:2",
    "verse_quote": "The earth.",   <- quoted phrase from verse (empty string if none)
    "note": "Full note text..."
  }
"""

import zipfile, re, json, os

EPUB_PATH = os.path.join(os.path.dirname(__file__), '..', 'studybible.epub')
OUT_PATH  = os.path.join(os.path.dirname(__file__), '..', 'data', 'study_notes_new.json')

# Map notesubhead book name -> canonical name matching existing study_notes.json keys
BOOK_NAME_MAP = {
    'GENESIS':         'Genesis',
    'EXODUS':          'Exodus',
    'LEVITICUS':       'Leviticus',
    'NUMBERS':         'Numbers',
    'DEUTERONOMY':     'Deuteronomy',
    'JOSHUA':          'Joshua',
    'JUDGES':          'Judges',
    'RUTH':            'Ruth',
    '1 SAMUEL':        '1 Samuel',
    '2 SAMUEL':        '2 Samuel',
    '1 KINGS':         '1 Kings',
    '2 KINGS':         '2 Kings',
    '1 CHRONICLES':    '1 Chronicles',
    '2 CHRONICLES':    '2 Chronicles',
    'EZRA':            'Ezra',
    'NEHEMIAH':        'Nehemiah',
    'ESTHER':          'Esther',
    'JOB':             'Job',
    'PSALM':           'Psalm',
    'PROVERBS':        'Proverbs',
    'ECCLESIASTES':    'Ecclesiastes',
    'SONG OF SOLOMON': 'Song Of Solomon',
    'ISAIAH':          'Isaiah',
    'JEREMIAH':        'Jeremiah',
    'LAMENTATIONS':    'Lamentations',
    'EZEKIEL':         'Ezekiel',
    'DANIEL':          'Daniel',
    'HOSEA':           'Hosea',
    'JOEL':            'Joel',
    'AMOS':            'Amos',
    'OBADIAH':         'Obadiah',
    'JONAH':           'Jonah',
    'MICAH':           'Micah',
    'NAHUM':           'Nahum',
    'HABAKKUK':        'Habakkuk',
    'ZEPHANIAH':       'Zephaniah',
    'HAGGAI':          'Haggai',
    'ZECHARIAH':       'Zechariah',
    'MALACHI':         'Malachi',
    'MATTHEW':         'Matthew',
    'MARK':            'Mark',
    'LUKE':            'Luke',
    'JOHN':            'John',
    'ACTS':            'Acts',
    'ROMANS':          'Romans',
    '1 CORINTHIANS':   '1 Corinthians',
    '2 CORINTHIANS':   '2 Corinthians',
    'GALATIANS':       'Galatians',
    'EPHESIANS':       'Ephesians',
    'PHILIPPIANS':     'Philippians',
    'COLOSSIANS':      'Colossians',
    '1 THESSALONIANS': '1 Thessalonians',
    '2 THESSALONIANS': '2 Thessalonians',
    '1 TIMOTHY':       '1 Timothy',
    '2 TIMOTHY':       '2 Timothy',
    'TITUS':           'Titus',
    'PHILEMON':        'Philemon',
    'HEBREWS':         'Hebrews',
    'JAMES':           'James',
    '1 PETER':         '1 Peter',
    '2 PETER':         '2 Peter',
    '1 JOHN':          '1 John',
    '2 JOHN':          '2 John',
    '3 JOHN':          '3 John',
    'JUDE':            'Jude',
    'REVELATION':      'Revelation',
}


def strip_tags(html):
    """Remove all HTML tags and normalize whitespace."""
    text = re.sub(r'<[^>]+>', '', html)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def get_bold_span_text(para_html):
    """Extract the text content of the rsb-studynote-bold span."""
    m = re.search(r'<span class="rsb-studynote-bold">(.*?)</span>', para_html, re.DOTALL)
    if m:
        return strip_tags(m.group(1))
    return ''


def get_text_after_bold(para_html):
    """Extract text that comes after the closing </span> of rsb-studynote-bold."""
    m = re.search(r'<span class="rsb-studynote-bold">.*?</span>(.*)', para_html, re.DOTALL)
    if m:
        return strip_tags(m.group(1))
    return strip_tags(para_html)


def parse_verse_ref_and_quote(bold_text, book_name_upper):
    """
    Given the bold span text like:
      "STUDY NOTE FOR GENESIS 1:2 The earth."
      "STUDY NOTE FOR GENESIS 1:3–31"
      "STUDY NOTE FOR GENESIS 1:1–2:3"
      "STUDY NOTE FOR EXODUS 9:15, 16 ..."     <- comma-separated verses
      "STUDY NOTE FOR EXODUS 9:31, 32 in bud..."
      "STUDY NOTE FOR Pss. 1; 2"               <- Psalms intro note
      "STUDY NOTE FOR Ps. 2"                   <- Psalm abbreviation

    Returns (verse_ref, verse_quote).
    verse_quote is everything after the verse ref inside the bold span, or '' if none.
    """
    # ref may be: 1:2  |  1:3–31  |  1:1–2:3  |  9:15, 16  |  1; 2
    # i.e. digits/colons/dashes optionally followed by ", digits" or "; digits"
    ref_pattern = r'[\d:–\-]+(?:[,;]\s*\d+)*'

    # Try matching with the canonical book name first
    pattern = r'^STUDY NOTE FOR ' + re.escape(book_name_upper) + r'\s+(' + ref_pattern + r')\s*(.*)'
    m = re.match(pattern, bold_text, re.DOTALL)

    # Psalms special case: "Ps." or "Pss." abbreviations
    if not m and book_name_upper == 'PSALM':
        pattern2 = r'^STUDY NOTE FOR Pss?\.\s+(' + ref_pattern + r')\s*(.*)'
        m = re.match(pattern2, bold_text, re.DOTALL)

    if not m:
        # Fallback: just grab the first ref-looking token after "STUDY NOTE FOR"
        m2 = re.search(r'STUDY NOTE FOR [^\d]*(' + ref_pattern + r')\s*(.*)', bold_text, re.DOTALL)
        if m2:
            return m2.group(1).strip(), m2.group(2).strip()
        return '', ''

    verse_ref = m.group(1).strip()
    verse_quote = m.group(2).strip()
    return verse_ref, verse_quote


def extract_inline_verse_ref(body):
    """
    For books like 2 John, 3 John, Obadiah where notes use plain rsb-studynote
    and embed the verse ref in an <a id="...VC..."> inside the bold span.
    Returns (verse_ref, verse_quote) or (None, None) if not found.

    Examples:
      <a id="Ob_VC1_1">1</a> vision.          -> ref="1", quote="vision."
      3, <a id="Ob_VC1_4">4</a>               -> ref="3, 4", quote=""
      <a id="n3_Jn_VC1">1</a>, <a ...>2</a>  -> ref="1, 2", quote=""
      <a id="n3_Jn_VC5">5</a>–8              -> ref="5–8", quote=""
    """
    bold_m = re.search(r'<span class="rsb-studynote-bold">(.*?)</span>', body, re.DOTALL)
    if not bold_m:
        return None, None

    bold_html = bold_m.group(1)

    # Must contain an <a id="...VC..."> to be a note header
    if 'VC' not in bold_html:
        return None, None

    # Extract all VC anchors
    anchor_ids = re.findall(r'<a[^>]+id="[^"]*VC[^"]*"[^>]*>(.*?)</a>', bold_html, re.DOTALL)
    if not anchor_ids:
        return None, None

    ref_parts = [strip_tags(a) for a in anchor_ids]

    # Check for text BEFORE the first anchor (e.g. "3, " before <a id="Ob_VC1_4">4</a>)
    first_anchor_pos = bold_html.find('<a')
    before_first = strip_tags(bold_html[:first_anchor_pos]).strip().rstrip(',').strip()

    # Text AFTER all anchors (strip commas/spaces from between multiple anchors)
    after_anchors = re.sub(r'<a[^>]+>.*?</a>', '', bold_html, flags=re.DOTALL)
    after_anchors = strip_tags(after_anchors).strip()
    # Strip leading comma/space (from between anchors like "1</a>, <a...>2</a>")
    after_anchors = re.sub(r'^[,\s]+', '', after_anchors)

    # Build verse ref
    if before_first and re.match(r'^\d', before_first):
        # Text before anchor is part of ref (e.g. "3, 4" where 3 is before anchor)
        # after_anchors will contain the before_first text too since we stripped all <a> tags
        # Remove it from after_anchors
        after_anchors = re.sub(r'^' + re.escape(before_first) + r'[,\s]*', '', after_anchors).strip()
        verse_ref = before_first + ', ' + ', '.join(ref_parts)
        verse_quote = after_anchors.strip()
    elif len(ref_parts) > 1:
        # Multiple anchors = comma-separated refs like "1, 2"
        verse_ref = ', '.join(ref_parts)
        verse_quote = after_anchors.strip()
    else:
        # Single anchor — check for range suffix like "–8" after it
        range_m = re.match(r'^[–\-](\d+)\s*(.*)', after_anchors)
        if range_m:
            verse_ref = f'{ref_parts[0]}–{range_m.group(1)}'
            verse_quote = range_m.group(2).strip()
        else:
            verse_ref = ref_parts[0]
            verse_quote = after_anchors.strip()

    return verse_ref, verse_quote


# Single-chapter books: verse refs are bare numbers, prefix with "1:"
SINGLE_CHAPTER_BOOKS = {
    'OBADIAH', 'PHILEMON', 'JUDE', '2 JOHN', '3 JOHN',
}


def normalize_verse_ref(verse_ref, book_name_upper):
    """For single-chapter books, prefix bare verse numbers with '1:'."""
    if book_name_upper not in SINGLE_CHAPTER_BOOKS:
        return verse_ref
    # If ref doesn't contain a colon, it's a bare verse number — prefix with "1:"
    if ':' not in verse_ref:
        return '1:' + verse_ref
    return verse_ref


def parse_file(content, book_name_upper):
    """
    Parse all study notes from one xhtml file.
    Returns list of {chapter, verse_ref, verse_quote, note} dicts.

    Handles two layouts:
      A) rsb-studynote-1 / rsb-studynote-break headers (most books)
      B) plain rsb-studynote with inline <a id="...VC..."> refs (2 John, 3 John, Obadiah, etc.)
    """
    notes = []

    # Find all rsb-studynote* paragraphs in order
    # Note: some paragraphs have multiple classes e.g. "rsb-studynote para-style-override-2"
    # We match any <p> whose class attribute starts with or contains rsb-studynote
    para_pattern = re.compile(
        r'<p class="(rsb-studynote[^"]*)"([^>]*)>(.*?)</p>',
        re.DOTALL
    )
    paras = para_pattern.findall(content)

    def normalize_cls(cls):
        """Get the primary rsb-studynote class from a potentially multi-class string."""
        parts = cls.split()
        for p in parts:
            if p in ('rsb-studynote-1', 'rsb-studynote-break'):
                return p
        return 'rsb-studynote'

    # Detect layout B: no rsb-studynote-1/break headers present
    has_headers = any(normalize_cls(cls) in ('rsb-studynote-1', 'rsb-studynote-break') for cls, _, _ in paras)

    current_note = None  # {chapter, verse_ref, verse_quote, parts: [str]}

    def flush():
        if current_note:
            note_text = ' '.join(p for p in current_note['parts'] if p)
            # Remove trailing "BACK TO BOOK X:Y" links
            note_text = re.sub(r'\s*BACK TO [A-Z\s]+ [\d:–\-,\s]+\s*$', '', note_text).strip()
            notes.append({
                'chapter': current_note['chapter'],
                'verse_ref': current_note['verse_ref'],
                'verse_quote': current_note['verse_quote'],
                'note': note_text,
            })

    for cls, attrs, body in paras:
        is_header = normalize_cls(cls) in ('rsb-studynote-1', 'rsb-studynote-break')

        # Also treat any paragraph (regardless of class) as a header if its bold span
        # starts with "STUDY NOTE FOR" — handles multi-class like "rsb-studynote para-style-override-2"
        if not is_header and has_headers:
            bold_text_check = get_bold_span_text(body)
            if bold_text_check.startswith('STUDY NOTE FOR'):
                is_header = True

        if is_header:
            # Layout A: explicit header paragraph
            flush()
            current_note = None

            bold_text = get_bold_span_text(body)
            after_bold = get_text_after_bold(body)

            verse_ref, verse_quote = parse_verse_ref_and_quote(bold_text, book_name_upper)
            if not verse_ref:
                continue

            verse_ref = normalize_verse_ref(verse_ref, book_name_upper)
            chapter_match = re.match(r'(\d+)', verse_ref)
            chapter = chapter_match.group(1) if chapter_match else '1'

            parts = []
            if after_bold:
                parts.append(after_bold)

            current_note = {
                'chapter': chapter,
                'verse_ref': verse_ref,
                'verse_quote': verse_quote,
                'parts': parts,
            }

        elif not has_headers:
            # Layout B: inline anchor-based refs
            verse_ref, verse_quote = extract_inline_verse_ref(body)

            if verse_ref is not None:
                # This para starts a new note
                flush()
                current_note = None

                verse_ref = normalize_verse_ref(verse_ref, book_name_upper)
                chapter_match = re.match(r'(\d+)', verse_ref)
                chapter = chapter_match.group(1) if chapter_match else '1'

                # The note body = text after the bold span
                after_bold = get_text_after_bold(body)
                parts = []
                if after_bold:
                    parts.append(after_bold)

                current_note = {
                    'chapter': chapter,
                    'verse_ref': verse_ref,
                    'verse_quote': verse_quote,
                    'parts': parts,
                }
            else:
                # Continuation paragraph
                if current_note is None:
                    continue
                text = strip_tags(body)
                if re.match(r'^BACK TO [A-Z\s]+ [\d:–\-,\s]+$', text):
                    continue
                if text:
                    current_note['parts'].append(text)

        else:
            # Layout A continuation paragraph
            if current_note is None:
                continue
            text = strip_tags(body)
            if re.match(r'^BACK TO [A-Z\s]+ [\d:–\-]+$', text):
                continue
            if text:
                current_note['parts'].append(text)

    flush()
    return notes


def get_book_name_upper(content):
    """Extract the all-caps book name from the notesubhead element."""
    m = re.search(r'class="notesubhead">STUDY NOTES FOR ([^<]+)<', content)
    if not m:
        return None
    # Strip trailing chapter number like " 1" or " 23"
    raw = m.group(1).strip()
    raw = re.sub(r'\s+\d+$', '', raw).strip()
    return raw


def main():
    result = {}

    with zipfile.ZipFile(EPUB_PATH, 'r') as z:
        xhtml_files = sorted([f for f in z.namelist() if f.endswith('.xhtml')])

        for fname in xhtml_files:
            content = z.read(fname).decode('utf-8')
            if 'rsb-studynote' not in content:
                continue

            book_name_upper = get_book_name_upper(content)
            if not book_name_upper:
                continue

            canonical = BOOK_NAME_MAP.get(book_name_upper)
            if not canonical:
                print(f'WARNING: no mapping for {book_name_upper!r} in {fname}')
                continue

            notes = parse_file(content, book_name_upper)

            if canonical not in result:
                result[canonical] = []
            result[canonical].extend(notes)

    # Write output
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sum(len(v) for v in result.values())
    print(f'Done. {len(result)} books, {total} notes -> {OUT_PATH}')

    # Quick sanity check: show first 3 Genesis notes
    print('\nSample (Genesis[:3]):')
    for entry in result.get('Genesis', [])[:3]:
        print(f'  {entry["verse_ref"]!r:12} quote={entry["verse_quote"]!r:30} note={entry["note"][:60]!r}...')


if __name__ == '__main__':
    main()

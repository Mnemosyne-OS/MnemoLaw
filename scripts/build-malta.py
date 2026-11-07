"""
build-malta — the Laws of Malta, copied once with the cartridge (doc 134 §16.16).

legislation.mt is the only source and it serves the consolidated text as a
PDF only (`/eli/cap/<n>/eng/pdf`, `/eli/sl/<n>/eng/pdf`); its CORS header
names its own origin, so a cartridge cannot read it live. This script reads
each PDF once and writes it in the Markdown the reader already understands
(`public/data/countries/README.md`), like the treaties (§16.15).

How a Maltese PDF is laid out (measured on Cap. 583, 2026-11-07):
 - body text is 10 pt, in a column that moves left and right with the page;
 - marginal notes are 8 pt: roman = the title of the article
   (`Interpretation.`), italic = its amendment history (`Amended by:`,
   `L.N. 204 of 2018.`), which is not law text and is dropped;
 - an article opens on a BOLD number alone (`5.`, `56A.`) at the start of a line;
 - every page opens with a running header (`GAMING [CAP. 583. 7`).

Usage (from apps/mnemo-law, PyMuPDF installed):
    python -I scripts/build-malta.py <pdf-cache-dir> [id ...]
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.request

import fitz  # PyMuPDF

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'data', 'countries', 'mt')
SITE = 'https://legislation.mt/eli'

# (identifier, ELI path, label shown in the list, reference, group, articles expected or None)
# The Gaming Act and its 12 regulations were listed by probing /eli/sl/583.N
# until the site answered with an HTML error page (583.13, 2026-11-07).
LAWS = [
    ('cap-583', 'cap/583', 'Gaming Act', 'Cap. 583', 'gaming', 60),
    ('sl-583.01', 'sl/583.1', 'Responsible Gaming Fund Regulations', 'S.L. 583.01', 'gaming', None),
    ('sl-583.02', 'sl/583.2', 'GamingMalta Fund Regulations', 'S.L. 583.02', 'gaming', None),
    ('sl-583.03', 'sl/583.3', 'Gaming Licence Fees Regulations', 'S.L. 583.03', 'gaming', None),
    ('sl-583.04', 'sl/583.4', 'Gaming Definitions Regulations', 'S.L. 583.04', 'gaming', None),
    ('sl-583.05', 'sl/583.5', 'Gaming Authorisations Regulations', 'S.L. 583.05', 'gaming', None),
    ('sl-583.06', 'sl/583.6', 'Gaming Compliance and Enforcement Regulations', 'S.L. 583.06', 'gaming', None),
    ('sl-583.07', 'sl/583.7', 'Gaming Premises Regulations', 'S.L. 583.07', 'gaming', None),
    ('sl-583.08', 'sl/583.8', 'Gaming Player Protection Regulations', 'S.L. 583.08', 'gaming', None),
    ('sl-583.09', 'sl/583.9', 'Gaming Commercial Communications Regulations', 'S.L. 583.09', 'gaming', None),
    ('sl-583.10', 'sl/583.10', 'Gaming Tax Regulations', 'S.L. 583.10', 'gaming', None),
    ('sl-583.11', 'sl/583.11', 'Social Causes Fund Regulations', 'S.L. 583.11', 'gaming', None),
    ('sl-583.12', 'sl/583.12', 'Retention of Data (Malta Gaming Authority) Regulations', 'S.L. 583.12', 'gaming', None),
]
# Laws read next to the gaming ones: the general list a person in Malta asks about.
GENERAL_FILE = os.path.join(HERE, 'malta-laws.json')
if os.path.exists(GENERAL_FILE):
    with open(GENERAL_FILE, encoding='utf-8') as f:
        for e in json.load(f):
            LAWS.append((e['id'], e['eli'], e['label'], e['reference'], e['group'], e.get('expect')))

BODY_MIN_SIZE = 8.6       # body is 10 pt; marginal notes and footnotes are 8 pt
PARA_GAP = 15.5           # lines of a paragraph are 12 pt apart, paragraphs ~22
HEADER_ZONE = 125         # the running header sits above this y
SCHEDULE = re.compile(r'^(?:(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH|THIRTEENTH|FOURTEENTH|FIFTEENTH)\s+)?SCHEDULE\b')
DIVISION = re.compile(r'^(BOOK|PART|TITLE|SUB-TITLE|CHAPTER)\b')
ARTICLE_NO = re.compile(r'^(\d{1,4})([A-Z]{0,3})\.$')
MIXED_DIVISION = re.compile(r'^(Book|Part|Title|Sub-title|Chapter)\s+[IVXLC]+\b')
REPEAL_RUN = re.compile(r'^Articles?\s+[\dA-Z]+(?:\s*(?:to|and|,)\s*[\dA-Z]+)*\s*,?\s*(?:both inclusive\s*,?\s*)?(?:were|was)\s+(?:repealed|deleted)\b[^.]*\.?\s*$', re.I)
LIST_ITEM = re.compile(r'^\(([a-z]{1,4}|\d{1,3})\)\s')
# A provision replaced by its repeal notice keeps its number and nothing else.
REPEALED = re.compile(r'^\s*(?:\[?(?:Repealed|Deleted)\b[^\n]*)\s*$', re.I)


def drop_repealed(lines):
    """Removes the articles whose whole text is a repeal notice; returns (lines, dropped)."""
    out, block, dropped = [], None, 0

    def close():
        nonlocal dropped
        if block is None:
            return
        body = '\n'.join(l for l in block if not l.startswith('#')).strip()
        if body and all(REPEALED.match(p) for p in body.split('\n\n')):
            dropped += 1
        else:
            out.extend(block)

    for l in lines:
        if l.startswith('#### Article '):
            close()
            block = [l]
        elif l.startswith('#') and not l.startswith('##### ') and block is not None:
            close()
            block = None
            out.append(l)
        elif block is not None:
            block.append(l)
        else:
            out.append(l)
    close()
    return out, dropped


def fetch(eli, cache):
    path = os.path.join(cache, eli.replace('/', '_') + '.pdf')
    if not os.path.exists(path):
        req = urllib.request.Request(f'{SITE}/{eli}/eng/pdf', headers={'User-Agent': 'Mozilla/5.0 (MnemoLaw build)'})
        with urllib.request.urlopen(req, timeout=120) as r:
            if 'pdf' not in r.headers.get('Content-Type', ''):
                raise RuntimeError(f'{eli}: not a PDF ({r.headers.get("Content-Type")})')
            data = r.read()
        with open(path, 'wb') as f:
            f.write(data)
        time.sleep(1.0)
    return path


def is_italic(span):
    return 'Italic' in span['font'] or bool(span['flags'] & 2)


def is_bold(span):
    return 'Bold' in span['font'] or bool(span['flags'] & 16)


def page_lines(page):
    """Body lines (list of spans, sorted by x) and marginal notes of one page."""
    body, margin = [], []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                if not s['text'].strip():
                    continue
                (margin if s['size'] < BODY_MIN_SIZE else body).append(s)
    lines = []
    for s in sorted(body, key=lambda s: (s['bbox'][3], s['bbox'][0])):
        if lines and abs(lines[-1][0]['bbox'][3] - s['bbox'][3]) < 3:
            lines[-1].append(s)
        else:
            lines.append([s])
    lines = [sorted(l, key=lambda s: s['bbox'][0]) for l in lines]
    # Running header: `GAMING [CAP. 583. 7` / `2 [S.L.583.05 GAMING AUTHORISATIONS`.
    while lines and lines[0][0]['bbox'][1] < HEADER_ZONE and re.search(r'\[\s*(CAP|S\.\s*L)', text_of(lines[0])):
        lines.pop(0)
    # Marginal notes: 8 pt spans grouped by vertical closeness.
    notes = []
    for s in sorted(margin, key=lambda s: (s['bbox'][1], s['bbox'][0])):
        if notes and s['bbox'][1] - notes[-1]['y1'] < 4 and abs(s['bbox'][0] - notes[-1]['x0']) < 60:
            notes[-1]['spans'].append(s)
            notes[-1]['y1'] = s['bbox'][3]
        else:
            notes.append({'y0': s['bbox'][1], 'y1': s['bbox'][3], 'x0': s['bbox'][0], 'spans': [s]})
    return lines, notes


def text_of(spans):
    """The text of a line. Spans that touch are one word: small capitals are
    set as a large and a small span (`O` + `F` = `OF`, Civil Code headings)."""
    out = ''
    prev = None
    for s in spans:
        t = s['text']
        if prev is None:
            out = t.strip()
        elif s['bbox'][0] - prev['bbox'][2] < 0.8 and not prev['text'].endswith(' ') and not t.startswith(' '):
            out += t.strip()
        else:
            out += ' ' + t.strip()
        prev = s
    return re.sub(r'\s+', ' ', out).strip()


def note_title(note):
    """The roman part of a marginal note, before its italic amendment history."""
    parts = []
    for s in note['spans']:
        if is_italic(s):
            break
        parts.append(s['text'].strip())
    t = re.sub(r'\s+', ' ', ' '.join(parts)).strip()
    t = re.sub(r'(\w)- (\w)', r'\1-\2', t)
    return t.rstrip('.').strip() or None


def convert(pdf_path):
    doc = fitz.open(pdf_path)
    # A repealed chapter is still served, with a footnote on its first page
    # (`*Repealed by Act XVI of 2018.`: Cap. 438, the old lotteries Act;
    # `*This Act have been repealed by Act XXXVI of 2024.`: Cap. 590).
    if re.search(r'\*[^\n]*\brepealed by\b', doc[0].get_text(), re.I):
        raise RuntimeError('repealed (footnote on page 1)')
    out = []          # markdown lines
    preamble = []
    started = False
    in_schedule = False
    skipping = False  # inside the table of contents, before the first heading or article
    last_no = 0
    para = None       # current paragraph text
    para_y = None
    count = 0
    title_lines = []

    div_wait = None   # index of a `Part II` heading waiting for its name

    def flush():
        nonlocal para
        # A page number or a footer left alone is not text, nor is the notice
        # left where a run of articles was repealed (`Articles 1249 to 1258,
        # both inclusive, were repealed by Act XXI of 1993.`).
        if para and not re.fullmatch(r'\s*\d{1,4}\s*', para) and not REPEAL_RUN.match(para):
            (out if started else preamble).append(para.strip())
            (out if started else preamble).append('')
        para = None

    for pno in range(doc.page_count):
        lines, notes = page_lines(doc[pno])
        new_page = True
        for spans in lines:
            text = text_of(spans)
            y0 = spans[0]['bbox'][1]
            first = spans[0]
            head = first['text'].strip()
            rest_spans = spans[1:]
            # The dot may be a span of its own (`15` bold, then `.`: article 15 of Cap. 583).
            if re.match(r'^\d{1,4}[A-Z]{0,3}$', head) and len(spans) > 1 and spans[1]['text'].strip().startswith('.'):
                head += '.'
                tail = spans[1]['text'].strip()[1:].strip()
                rest_spans = ([dict(spans[1], text=tail)] if tail else []) + spans[2:]
            # The Criminal Code types its article 1 with a letter L (`l.`).
            if head == 'l.' and last_no == 0:
                head = '1.'
            m = ARTICLE_NO.match(head) if is_bold(first) else None
            # An article opens: bold number first on the line, numbers moving forward.
            # Repealed runs leave real jumps (Civil Code 1248 → 1316).
            if m and not in_schedule and int(m.group(1)) >= last_no and int(m.group(1)) <= last_no + 300:
                flush()
                started = True
                last_no = int(m.group(1))
                count += 1
                title = None
                for n in notes:
                    if abs(n['y0'] - y0) <= 7:
                        title = note_title(n)
                        if title:
                            break
                out.append(f'#### Article {m.group(1)}{m.group(2)}')
                if title:
                    out.append(f'##### {title}')
                out.append('')
                para = text_of(rest_spans)
                para_y = y0
                new_page = False
                continue
            # A heading starts a paragraph of its own: a wrapped line `Part II of the
            # Act…` is text.
            para_start = para is None or new_page or (para_y is not None and y0 - para_y > PARA_GAP)
            sched = SCHEDULE.match(text)
            div = DIVISION.match(text)
            if started and para_start and len(text) < 120 and re.match(r'^§\s*[IVXLC]+\b', text):
                # `§ I. OF SETTLEMENT OF DOWRY`: a division of the Civil Code.
                flush()
                out.append(f'### {text}')
                out.append('')
                para_y = y0
                new_page = False
                continue
            if not div and para_start and len(text) < 100:
                # Regulations write `Part II Gaming Tax` in mixed case.
                mixed = MIXED_DIVISION.match(text)
                if mixed and not re.search(r'\b(of|to|under|in)\s+(the|this|these)\b', text):
                    div = mixed
            if (started or skipping) and (sched or (div and len(text) < 160 and not text.endswith((';', ',')))):
                if skipping and sched:
                    continue  # a schedule named in the table of contents
                flush()
                if sched:
                    in_schedule = True
                skipping = False
                level = '##' if div and div.group(1).upper() in ('BOOK', 'PART') else '###'
                out.append(f'{level} {text}')
                out.append('')
                # `Part II` alone: its name is the next line.
                div_wait = len(out) - 2 if re.match(r'^\S+\s+[IVXLC]+\.?$', text) else None
                para_y = y0
                new_page = False
                continue
            if div_wait is not None:
                if len(text) < 120 and not re.search(r'[.;:,]$', text) and not re.match(r'^\(', text):
                    out[div_wait] += f' - {text}'
                    div_wait = None
                    para_y = y0
                    new_page = False
                    continue
                div_wait = None
            if not started and re.match(r'^ARRANGEMENT\b', text):
                # The table of contents before article 1 is not law text.
                flush()
                skipping = True
                continue
            if skipping:
                continue
            gap = (y0 - para_y) if para_y is not None and not new_page else None
            if para is None:
                para = text
            elif new_page:
                # A paragraph runs over the page when the next line starts lower case
                # or the previous one did not end a sentence.
                if re.match(r'^[a-z(]', text) and not re.match(r'^\([a-z0-9]+\)\s', text) or not re.search(r'[.;:]$', para):
                    para = join(para, text)
                else:
                    flush()
                    para = text
            elif gap is not None and gap > PARA_GAP:
                flush()
                para = text
            elif LIST_ITEM.match(text) and re.search(r'([;:]|\band\b|\bor\b)$', para):
                # `(a) …; and` then `(b) …` set tight: one item per paragraph.
                flush()
                para = text
            else:
                para = join(para, text)
            para_y = y0
            new_page = False
    flush()
    return preamble, out, count


def join(a, b):
    if a.endswith('-') and re.match(r'^[a-z]', b):
        return a + b
    return a + ' ' + b


def clean_preamble(lines):
    """Title block and long title; the table of contents is cut at ARRANGEMENT."""
    keep = []
    for l in lines:
        # The Criminal Code opens on its table of contents with no ARRANGEMENT
        # word: it starts at its first division (`PENAL LAWS`, `PART I`).
        if re.match(r'^(ARRANGEMENT|PART [IVXLC]+|BOOK|Title [IVXLC]+|PENAL LAWS)\b', l):
            break
        keep.append(l)
    return keep


def amended_by(preamble):
    txt = ' '.join(preamble)
    m = re.search(r'((?:ACT|LEGAL NOTICE|Act|Legal Notice)[^.]*?,?\s*as amended by .*?\.)(?:\s|$)', txt)
    return m.group(1) if m else None


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cache = sys.argv[1]
    only = set(sys.argv[2:])
    os.makedirs(cache, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    today = datetime.date.today().isoformat()
    index_path = os.path.join(OUT, 'index.json')
    entries = {}
    if os.path.exists(index_path):
        with open(index_path, encoding='utf-8') as f:
            for e in json.load(f)['entries']:
                entries[e['identifier']] = e
    failed = []
    for ident, eli, label, ref, group, expect in LAWS:
        if only and ident not in only:
            continue
        try:
            pdf = fetch(eli, cache)
            preamble, body, count = convert(pdf)
        except Exception as err:  # one bad file is reported, never the end of the run
            print(f'FAIL {ident}: {err}')
            failed.append(ident)
            continue
        if count == 0:
            print(f'FAIL {ident}: no article read')
            failed.append(ident)
            continue
        if expect is not None and count != expect:
            print(f'WARN {ident}: {count} articles, {expect} expected')
        body, repealed = drop_repealed(body)
        count -= repealed
        pre = clean_preamble(preamble)
        amend = amended_by(pre)
        fm = [
            '---',
            f'title: {yaml_str(f"{label} ({ref})")}',
            f'identifier: {yaml_str("mt-" + ident)}',
            'country: "mt"',
            f'rank: {yaml_str("act" if eli.startswith("cap/") else "subsidiary_legislation" if eli.startswith("sl/") else "constitution")}',
            'status: "in_force"',
            'text_state: "current"',
            f'source: {yaml_str(f"{SITE}/{eli}/eng")}',
            f'last_updated: {yaml_str(today)}',
        ]
        if amend:
            fm.append(f'amended_by: {yaml_str(amend)}')
        fm.append('---')
        md = '\n'.join(fm + [f'# {label} ({ref})', ''] + pre + body).rstrip() + '\n'
        md = re.sub(r'\n{3,}', '\n\n', md)
        rel = f'countries/mt/{ident}.md'
        with open(os.path.join(OUT, f'{ident}.md'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(md)
        entries['mt-' + ident] = {
            'path': rel, 'identifier': 'mt-' + ident, 'label': label, 'reference': ref,
            'lastUpdated': today, 'group': group,
        }
        print(f'ok   {ident}: {count} articles, {len(md)} chars')
    order = {ident: i for i, (ident, *_rest) in enumerate(LAWS)}
    listed = sorted(entries.values(), key=lambda e: order.get(e['identifier'][3:], 999))
    with open(index_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps({'country': 'mt', 'builtOn': today, 'entries': listed}, ensure_ascii=False, indent=2) + '\n')
    if failed:
        print('failed:', ', '.join(failed))


if __name__ == '__main__':
    main()

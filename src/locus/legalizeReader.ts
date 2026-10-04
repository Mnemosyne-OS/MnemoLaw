/**
 * legalizeReader — national laws from Legalize (doc 134 §16), one reader for
 * every country of `github.com/legalize-dev/legalize-<cc>`.
 *
 * A Legalize file is one law: a YAML front matter (spec v0.4 guarantees
 * `title`, `identifier`, `country`, `rank`, `status`, `source`), then the body
 * in Markdown headings. The spec does NOT fix the article heading, measured
 * 2026-10-03:
 *  - Colombia  `##### **Artículo 1º.***Dignidad humana*. El derecho…` (text ON the heading line)
 *  - Spain     `###### Artículo 1.` (text on the following lines)
 *  - Argentina `##### ARTICULO 10.- Abuso del derecho. El ejercicio…`
 * and Argentina's preamble holds false friends (`##### artículo 11— y III
 * —con excepción…`, a sentence cut at a line break). An article heading is
 * therefore `artículo|art.` + a number + `.`, `-` or `:` right after it; the
 * em dash and the bare number count only on a line that opens with a
 * capital, which the false friend does not.
 *
 * Argentina also opens most articles on a plain line, bold or bare
 * (`**ARTICULO 1° —** Apruébase`), and wraps its text at ~70 characters
 * with a blank line between the pieces: see `splitArticles` and `reflow`.
 *
 * 🪤 The front matter carries huge fields (`modification_summary`, hundreds of
 * KB of links in Colombia): only the fields below are kept, never pasted into
 * an article. 🪤 `uniform_title` is mis-encoded at the source (`CÃ³digo
 * Penal`): `code_name` / `title` are shown instead.
 *
 * The file is fetched from `raw.githubusercontent.com` (CORS open), never
 * through `api.github.com` (60 requests an hour without a token).
 */
import type { LocusArticle, LocusPlace } from './locusReader';

export const LEGALIZE_RAW = 'https://raw.githubusercontent.com/legalize-dev';

/** The front matter fields MnemoLaw reads. Everything else is dropped. */
export interface LegalizeMeta {
  title: string | null;
  identifier: string | null;
  rank: string | null;
  status: string | null;
  source: string | null;
  lastUpdated: string | null;
  /** `current` / `as_enacted` / absent (= the law at `lastUpdated`), spec §Text state. */
  textState: string | null;
  /** Colombia: the code's common name (`CODIGO PENAL`). */
  codeName: string | null;
}

const KEPT: Record<string, keyof LegalizeMeta> = {
  title: 'title',
  identifier: 'identifier',
  rank: 'rank',
  status: 'status',
  source: 'source',
  last_updated: 'lastUpdated',
  text_state: 'textState',
  code_name: 'codeName',
};

/** Countries whose `last_updated` does not date the text (measured 2026-10-03). */
const UNDATED_COUNTRIES = new Set(['ar']);

/** One YAML scalar as the pipeline writes it: `"…"` with JSON escapes, or bare. */
function scalar(raw: string): string | null {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(v);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      // Not a JSON string (an unescaped quote inside): the text between the quotes.
      return v.replace(/^"|"$/g, '');
    }
  }
  return v === '' ? null : v;
}

/** Splits a Legalize file into its kept front matter fields and its body. */
export function parseLegalizeFile(text: string): { meta: LegalizeMeta; body: string } {
  const meta: LegalizeMeta = {
    title: null, identifier: null, rank: null, status: null, source: null,
    lastUpdated: null, textState: null, codeName: null,
  };
  // 🪤 A clone made on Windows has CRLF line ends: `(.*)$` then never matches
  // a field line (`.` stops at a carriage return) and every law reads as status unknown.
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!src.startsWith('---')) return { meta, body: src };
  const end = src.indexOf('\n---', 3);
  if (end < 0) return { meta, body: src };
  let country: string | null = null;
  for (const line of src.slice(3, end).split('\n')) {
    const m = line.match(/^([a-z_]+):\s?(.*)$/);
    if (!m) continue;
    if (m[1] === 'country') country = scalar(m[2]!);
    const field = KEPT[m[1]!];
    if (field) meta[field] = scalar(m[2]!);
  }
  // A date the source does not know is no date: `1900-01-01` stands for
  // "unknown" in Argentina, and there `last_updated` is not the latest reform
  // anyway (the Código Penal says 1921 and holds the 2012 femicide article).
  // Shown as "reforms up to", either would be a fabricated date.
  if (meta.lastUpdated?.startsWith('1900-') || (country && UNDATED_COUNTRIES.has(country))) meta.lastUpdated = null;
  // The UK marks every Act `in_force` and says a repeal in the title only
  // (`Fireworks Act 1964 (repealed)`, 267 of 3 254 Acts on 2026-10-03).
  if (meta.status === 'in_force' && /\(repealed\)\s*$/i.test(meta.title ?? '')) meta.status = 'repealed';
  const after = src.indexOf('\n', end + 1);
  return { meta, body: after < 0 ? '' : src.slice(after + 1) };
}

/** Accents off, lower case: `ARTÍCULO` and `Artículo` read the same. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Markdown emphasis off: `**Artículo 1º.***Dignidad*` → `Artículo 1º.Dignidad`. */
function plain(s: string): string {
  return s.replace(/\*+/g, '').trim();
}

/**
 * `Artículo 1º` / `ARTICULO 10` / `Art. 3 bis` when a heading opens an
 * article, with the rest of the line; null for any other heading.
 */
export function articleHeading(heading: string): { label: string; rest: string; term: string } | null {
  const text = plain(heading);
  const folded = fold(text);
  // Spain ends the heading with the number (`###### Artículo 1`), Argentina
  // with an em dash (`**ARTICULO 1° —** Apruébase`). Both are refused unless
  // the line opens with a capital: the false friend of the Argentine preamble
  // (`artículo 11— y III`) is a sentence cut by a line break, lower case.
  const capital = /^[AÁ]/.test(text);
  // Same length after folding (NFD then the marks dropped), so an index in
  // `folded` is an index in `text` for the Latin letters used here.
  //
  // The number may carry a suffix, spelled six ways in the Código Penal
  // alone: `38 A`, `38G`, `38-H`, `38- L`, `269-1`, `319 2` (and `178-A:` in
  // the constitution). Without it, `38-H` to `38-Ñ` all read as article 38.
  // `o` is never a suffix letter: `1o.` is the ordinal, like `1º.`.
  // The ordinal may sit before `bis` (`8º bis:`) or after a dot (`Art. 2.° -`).
  // Portugal writes `Artigo 5.º-A`: the letter comes after the ordinal.
  const m = folded.match(/^(articulo|article|artigo|art\.)\s*(\d+)((?:\s*-\s*\d+|\s+\d+(?=\s*[.:-])|\s*-?\s*[a-np-z](?![a-z]))?)\s*(?:\.?\s*[º°](?:-([a-z])(?![a-z]))?(?=\s*(?:bis|ter|quater|quinquies|[.:\-—–]|$))|o(?=\s*[.:\-—–]))?((?:\s+(?:bis|ter|quater|quinquies))?)\s*[º°o]?\s*(\.-|\.|-|:|—|–|$)/);
  if (!m) return null;
  const term = m[6]!;
  if ((term === '' || term === '—' || term === '–') && !capital) return null;
  // The suffix as the source spells it (`Ñ`, which folding turns into `n`).
  const at = m[1]!.length + m[0].slice(m[1]!.length).indexOf(m[2]!) + m[2]!.length;
  const raw = (text.slice(at, at + m[3]!.length) + (m[4] ?? '')).replace(/[\s-]+/g, '').toUpperCase();
  const suffix = raw ? `-${raw}` : '';
  // One spelling for every source: `ARTICULO 10` and `Artículo 10` are the same article.
  // `Artigo` and the EU's `Article` are labelled `Art.`: the chat recognises a law by `Artículo`,
  // `Art.` or `Preámbulo` (host `lawPlace.ts`), and `Art.` reads right in Portuguese.
  const label = `${m[1] === 'articulo' ? 'Artículo' : 'Art.'} ${m[2]}${suffix}${m[5]!.replace(/\s+/g, ' ')}`;
  const rest = text.slice(m[0].length).replace(/^[\s.\-:]+/, '');
  return { label, rest, term };
}

/** Where the English `Article N` opens an article: EU regulations and the treaties. */
const ENGLISH_ARTICLE = new Set(['eu', 'int']);

/** The heading of a division of a law, in the languages read so far. */
const DIVISION = /^(libro|titulo|capitulo|seccion|parte|primera|segunda|tercera|anexo|disposicion|book|part|title|chapter|section|schedule)\b/;

/**
 * Joins the fragments of a hard-wrapped paragraph. Argentina's texts are cut
 * at ~70 characters with a blank line after each piece (`Ordénase la
 * publicación del texto\n\noficial de la Constitución`), so a citation read
 * as broken prose. Joined only when the piece ends inside a sentence (a
 * letter, a digit or a comma) and the next one starts lower case, and never
 * before a list item (`a) …`, `b. …`).
 */
export function reflow(text: string): string {
  return text.replace(/([\p{L}\d,])[ \t]*\n\n[ \t]*(?=\p{Ll})(?![\p{Ll}][).])/gu, '$1 ');
}

/**
 * The articles of a body, in order. The text before the first article (title,
 * preamble) becomes an article of its own when it holds real text, so a
 * constitution keeps its preamble. `topic` is the chain of section headings
 * (Libro › Título › Capítulo) above the article.
 */
export function splitArticles(body: string, opts: { country?: string | null } = {}): LocusArticle[] {
  const articles: LocusArticle[] = [];
  const sections: string[] = [];
  // The UK: once a `SCHEDULE N` heading opens, numbered headings are its paragraphs.
  let schedule: string | null = null;
  // `loose`: text under a section heading, not an article (see below).
  type Unit = { header: string; lines: string[]; topic: string | null; loose?: boolean };
  // Set inside `open`: typed by assertion so the compiler does not narrow it to null.
  let current = null as Unit | null;
  const preamble: string[] = [];

  const written = new Set<string>();
  const flush = () => {
    if (!current) return;
    const content = reflow(current.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim());
    // Some files hold their text twice (Colombia's military penal code: 444
    // articles repeated word for word): a repeat would enter memory twice.
    const key = `${current.header}\u0000${content}`;
    // A loose unit made of reform notices (`> Se modifica el título…`) or of a
    // section's subtitle (`De las normas administrativas`) is not law text.
    const loose = current.loose && content.replace(/^>.*$/gm, '').trim().length < 200;
    // The UK keeps a repealed section's number and replaces its text with
    // dots (`. . . . . . .`): a whole repealed Act is a list of them.
    const repealed = /^[\s.…]+$/.test(content);
    if (content && !loose && !repealed && !written.has(key)) {
      written.add(key);
      articles.push({ header: current.header, content, isSubstantive: true, topic: current.topic, function: null });
    }
  };

  let opened = false;
  const open = (header: string, rest: string) => {
    flush();
    opened = true;
    const topic = sections.filter(Boolean).join(' › ') || null;
    current = { header, lines: rest ? [rest] : [], topic };
  };

  // The English `Article` opens an article in EU regulations only. A UK Act
  // that reproduces a convention in a schedule (`### ARTICLE 22`, then its
  // numbered paragraphs) keeps it as a section heading, as before.
  const heading = (text: string) => {
    const art = articleHeading(text);
    if (art && !ENGLISH_ARTICLE.has(opts.country ?? '') && /^article\b/.test(fold(plain(text)))) return null;
    return art;
  };
  const lines = body.split('\n');
  /** The next non-empty line after `i` starts lower case: the line at `i` is a piece of a wrapped sentence. */
  const continues = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) if (lines[j]!.trim()) return /^\s*\p{Ll}/u.test(lines[j]!);
    return false;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const art = heading(h[2]!);
      if (art) { open(art.label, art.rest); continue; }
      // Spain: `Disposición adicional primera.` and `Artículo único.` sit at
      // article depth. Read as sections, their text fell into the preamble.
      const other = plain(h[2]!);
      // The EU titles an article with the heading right under its number
      // (`#### Article 1` then `##### Subject-matter and objectives`): a heading
      // that comes before any text of the article is its title, not a section.
      if (ENGLISH_ARTICLE.has(opts.country ?? '') && current && !current.loose && current.lines.every((l) => !l.trim()) && !DIVISION.test(fold(other))) {
        current.lines.push(`(${other})`, '');
        continue;
      }
      // The UK: a section heading is its number alone (`##### 1`, `##### 4A`);
      // its title is the crossheading above it, kept in the topic.
      if (/^\d{1,4}[A-Z]{0,3}$/.test(other)) {
        open(schedule ? `Schedule ${schedule}, paragraph ${other}` : `Section ${other}`, '');
        continue;
      }
      const sched = other.match(/^schedule\s+(\d{1,3}[A-Z]{0,2})\b/i);
      if (sched) schedule = sched[1]!.toUpperCase();
      else if (/^schedule\s*$/i.test(other)) schedule = '';
      if (/^(disposicion (adicional|transitoria|final|derogatoria)|articulo unico)\b/.test(fold(other))) {
        open(other.replace(/[\s.]+$/, ''), '');
        continue;
      }
      // A section heading: it replaces its level and closes the deeper ones.
      const level = h[1]!.length;
      const title = plain(h[2]!);
      if (level === 1) continue; // the law's own title
      // Argentina's source turns pieces of wrapped sentences into headings
      // (`##### Sección se aplican durante el tiempo…`). There, a heading that
      // names no division is text of the article it interrupts.
      if (opts.country === 'ar' && current && !current.loose && (!DIVISION.test(fold(title)) || continues(i))) {
        current.lines.push('', title);
        continue;
      }
      sections.length = Math.min(sections.length, level - 1);
      flush();
      // After the first article, text under a section heading is a unit of
      // its own named by that heading (Spain's `ANEXO I`, 56 KB of fines in
      // the traffic law). An empty one is dropped by `flush`.
      current = opened ? { header: title, lines: [], topic: sections.filter(Boolean).join(' › ') || null, loose: true } : null;
      sections[level - 1] = title;
      continue;
    }
    // Argentina opens an article on a plain line: `**ARTICULO 1° —** Apruébase`
    // or bare `ARTICULO 5º.- Las`. A bare line needs a terminator no wrapped
    // sentence ends with, measured 2026-10-03 on the 31 327 files: a line cut
    // at 70 characters can start `ARTICULO 11 DE LA LEY` or end `Artículo 14.`.
    const bold = /^\s*\*\*/.test(line);
    if (bold || /^[AÁ]/.test(line)) {
      const art = heading(line);
      if (art && (bold || ['.-', '-', ':', '—', '–'].includes(art.term))) { open(art.label, art.rest); continue; }
    }
    // The UK closes each Act with its amendment notes (`[^c688792]: Act
    // amended by…`, 90 of them in the Theft Act) and marks the text with
    // their calls (`[^c688792]`): both go, they are not the law's text.
    if (/^\[\^[^\]]+\]:/.test(line)) continue;
    const text = line.replace(/\[\^[^\]]+\]/g, '').replace(/\*+/g, '');
    if (current) current.lines.push(text);
    else preamble.push(text);
  }
  flush();

  // Notice lines go, and so do the lines of a table of contents made of page
  // anchors (`[Título I](#2)`): 33 KB of them open Argentina's civil code.
  const pre = reflow(preamble.join('\n').replace(/^>.*$/gm, '').replace(/^\s*\[[^\]]*\]\(#[^)]*\)\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim());
  // The EU stores some older regulations as ONE line with no heading at all
  // (Regulation 261/2004 on air passengers): read its articles from the text.
  if (opts.country === 'eu' && articles.length === 0) {
    const inline = inlineArticles(pre);
    if (inline.length > 0) return inline;
  }
  if (pre.length >= 200) {
    articles.unshift({ header: 'Preámbulo', content: pre, isSubstantive: true, topic: null, function: null });
  }
  return articles;
}

/**
 * The articles of a regulation flattened to one line: `…Article 1Subject1.
 * This Regulation…Article 2DefinitionsFor the purposes…`. An article's
 * heading is glued to its title (no space before the capital), where a
 * mention in the text is followed by a space or a bracket (`Article 3(1)`);
 * and headings run 1, 2, 3 in order. Anything else is text.
 */
export function inlineArticles(text: string): LocusArticle[] {
  const starts: { at: number; end: number; n: number; label: string }[] = [];
  for (const m of text.matchAll(/Article\s?(\d+)([a-z]?)(?=[A-Z])/g)) {
    const n = Number(m[1]);
    const prev = starts[starts.length - 1];
    if (prev ? n === prev.n + 1 || (n === prev.n && m[2]) : n === 1) {
      starts.push({ at: m.index!, end: m.index! + m[0].length, n, label: `Art. ${m[1]}${m[2] ?? ''}` });
    }
  }
  if (starts.length < 2) return [];
  const out: LocusArticle[] = [];
  const pre = text.slice(0, starts[0]!.at).trim();
  if (pre.length >= 200) out.push({ header: 'Preámbulo', content: pre, isSubstantive: true, topic: null, function: null });
  starts.forEach((s, i) => {
    const content = text.slice(s.end, starts[i + 1]?.at ?? text.length).trim();
    if (content) out.push({ header: s.label, content, isSubstantive: true, topic: null, function: null });
  });
  return out;
}

/** Raw URL of one file of a country repository. */
export function legalizeFileUrl(country: string, path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  // The international treaties ship with the cartridge (`public/data/`, doc
  // 134 §16.15): read from its own address, relative to the page.
  if (country === 'int') return `data/${encoded}`;
  return `${LEGALIZE_RAW}/legalize-${country}/main/${encoded}`;
}

export type FetchText = (url: string, signal?: AbortSignal) => Promise<string>;

/**
 * Reads one law. Refuses a law no longer in force (the catalogue is a menu,
 * the live front matter decides) and a law published as enacted (its
 * amendments are not in the text: citing it as the law today would be false).
 */
export async function readLegalizeLaw(
  fetchText: FetchText,
  unit: Pick<LocusPlace, 'state' | 'folder'>,
  opts: { signal?: AbortSignal } = {},
): Promise<{ articles: LocusArticle[]; meta: LegalizeMeta; bytes: number }> {
  if (!unit.folder) throw new Error('LEGALIZE_NO_PATH');
  const text = await fetchText(legalizeFileUrl(unit.state, unit.folder), opts.signal);
  const { meta, body } = parseLegalizeFile(text);
  if (meta.status && meta.status !== 'in_force' && meta.status !== 'partially_repealed') {
    throw new Error(`LEGALIZE_NOT_IN_FORCE (${meta.status})`);
  }
  if (meta.textState === 'as_enacted') throw new Error('LEGALIZE_AS_ENACTED');
  const articles = splitArticles(body, { country: unit.state });
  if (articles.length === 0) throw new Error('LEGALIZE_EMPTY_TEXT');
  return { articles, meta, bytes: new TextEncoder().encode(text).byteLength };
}

/**
 * The official reference of a law, as each country cites it; null when
 * neither the identifier nor the title gives one:
 *  - Colombia  `LEY-599-2000` → `Ley 599 de 2000`
 *  - the UK    `ukpga-1968-60` → `1968 c. 60` (the chapter number)
 *  - Argentina `LEY-26994` → `Ley 26.994`, `DEC-118-2019` → `Decreto 118/2019`
 *  - Portugal  the title's part before ` — ` (`Lei n.º 7/2009`)
 *  - the EU    `32016R0679` → `Regulation (EU) 2016/679`, from the title
 *  - Spain     the identifier is a BOE number (`BOE-A-1995-25444`), so the
 *    title gives it: `Ley Orgánica 10/1995, de 23 de noviembre, del Código
 *    Penal` → `Ley Orgánica 10/1995`.
 * Never with parentheses: the chronicle title already puts it in some.
 */
export function referenceOf(id: string, title?: string | null): string | null {
  const uk = id.match(/^ukpga-(\d{4})-(\d+)$/);
  if (uk) return `${uk[1]} c. ${uk[2]}`;
  const co = id.match(/^(LEY|DECRETO)-(\d+)-(\d{4})$/);
  if (co) return `${co[1] === 'LEY' ? 'Ley' : 'Decreto'} ${co[2]} de ${co[3]}`;
  const thousands = (n: string) => n.replace(/\B(?=(\d{3})+$)/g, '.');
  const arLaw = id.match(/^LEY-(\d+)$/);
  if (arLaw) return `Ley ${thousands(arLaw[1]!)}`;
  const arDecree = id.match(/^(DEC|DNU|DL)-(\d+)-(\d{4})$/);
  if (arDecree) return `${{ DEC: 'Decreto', DNU: 'DNU', DL: 'Decreto-Ley' }[arDecree[1]!]} ${arDecree[2]}/${arDecree[3]}`;
  // The EU: the identifier is a CELEX number (`32016R0679`); the title opens
  // with the reference (`Regulation (EU) 2016/679 of the European Parliament…`).
  if (/^3\d{4}R\d{4}$/.test(id) && title) {
    const ref = title.match(/^(.*?)\s+of\s+(?:the\b|\d)/)?.[1]?.trim();
    return ref && ref.length <= 80 ? ref : null;
  }
  // Portugal: the title opens with the reference (`Lei n.º 7/2009 — Código do Trabalho`).
  if (id.startsWith('DRE-') && title) {
    const ref = title.split(' — ')[0]!.trim();
    return /^(Lei|Decreto|Portaria|Resolução)/.test(ref) && /n\.º/.test(ref) ? ref : null;
  }
  if (id.startsWith('BOE-') && title) {
    const m = title.match(/^((?:Real Decreto(?: Legislativo|-ley)?|Ley(?: Orgánica)?|Decreto(?: Legislativo)?|Orden)\s+(?:\d+\/\d{4}|de \d{1,2} de \p{L}+ de \d{4}))/u);
    return m ? m[1]! : null;
  }
  return null;
}

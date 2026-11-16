/**
 * fedlexReader — Switzerland's federal laws from Fedlex, the Confederation's
 * own publication platform (doc 134 §16.17), in French, German and Italian.
 *
 * Measured 2026-11-10: Legalize's `legalize-ch` cuts its codes short (Civil
 * Code stops at art. 27, Criminal Code at art. 64) and dates from 2019-2020,
 * so it is not read. Fedlex answers a SPARQL query and serves each
 * consolidated version as Akoma Ntoso XML, both with CORS `*`.
 *
 * Two traps the reader holds:
 * - Fedlex lists versions that apply in the FUTURE (the Civil Code has one
 *   for 2027-01-01): the version read is the latest that applies today.
 * - Footnotes (`<authorialNote>`) sit inside the article number and the
 *   headings: they carry amendment history, never the law, and are dropped.
 *   A repealed article keeps only its number and such a note: it is skipped.
 */
import type { LocusArticle } from './locusReader';

export const FEDLEX_SPARQL = 'https://fedlex.data.admin.ch/sparqlendpoint';
export const FEDLEX_ELI = 'https://fedlex.data.admin.ch/eli/';

export type SwissLang = 'fr' | 'de' | 'it';

const LANG_URI: Record<SwissLang, string> = {
  fr: 'http://publications.europa.eu/resource/authority/language/FRA',
  de: 'http://publications.europa.eu/resource/authority/language/DEU',
  it: 'http://publications.europa.eu/resource/authority/language/ITA',
};

/** Fedlex says a law is in force with this status. */
const IN_FORCE = 'https://fedlex.data.admin.ch/vocabulary/enforcement-status/0';

/** The SPARQL query for the latest version of one law that applies on `today`, as XML. */
export function versionQuery(eli: string, lang: SwissLang, today: string): string {
  if (!/^cc\/[\w/]+$/.test(eli)) throw new Error('FEDLEX_BAD_ELI');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('FEDLEX_BAD_DATE');
  return `PREFIX jolux: <http://data.legilux.public.lu/resource/ontology/jolux#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?status ?date ?file WHERE {
  <${FEDLEX_ELI}${eli}> jolux:inForceStatus ?status .
  ?cons jolux:isMemberOf <${FEDLEX_ELI}${eli}> ; jolux:dateApplicability ?date ; jolux:isRealizedBy ?expr .
  ?expr jolux:language <${LANG_URI[lang]}> ; jolux:isEmbodiedBy ?m .
  ?m jolux:isExemplifiedBy ?file .
  FILTER(?date <= "${today}"^^xsd:date)
  FILTER(CONTAINS(STR(?file), "/xml/"))
} ORDER BY DESC(?date) LIMIT 1`;
}

/** The GET URL of a query: a simple request, which Fedlex's CORS `*` lets through. */
export function sparqlUrl(query: string): string {
  return `${FEDLEX_SPARQL}?query=${encodeURIComponent(query)}&format=${encodeURIComponent('application/sparql-results+json')}`;
}

export interface FedlexVersion { date: string; file: string }

/** Reads the SPARQL answer: a law no longer in force, or with no version today, is refused. */
export function parseVersion(json: unknown): FedlexVersion {
  const rows = (json as { results?: { bindings?: Record<string, { value?: string }>[] } } | null)?.results?.bindings;
  const row = rows?.[0];
  if (!row) throw new Error('FEDLEX_NO_VERSION');
  if (row.status?.value !== IN_FORCE) throw new Error('FEDLEX_NOT_IN_FORCE');
  const date = row.date?.value;
  const file = row.file?.value;
  // The file must be Fedlex's own: a URL from the answer is fetched next.
  if (!date || !file || !file.startsWith('https://fedlex.data.admin.ch/filestore/')) throw new Error('FEDLEX_NO_VERSION');
  return { date, file };
}

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Inline marks: their text joins the text around them with no space. The
 * Civil Code writes art. 43a as `<b>Art. 4</b><b>3</b><i>a</i>`.
 */
const INLINE = new Set(['b', 'i', 'u', 'sup', 'sub', 'span', 'ref', 'inline', 'abbr', 'term', 'def', 'num']);

/** Text of an element without its footnotes; a block element is set apart by a space. */
function text(el: Element): string {
  let out = '';
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3) out += n.nodeValue ?? '';
    else if (n.nodeType === 1) {
      const name = (n as Element).localName;
      if (name === 'authorialNote') continue;
      if (name === 'br') out += ' ';
      else out += INLINE.has(name) ? text(n as Element) : ` ${text(n as Element)} `;
    }
  }
  return out;
}

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}

/**
 * `Art. 62 a` → `Art. 62a`, the way the law is cited. The source also writes
 * `Art . 264 a` and `Art 89 d` (measured in the Criminal Code and the Road
 * Traffic Act): the word is set back to `Art.`.
 */
export function articleNumber(raw: string): string {
  return squash(raw)
    .replace(/^Art\s*\.?\s*(?=\d)/, 'Art. ')
    .replace(/^((?:Art\.|§)\s*\d+)\s+([a-z]{1,9})\b/, '$1$2');
}

/**
 * The lines of an article's body: its paragraphs, its loose content, and the
 * `<subdivision>` blocks the Constitution's transitional provisions use
 * (art. 196 and 197), each opened by its heading.
 */
function bodyLines(el: Element): string[] {
  const lines: string[] = [];
  for (const c of Array.from(el.children)) {
    if (c.localName === 'paragraph') {
      const n = child(c, 'num');
      const content = child(c, 'content');
      const inner = content ? contentLines(content) : [];
      if (inner.length === 0) continue;
      const label = n ? squash(text(n)) : '';
      lines.push(label ? `${label} ${inner[0]}` : inner[0]!, ...inner.slice(1));
    } else if (c.localName === 'content') {
      lines.push(...contentLines(c));
    } else if (c.localName === 'subdivision') {
      const inner = bodyLines(c);
      if (inner.length === 0) continue;
      const h = child(c, 'heading');
      const heading = h ? squash(text(h)) : '';
      lines.push(...(heading ? [`(${heading})`] : []), ...inner);
    }
  }
  return lines;
}

/**
 * The name of the block a final or transitional provision belongs to
 * (`disp_u1` in the Civil Code is its « Titre final », `disp_u2` the former
 * wording of the matrimonial articles): its numbers start again at 1, so an
 * article of it must say where it sits, or the chat would cite it as the code's.
 */
function provisionUnit(art: Element, body: Element): string | null {
  const eid = art.getAttribute('eId') ?? '';
  const unit = eid.split('/')[0]!;
  if (!unit.startsWith('disp_')) return null;
  let p: Element | null = art.parentElement;
  while (p && p !== body && p.getAttribute('eId') !== unit) p = p.parentElement;
  if (p && p !== body) {
    const n = child(p, 'num');
    const h = child(p, 'heading');
    const label = squash((n ? text(n) : '') || (h ? text(h) : '')).replace(/\s*[:.]\s*$/, '');
    // « Titre final: De l'entrée en vigueur… » is cited « Titre final ».
    const short = label.split(':')[0]!.trim();
    return short ? short.slice(0, 80) : null;
  }
  return null;
}

/** The lines of a paragraph's content: its text, or a list's introduction then one line per item. */
function contentLines(content: Element): string[] {
  const lines: string[] = [];
  for (const c of Array.from(content.children)) {
    if (c.localName === 'blockList') {
      for (const b of Array.from(c.children)) {
        if (b.localName === 'listIntroduction') lines.push(squash(text(b)));
        else if (b.localName === 'item') {
          const num = child(b, 'num');
          const rest = Array.from(b.children).filter((x) => x !== num).map((x) => squash(text(x))).join(' ');
          lines.push(squash(`${num ? squash(text(num)) : ''} ${rest}`));
        }
      }
    } else {
      lines.push(squash(text(c)));
    }
  }
  return lines.filter(Boolean);
}

/** What a repealed article says instead of a text. */
const REPEALED = /^(?:\d+\s*)?(?:…|\.\.\.|abrog[ée]e?s?|aufgehoben|abrogat[oaie])\.?$/i;

export interface SwissLaw {
  title: string | null;
  articles: LocusArticle[];
  /** Articles left out because they hold no text, only their repeal. */
  repealed: number;
}

/**
 * The articles of one law. An article's title is its own `<heading>` (the
 * Constitution) or the marginal note around it (the Civil Code); `topic` is
 * the chain of book, title and chapter headings above it.
 */
export function parseFedlexXml(
  xml: string,
  parse: (s: string) => Document = (s) => new DOMParser().parseFromString(s, 'application/xml'),
): SwissLaw {
  const doc = parse(xml);
  if (doc.getElementsByTagName('parsererror').length) throw new Error('FEDLEX_BAD_XML');
  const body = doc.getElementsByTagName('body')[0];
  if (!body) throw new Error('FEDLEX_EMPTY_TEXT');
  const docTitle = doc.getElementsByTagName('docTitle')[0];
  const title = docTitle ? squash(text(docTitle)) || null : null;
  const articles: LocusArticle[] = [];
  let repealed = 0;
  for (const art of Array.from(body.getElementsByTagName('article'))) {
    const numEl = child(art, 'num');
    const number = articleNumber(numEl ? text(numEl) : '');
    if (!number) continue;
    let note = squash(child(art, 'heading') ? text(child(art, 'heading')!) : '');
    const topics: string[] = [];
    for (let p = art.parentElement; p && p !== body; p = p.parentElement) {
      const h = child(p, 'heading');
      const n = child(p, 'num');
      // "Titre préliminaire" is a number with no heading: still a topic.
      if (!h && !n) continue;
      const label = squash(`${n ? text(n) : ''} ${h ? text(h) : ''}`);
      if (p.getAttribute('fedlex:role') === 'marginal') {
        if (!note && h) note = squash(text(h));
      } else if (label) {
        topics.unshift(label);
      }
    }
    const lines = bodyLines(art);
    if (lines.length === 0 || lines.every((l) => REPEALED.test(l))) {
      repealed++;
      continue;
    }
    const unit = provisionUnit(art, body);
    const content = [note ? `(${note})` : '', ...lines].filter(Boolean).join('\n\n');
    articles.push({ header: unit ? `${number} (${unit})` : number, content, isSubstantive: true, topic: topics.join(' › ') || null, function: null });
  }
  return { title, articles, repealed };
}

export type FetchJson = (url: string, signal?: AbortSignal) => Promise<unknown>;
export type FetchText = (url: string, signal?: AbortSignal) => Promise<string>;

/** Today in the person's own time zone, ISO: the day a version must apply on. */
export function localToday(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Reads one law in one language: the version that applies today, its articles in force. */
export async function readSwissLaw(
  fetchJson: FetchJson,
  fetchText: FetchText,
  eli: string,
  lang: SwissLang,
  opts: { signal?: AbortSignal; today?: string; parse?: (s: string) => Document } = {},
): Promise<SwissLaw & { bytes: number; version: string }> {
  const version = parseVersion(await fetchJson(sparqlUrl(versionQuery(eli, lang, opts.today ?? localToday())), opts.signal));
  const xml = await fetchText(version.file, opts.signal);
  const law = parseFedlexXml(xml, opts.parse);
  if (law.articles.length === 0) throw new Error('FEDLEX_EMPTY_TEXT');
  return { ...law, bytes: new TextEncoder().encode(xml).byteLength, version: version.date };
}

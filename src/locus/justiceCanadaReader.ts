/**
 * justiceCanadaReader — Canada's federal Acts from Justice Canada's own
 * consolidated XML (doc 134 §16.12), in English and in French.
 *
 * Measured 2026-10-03: `github.com/justicecanada/laws-lois-xml` holds the 971
 * consolidated Acts in both languages (`eng/acts/C-46.xml`,
 * `fra/lois/C-46.xml`), Open Government Licence – Canada, served by
 * raw.githubusercontent.com with CORS `*`. Legalize has no Canada.
 *
 * One `<Section>` per unit: `<MarginalNote>` (its heading), `<Label>` (its
 * number), then `<Text>`, `<Subsection>`, `<Paragraph>`… A repealed section's
 * text is `<Repealed>[Repealed, 2012, c. 9, s. 2]</Repealed>` (317 in the
 * Criminal Code); text not yet in force sits in `<RelatedOrNotInForce>`
 * (124). Both stay out, and so do the `<HistoricalNote>` amendment lists.
 * ⚠️ Schedules (forms, tables) are not read. Provinces (Quebec's civil code,
 * Ontario) are not federal law and are not here.
 */
import type { LocusArticle } from './locusReader';

export const JUSTICE_CANADA_RAW = 'https://raw.githubusercontent.com/justicecanada/laws-lois-xml/main';

export type CanadaLang = 'eng' | 'fra';

/** Raw URL of one Act in one language. */
export function canadaActUrl(lang: CanadaLang, id: string): string {
  return `${JUSTICE_CANADA_RAW}/${lang === 'eng' ? 'eng/acts' : 'fra/lois'}/${encodeURIComponent(id)}.xml`;
}

function squash(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Units of text inside a section, each starting a line with its label. */
const STRUCT = new Set(['Subsection', 'Paragraph', 'Subparagraph', 'Clause', 'Subclause', 'Definition', 'Provision']);
/** Text a reader of the law today must not get. */
const SKIP = new Set(['MarginalNote', 'Label', 'HistoricalNote', 'RelatedOrNotInForce', 'Footnote']);
/** Text blocks: their whole content is one line. */
const TEXT = new Set(['Text', 'ContinuedSectionSubsection', 'ContinuedParagraph', 'ContinuedSubparagraph', 'ContinuedClause', 'ContinuedDefinition']);

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}

/** The lines of a section or of one of its parts: `(1) A person commits…`, `(a) without…`. */
function render(el: Element): string[] {
  const lines: string[] = [];
  let label = squash(child(el, 'Label')?.textContent);
  for (const c of Array.from(el.children)) {
    if (SKIP.has(c.localName)) continue;
    if (TEXT.has(c.localName)) {
      const text = squash(c.textContent);
      if (!text) continue;
      lines.push(label ? `${label} ${text}` : text);
      label = '';
    } else if (STRUCT.has(c.localName)) {
      lines.push(...render(c));
    }
  }
  return lines;
}

export interface CanadaAct {
  title: string | null;
  articles: LocusArticle[];
  /** Sections left out because their text is a repeal notice. */
  repealed: number;
}

/**
 * The sections in force of one Act. `topic` is the chain of `<Heading>`
 * titles above the section (they are siblings of the sections, by level).
 */
export function parseCanadaAct(
  xml: string,
  lang: CanadaLang,
  parse: (s: string) => Document = (s) => new DOMParser().parseFromString(s, 'application/xml'),
): CanadaAct {
  const doc = parse(xml);
  if (doc.getElementsByTagName('parsererror').length) throw new Error('CANADA_BAD_XML');
  const title = squash(doc.getElementsByTagName('ShortTitle')[0]?.textContent ?? doc.getElementsByTagName('LongTitle')[0]?.textContent) || null;
  const body = doc.getElementsByTagName('Body')[0];
  if (!body) throw new Error('CANADA_EMPTY_TEXT');
  const headings: string[] = [];
  const articles: LocusArticle[] = [];
  let repealed = 0;
  // The body's children are its sections and headings, in order (measured:
  // nothing else in the Criminal Code). Schedules sit outside the body.
  // Walking every descendant instead took 200 s for the Criminal Code under jsdom.
  for (const el of Array.from(body.children)) {
    if (el.localName === 'Heading') {
      const level = Number(el.getAttribute('level') ?? '1') || 1;
      headings.length = Math.min(headings.length, level - 1);
      headings[level - 1] = squash(child(el, 'TitleText')?.textContent);
      continue;
    }
    if (el.localName !== 'Section') continue;
    const number = squash(child(el, 'Label')?.textContent);
    const note = squash(child(el, 'MarginalNote')?.textContent);
    const lines = render(el);
    if (lines.length === 0 || lines.every((l) => /\[(Repealed|Abrogée?s?)[\s,\]]/i.test(l) && l.length < 200)) {
      repealed++;
      continue;
    }
    const header = `${lang === 'eng' ? 'Section' : 'Art.'} ${number}`;
    const content = [note ? `(${note})` : '', ...lines].filter(Boolean).join('\n\n');
    articles.push({ header, content, isSubstantive: true, topic: headings.filter(Boolean).join(' › ') || null, function: null });
  }
  return { title, articles, repealed };
}

export type FetchText = (url: string, signal?: AbortSignal) => Promise<string>;

/** Reads one Act in one language; an Act with no section in force is refused. */
export async function readCanadaAct(
  fetchText: FetchText,
  lang: CanadaLang,
  id: string,
  opts: { signal?: AbortSignal; parse?: (s: string) => Document } = {},
): Promise<CanadaAct & { bytes: number }> {
  const xml = await fetchText(canadaActUrl(lang, id), opts.signal);
  const act = parseCanadaAct(xml, lang, opts.parse);
  if (act.articles.length === 0) throw new Error('CANADA_EMPTY_TEXT');
  return { ...act, bytes: new TextEncoder().encode(xml).byteLength };
}

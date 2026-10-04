/**
 * normattivaReader — Italy's codes and constitution from Normattiva, the
 * State's own portal (doc 134 §16.9). Legalize's Italian repository could not
 * serve them, measured 2026-10-03: the constitution file holds article 1 and
 * nothing else, 28 % of its files are under 1 KB, and the civil and penal
 * codes are absent.
 *
 * Two routes, both open (no key, CORS `*`, measured the same day):
 *  - the codes: ONE zip, the "Codici" collection in its text in force
 *    (`formatoRichiesta=V`), 40 acts, 10.5 MB, Akoma Ntoso XML. The request
 *    answers 302 to a signed download URL; `fetch` follows it.
 *  - the constitution is not in any collection: it is read article by
 *    article by URN (`~art1` … `~art139`). The 18 transitional provisions are
 *    numbered in Roman figures and that route refuses them.
 *
 * 🪤 Two shapes of code in the same zip: a recent decree carries its articles
 * as `<article>` in its body; an old royal decree (civil, penal, procedure)
 * carries each article of the code as one `<attachment>` whose text reads
 * `CODICE PENALE Art. 1. (Reati e pene) Nessuno…`. 🪤 The civil code's entry
 * is base64 text, not XML. 🪤 The collection is not filtered on force: the
 * 2016 public-contracts code, repealed in 2023, is served with every article
 * reading `((PROVVEDIMENTO ABROGATO …))`.
 */
import type { LocusArticle } from './locusReader';

export const NORMATTIVA_API = 'https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1';

/** The "Codici" collection, text in force, Akoma Ntoso. */
export const CODICI_URL = `${NORMATTIVA_API}/collections/download/collection-preconfezionata?nome=Codici&formato=AKN&formatoRichiesta=V`;

/** The constitution's codice redazionale and its URN. */
export const CONSTITUTION_ID = '047U0001';
const CONSTITUTION_URN = 'urn:nir:stato:costituzione:1947-12-27';
const CONSTITUTION_ARTICLES = 139;

// ── Zip ──────────────────────────────────────────────────────────────────

/**
 * The entries of a zip, by name. Reads the central directory and inflates
 * with the platform's `DecompressionStream`: every entry of the collection is
 * stored (0) or deflated (8), measured, so no library is needed.
 */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('NORMATTIVA_NOT_A_ZIP');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('NORMATTIVA_BAD_ZIP');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, await inflateRaw(data));
    else throw new Error(`NORMATTIVA_ZIP_METHOD (${method})`);
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(data).body!.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** An entry's XML: UTF-8, or base64 of UTF-8 (the civil code's entry). */
export function entryText(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  if (text.trimStart().startsWith('<')) return text;
  return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));
}

/** The zip entry of a code, by its codice redazionale (`…_042U0262_VIGENZA_2026-04-29_V0.xml`). */
export function findEntry(names: Iterable<string>, id: string): string | null {
  for (const name of names) if (name.endsWith('.xml') && name.includes(`_${id}_`)) return name;
  return null;
}

/** The date of the text in force a zip entry carries (`VIGENZA_2026-04-29`), ISO. */
export function versionDate(name: string): string | null {
  return name.match(/VIGENZA_(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

// ── Akoma Ntoso ──────────────────────────────────────────────────────────

/** One line of text: tags gone, white space collapsed. */
function squash(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** Paragraphs of a text node's content, the blank lines of the source kept. */
function paragraphs(s: string | null | undefined): string {
  return (s ?? '').split(/\n\s*\n/).map(squash).filter(Boolean).join('\n\n');
}

/** Elements by local name, whatever the namespace prefix. */
function byName(root: Element | Document, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', name));
}

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}

/** An article that holds nothing but its repeal notice. */
const REPEALED_ARTICLE = /^\(*\s*ARTICOLO ABROGATO\b/i;
/** A whole act repealed: Normattiva writes it on every article of it. */
const REPEALED_ACT = /\(\(\s*PROVVEDIMENTO ABROGATO\b/i;

const LEVELS = new Set(['book', 'part', 'title', 'chapter', 'section', 'subsection']);

/** `Libro I › Titolo II` above an `<article>`. */
function topicOf(article: Element): string | null {
  const chain: string[] = [];
  for (let el = article.parentElement; el; el = el.parentElement) {
    if (!LEVELS.has(el.localName)) continue;
    const label = [squash(child(el, 'num')?.textContent), squash(child(el, 'heading')?.textContent)].filter(Boolean).join(' ');
    if (label) chain.unshift(label);
  }
  return chain.length ? chain.join(' › ') : null;
}

/** `Art. 5.` → `Art. 5`; `Art. 5-bis` kept. */
function articleLabel(num: string): string {
  const m = squash(num).match(/^art(?:icolo)?\.?\s*(\d+(?:-?[a-z]+)?)/i);
  return m ? `Art. ${m[1]}` : squash(num).replace(/\.$/, '');
}

/** The article of an old code's attachment: `CODICE PENALE Art. 1. (Reati e pene) Nessuno…`. */
function attachmentArticle(text: string): { header: string; content: string } | null {
  const flat = squash(text);
  const m = flat.slice(0, 160).match(/\b[Aa]rt\.?\s*(\d+(?:-?(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies|undecies|duodecies|terdecies|quater-?decies|[a-z]))?)\b\.?/);
  if (!m || m.index === undefined) return null;
  // The text after the number, with its line breaks: find it again in the raw text.
  const rest = text.slice(text.search(new RegExp(`[Aa]rt\\.?\\s*${m[1]!.replace(/-/g, '\\-')}\\b`)) + m[0].length - 1);
  return { header: `Art. ${m[1]}`, content: paragraphs(rest.replace(/^[^\p{L}\d(]+/u, '')) };
}

export interface AknCode {
  /** `urn:nir:stato:regio.decreto:1942-03-16;262`. */
  urn: string | null;
  /** The act's own title (`Approvazione del testo del Codice civile.`). */
  title: string | null;
  articles: LocusArticle[];
  /** Articles left out because their whole text is a repeal notice. */
  repealed: number;
  /** True when Normattiva marks the whole act repealed. */
  actRepealed: boolean;
}

/**
 * The articles in force of one Akoma Ntoso act. An article whose text is
 * only `((ARTICOLO ABROGATO …))` is counted and left out; an article with a
 * repealed paragraph is kept, its notice in place.
 */
export function parseAknCode(xml: string, parse: (s: string) => Document = (s) => new DOMParser().parseFromString(s, 'application/xml')): AknCode {
  const doc = parse(xml);
  if (byName(doc, 'parsererror').length) throw new Error('NORMATTIVA_BAD_XML');
  const urn = byName(doc, 'FRBRalias').find((a) => a.getAttribute('name') === 'urn:nir')?.getAttribute('value') ?? null;
  const title = squash(byName(doc, 'docTitle')[0]?.textContent) || null;
  const articles: LocusArticle[] = [];
  let repealed = 0;
  let notices = 0;
  const keep = (header: string, heading: string, body: string, topic: string | null) => {
    if (REPEALED_ACT.test(body)) notices++;
    if (REPEALED_ARTICLE.test(body)) { repealed++; return; }
    const content = [heading ? `(${heading.replace(/^\(+|\)+$/g, '')})` : '', body].filter(Boolean).join('\n\n');
    if (content) articles.push({ header, content, isSubstantive: true, topic, function: null });
  };

  for (const article of byName(doc, 'article')) {
    const header = articleLabel(child(article, 'num')?.textContent ?? '');
    const heading = squash(child(article, 'heading')?.textContent);
    const parts = Array.from(article.children)
      .filter((c) => c.localName !== 'num' && c.localName !== 'heading')
      .map((c) => {
        // `<num>1.</num><content>…` : the number of a paragraph is its own
        // element, glued to the text when the XML has no white space between.
        const num = child(c, 'num');
        if (!num) return paragraphs(c.textContent);
        const text = (c.textContent ?? '').replace(num.textContent ?? '', '');
        return `${squash(num.textContent)} ${paragraphs(text)}`.trim();
      })
      .filter(Boolean);
    keep(header, heading, parts.join('\n\n'), topicOf(article));
  }
  // An old code is its attachments (996 for the penal code, beside the 3
  // articles of the decree approving it); a recent code's attachments are
  // annexes (tables, forms) and stay out.
  const attachments = byName(doc, 'attachment');
  if (attachments.length <= byName(doc, 'article').length) attachments.length = 0;
  for (const attachment of attachments) {
    const body = byName(attachment, 'mainBody')[0];
    if (!body) continue;
    const art = attachmentArticle(body.textContent ?? '');
    if (!art) continue;
    keep(art.header, '', art.content, null);
  }
  const total = articles.length + repealed;
  return { urn, title, articles, repealed, actRepealed: total > 0 && notices >= total / 2 };
}

// ── Reading ──────────────────────────────────────────────────────────────

export type FetchBytes = (url: string, signal?: AbortSignal) => Promise<Uint8Array>;
export type PostJson = (url: string, body: unknown, signal?: AbortSignal) => Promise<unknown>;

/**
 * The zip of the codes, fetched once per window: importing a second code
 * costs nothing. A failed fetch is not kept, so the next import tries again.
 */
let codici: Promise<Map<string, Uint8Array>> | null = null;

export function loadCodici(fetchBytes: FetchBytes, signal?: AbortSignal): Promise<Map<string, Uint8Array>> {
  if (!codici) {
    codici = fetchBytes(CODICI_URL, signal).then(unzip);
    codici.catch(() => { codici = null; });
  }
  return codici;
}

/** For the tests: forget the zip of this window. */
export function forgetCodici(): void {
  codici = null;
}

/**
 * Reads one code of the collection. Refuses a code the zip no longer holds,
 * a code Normattiva marks repealed, and a code with no article in force.
 */
export async function readNormattivaCode(
  fetchBytes: FetchBytes,
  id: string,
  opts: { signal?: AbortSignal; parse?: (s: string) => Document } = {},
): Promise<{ articles: LocusArticle[]; repealed: number; versionDate: string | null; bytes: number }> {
  const entries = await loadCodici(fetchBytes, opts.signal);
  const name = findEntry(entries.keys(), id);
  if (!name) throw new Error('NORMATTIVA_NOT_IN_COLLECTION');
  const raw = entries.get(name)!;
  const code = parseAknCode(entryText(raw), opts.parse);
  if (code.actRepealed) throw new Error('NORMATTIVA_REPEALED');
  if (code.articles.length === 0) throw new Error('NORMATTIVA_EMPTY_TEXT');
  return { articles: code.articles, repealed: code.repealed, versionDate: versionDate(name), bytes: raw.byteLength };
}

/** The text of an `articoloHtml` answer: tags gone, entities decoded, paragraphs kept. */
export function htmlText(html: string, parse: (s: string) => Document = (s) => new DOMParser().parseFromString(s, 'text/html')): string {
  const doc = parse(html.replace(/<br\s*\/?>/gi, '\n\n').replace(/<\/(div|p|h\d)>/gi, '$&\n\n'));
  return paragraphs(doc.body?.textContent ?? '');
}

/**
 * The constitution, article by article (1 to 139). A repealed article
 * (115, 124, 128-130 since 2001) is counted and left out.
 */
export async function readConstitution(
  postJson: PostJson,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; parse?: (s: string) => Document } = {},
): Promise<{ articles: LocusArticle[]; repealed: number }> {
  const articles: LocusArticle[] = [];
  let repealed = 0;
  for (let n = 1; n <= CONSTITUTION_ARTICLES; n++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await postJson(`${NORMATTIVA_API}/atto/dettaglio-atto-urn`, { urn: `${CONSTITUTION_URN}~art${n}` }, opts.signal) as
      { data?: { atto?: { articoloHtml?: string } | null } | null; message?: string | null };
    const html = res?.data?.atto?.articoloHtml;
    if (!html) throw new Error(`NORMATTIVA_NO_ARTICLE (${n}${res?.message ? `: ${res.message}` : ''})`);
    const text = htmlText(html, opts.parse).replace(/^Art\.\s*\d+\s*/, '');
    if (REPEALED_ARTICLE.test(text)) repealed++;
    else articles.push({ header: `Art. ${n}`, content: text, isSubstantive: true, topic: null, function: null });
    opts.onProgress?.(n, CONSTITUTION_ARTICLES);
  }
  return { articles, repealed };
}

/**
 * How Italy cites an act, from its URN:
 * `urn:nir:stato:regio.decreto:1942-03-16;262` → `R.D. 16 marzo 1942, n. 262`.
 */
export function referenceOfUrn(urn: string | null): string | null {
  const m = urn?.match(/:(regio\.decreto|decreto\.legislativo|decreto\.del\.presidente\.della\.repubblica|decreto|legge|costituzione):(\d{4})-(\d{2})-(\d{2});(\d+)/);
  if (!m) return null;
  const kind = ({ 'regio.decreto': 'R.D.', 'decreto.legislativo': 'D.Lgs.', 'decreto.del.presidente.della.repubblica': 'D.P.R.', decreto: 'D.M.', legge: 'Legge', costituzione: 'Costituzione' } as Record<string, string>)[m[1]!]!;
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  return `${kind} ${Number(m[4])} ${months[Number(m[3]) - 1]} ${m[2]}, n. ${m[5]}`;
}

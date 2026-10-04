/**
 * articleText — how a LOCUS row becomes a readable label and a chronicle.
 *
 * Pure, no import beside the source constants. The chronicle carries the
 * place, the article header, the text verbatim, and the attribution + corpus
 * date (doc 134 §2.1, §2.3): a chunk retrieved alone, months later, must
 * still say where it comes from and how old it is.
 */
import { LEGALIZE_SOURCES, LEGI_ATTRIBUTION, LOCUS_ATTRIBUTION, LOCUS_PUBLISHED, JUSTICE_CANADA_SOURCE, NORMATTIVA_SOURCE, justiceCanadaAttribution, legalizeAttribution, normattivaAttribution } from './locusSource';
import type { LocusArticle, LocusPlace } from './locusReader';

/**
 * Display label of a place. LOCUS spells names without a rule (`kingcove`,
 * `fort_collins`, `newyorkcity`): underscores become spaces, words get a
 * capital, and a name glued together STAYS glued. Inventing the spaces of
 * `newyorkcity` would be a guess printed as a fact.
 */
export function placeLabel(place: Pick<LocusPlace, 'state' | 'name'> & { label?: string }): string {
  // A source that names its unit (a French code) is shown as named.
  if (place.label) return place.label;
  const words = place.name.split('_').filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return `${words.join(' ')}, ${place.state.toUpperCase()}`;
}

/** The article header without its markdown hashes. */
export function cleanHeader(header: string): string {
  return header.replace(/^#+\s*/, '').trim();
}

/**
 * Largest article text in ONE chronicle. The host cuts a chronicle at 50 000
 * characters without a word (`mnemosyne.ingest` slices), and Austin holds 4
 * articles above that, one of 570 660 characters (doc 134 §10.3). 18 000 is
 * DocWatch's part size (doc 57), so a law part reads like any document part.
 */
export const PART_CHARS = 18_000;

/**
 * Splits an article text into parts of at most `max` characters, at a blank
 * line when one exists in the second half of the window, else at a line
 * break, else at a space, else hard. Joined back, the parts are the text.
 */
export function splitText(text: string, max = PART_CHARS): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const floor = Math.floor(max / 2);
    let cut = window.lastIndexOf('\n\n');
    if (cut < floor) cut = window.lastIndexOf('\n');
    if (cut < floor) cut = window.lastIndexOf(' ');
    if (cut < floor) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts;
}

/**
 * Chronicle bodies for one article: one, or one per part when the text is
 * long. The text is never rewritten; every part carries the place, the
 * header, its position and the attribution, so a part retrieved alone still
 * says what it is a piece of.
 */
type ChronicleUnit = Pick<LocusPlace, 'state' | 'name'> & Partial<Pick<LocusPlace, 'type' | 'label' | 'snapshot' | 'key' | 'reference'>>;

/** A national law of a Legalize country (Colombia…), told apart from a French code by its key. */
function isLegalize(place: ChronicleUnit): boolean {
  return place.type === 'code' && (place.key?.startsWith('legalize|') ?? false);
}

/** A Canadian federal Act from Justice Canada. */
function isJustice(place: ChronicleUnit): boolean {
  return place.type === 'code' && (place.key?.startsWith('justice|') ?? false);
}

/** An Italian code from Normattiva. */
function isNormattiva(place: ChronicleUnit): boolean {
  return place.type === 'code' && (place.key?.startsWith('normattiva|') ?? false);
}

/** English name of a country code, for the chronicle (`co` → `Colombia`). */
function countryName(code: string): string {
  try {
    if (code === 'int') return 'International';
    const iso = code === 'uk' ? 'GB' : code.toUpperCase();
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso) ?? iso;
  } catch (err) {
    console.warn('[mnemo-law] region names unavailable:', err);
    return code.toUpperCase();
  }
}

/**
 * Title of a unit inside a chronicle. A Legalize law carries its country and
 * reference: "Código Civil" is a law of Colombia, Spain AND Argentina, and an
 * article retrieved alone must say which one it is.
 */
export function chronicleTitle(place: ChronicleUnit): string {
  if (!isLegalize(place) && !isNormattiva(place) && !isJustice(place)) return placeLabel(place);
  const ref = place.reference ? `, ${place.reference}` : '';
  return `${placeLabel(place)} (${countryName(place.state)}${ref})`;
}

/** The closing line of a chronicle: where the text comes from, how old it is, where to check it. */
export function sourceLine(place: ChronicleUnit, article: LocusArticle): string {
  if (isJustice(place)) {
    const asOf = place.snapshot ? `Current to ${place.snapshot}. ` : '';
    return `Source: ${justiceCanadaAttribution()}. ${asOf}Not an official text: check the text in force on ${JUSTICE_CANADA_SOURCE.checkAt}.`;
  }
  if (isNormattiva(place)) {
    const asOf = place.snapshot ? `Text in force as of ${place.snapshot}. ` : '';
    return `Source: ${normattivaAttribution()}. ${asOf}Not an official text: check the text in force on ${NORMATTIVA_SOURCE.checkAt}.`;
  }
  if (isLegalize(place)) {
    const asOf = place.snapshot ? `Version including reforms up to ${place.snapshot}. ` : '';
    const at = LEGALIZE_SOURCES[place.state]?.checkAt ?? 'the official source';
    return `Source: ${legalizeAttribution(place.state)}. ${asOf}Not an official text: check the text in force on ${at}.`;
  }
  if (place.type === 'code') {
    const since = article.inForceSince ? `In force since ${article.inForceSince}. ` : '';
    const snap = place.snapshot ? `LEGI snapshot of ${place.snapshot}; ` : '';
    return `Source: ${LEGI_ATTRIBUTION}. ${since}${snap}the text in force must be checked on legifrance.gouv.fr.`;
  }
  return `Source: ${LOCUS_ATTRIBUTION}. Corpus published ${LOCUS_PUBLISHED}; the text in force must be checked with the city or county.`;
}

export function articleChronicles(place: ChronicleUnit, article: LocusArticle): string[] {
  const title = cleanHeader(article.header) || '(untitled article)';
  const parts = splitText(article.content.trim());
  return parts.map((part, i) => [
    `# ${chronicleTitle(place)} · ${title}${parts.length > 1 ? ` (part ${i + 1}/${parts.length})` : ''}`,
    '',
    part.trim(),
    '',
    sourceLine(place, article),
  ].join('\n'));
}

/** sourceRef of one article (or of one part of it): the place key and its position. */
export function articleRef(place: Pick<LocusPlace, 'key'>, index: number, part?: number): string {
  const scheme = place.key.startsWith('legi|') ? 'legi' : place.key.startsWith('legalize|') ? 'legalize' : place.key.startsWith('normattiva|') ? 'normattiva' : place.key.startsWith('justice|') ? 'justice' : 'locus';
  return `${scheme}:${place.key}#${index}${part === undefined ? '' : `.${part}`}`;
}

/**
 * swissCatalogue — Switzerland's federal laws MnemoLaw offers, in French,
 * German and Italian (doc 134 §16.17, `scripts/build-switzerland.ts`).
 *
 * The list is a menu (§16.3): at import the reader asks Fedlex again which
 * version applies today, and a law no longer in force is refused there. A
 * unit's `folder` carries its language, its `name` the ELI path.
 */
import type { LocusPlace } from './locusReader';
import type { SwissLang } from './fedlexReader';

interface SwissEntry { sr: string; eli: string; lang: SwissLang; label: string; short: string | null }

/** Key prefix of a Swiss law: `fedlex|ch|<fr|de|it>|<eli>`. */
export const FEDLEX_KEY = 'fedlex|';

export function isFedlexKey(key: string): boolean {
  return key.startsWith(FEDLEX_KEY);
}

/** The language of a Swiss unit. */
export function swissLangOf(place: Pick<LocusPlace, 'folder'>): SwissLang {
  return place.folder === 'de' || place.folder === 'it' ? place.folder : 'fr';
}

/** The language the tiles use: the app's when Switzerland writes its laws in it, German otherwise. */
export function swissLangFor(appLang: string): SwissLang {
  if (appLang.startsWith('fr')) return 'fr';
  if (appLang.startsWith('it')) return 'it';
  return 'de';
}

let listedOn: string | null = null;

/** The laws of Switzerland, three languages, as units the import understands. */
export async function loadSwissLaws(): Promise<LocusPlace[]> {
  const cat = (await import('../catalogue/ch.json')).default as { listedOn: string; entries: SwissEntry[] };
  listedOn = cat.listedOn;
  return cat.entries.map((e): LocusPlace => ({
    key: `${FEDLEX_KEY}ch|${e.lang}|${e.eli}`,
    type: 'code',
    state: 'ch',
    name: e.eli,
    rows: null,
    label: e.label,
    folder: e.lang,
    // "RS 210" in French and Italian, "SR 210" in German: the way each cites it.
    reference: `${e.lang === 'de' ? 'SR' : 'RS'} ${e.sr}${e.short ? `, ${e.short}` : ''}`,
  }));
}

/** When the list was read from Fedlex, once loaded. */
export function swissListDate(): string | null {
  return listedOn;
}

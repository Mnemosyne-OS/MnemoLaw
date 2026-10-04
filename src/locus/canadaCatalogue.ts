/**
 * canadaCatalogue — Canada's federal Acts, in English and in French, from
 * Justice Canada's index (doc 134 §16.12, `scripts/build-canada.ts`).
 *
 * 1 942 entries (260 KB): the list is read when the person opens Canada,
 * never when the cartridge starts. A unit's `folder` carries its language.
 */
import type { LocusPlace } from './locusReader';
import type { CanadaLang } from './justiceCanadaReader';

interface CanadaEntry { id: string; lang: CanadaLang; label: string; number: string; currentTo: string | null }

/** Key prefix of a Canadian Act: `justice|ca|<eng|fra>|<id>`. */
export const JUSTICE_KEY = 'justice|';

export function isJusticeKey(key: string): boolean {
  return key.startsWith(JUSTICE_KEY);
}

/** The language of a Canadian unit. */
export function canadaLangOf(place: Pick<LocusPlace, 'folder'>): CanadaLang {
  return place.folder === 'fra' ? 'fra' : 'eng';
}

let listedOn: string | null = null;

/** The Acts of Canada, both languages, as units the import understands. */
export async function loadCanadaLaws(): Promise<LocusPlace[]> {
  const cat = (await import('../catalogue/ca.json')).default as { listedOn: string; entries: CanadaEntry[] };
  listedOn = cat.listedOn;
  return cat.entries.map((e): LocusPlace => ({
    key: `${JUSTICE_KEY}ca|${e.lang}|${e.id}`,
    type: 'code',
    state: 'ca',
    name: e.id,
    rows: null,
    label: e.label,
    folder: e.lang,
    reference: e.number,
    ...(e.currentTo ? { snapshot: e.currentTo } : {}),
  }));
}

/** When the list was read from Justice Canada's index, once loaded. */
export function canadaListDate(): string | null {
  return listedOn;
}

/**
 * Shared types of the MnemoLaw screens. Types only, so the .tsx files keep
 * exporting components alone (Fast Refresh).
 */
import type { Key } from '../i18n/strings';
import type { LocusPlace } from '../locus/locusReader';

/** The translator handed down from App. */
export type T = (key: Key, vars?: Record<string, string | number>) => string;

/** The countries MnemoLaw has a source for (doc 134 lots 1-3, then §16). */
export type Country = 'us' | 'fr' | 'co' | 'es' | 'ar' | 'it' | 'pt' | 'uk' | 'ca' | 'eu' | 'int';

/** Every country with a source, in the order the home shows them. */
export const COUNTRIES: readonly Country[] = ['int', 'eu', 'us', 'ca', 'fr', 'uk', 'co', 'es', 'ar', 'it', 'pt'];

/** Which screen is shown. */
export type View = { kind: 'home' } | { kind: 'country'; country: Country } | { kind: 'request' };

/** A long step in progress, shown with what it measured so far. */
export type Job =
  | { kind: 'places'; startedAt: number; bytes: number }
  | { kind: 'download'; startedAt: number; bytes: number; place: LocusPlace }
  | { kind: 'ingest'; startedAt: number; place: LocusPlace; done: number; total: number }
  /** A "load everything" pack: laws read since `startCursor`, out of `total` (doc 134 §16.6). */
  | { kind: 'pack'; startedAt: number; rank: string; cursor: number; startCursor: number; total: number; articles: number };

export type VaultState =
  | { kind: 'loading' }
  | { kind: 'ready'; vault: string; unlocked: boolean }
  | { kind: 'error'; why: string };

/**
 * The country an imported unit belongs to: a US city or county, or a national
 * law whose `state` is its country (`fr` for LEGI, `co`… for Legalize).
 */
export function countryOf(place: Pick<LocusPlace, 'type' | 'state'>): Country {
  if (place.type !== 'code') return 'us';
  return (COUNTRIES as readonly string[]).includes(place.state) ? place.state as Country : 'fr';
}

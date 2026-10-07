/**
 * packName — which Memory Pack a law goes into (host doc 135 §6.3, §6.6).
 *
 * One vault per country, and one per US place: « Lois · Colombie »,
 * « Lois · Austin ». The person turns one off without turning off the others,
 * and AUTO chooses between vaults that say what they hold.
 *
 * The host derives the folder and the vault name from this string; it only
 * has to be stable and at most 48 characters.
 */
import type { LocusPlace } from './locusReader';
import { countryOf } from '../ui/types';

/** Longest pack name the host accepts. */
export const PACK_NAME_MAX = 48;

/** The pack of one country: its code. */
export function countryPack(country: string): string {
  return country.toLowerCase();
}

/** The pack a unit's laws go into. */
export function packOf(place: Pick<LocusPlace, 'type' | 'state' | 'name'>): string {
  const country = countryOf(place);
  if (country !== 'us') return countryPack(country);
  // A US city or county: its own pack, named by state and place. A county
  // says so: Denver the city and Denver the county are two corpora.
  const suffix = place.type === 'counties' ? '-county' : '';
  const base = `us-${place.state}-${place.name}`.toLowerCase().slice(0, PACK_NAME_MAX - suffix.length);
  return `${base}${suffix}`;
}

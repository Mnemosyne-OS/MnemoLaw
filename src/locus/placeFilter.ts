/**
 * placeFilter — find a place in the LOCUS list the way a person types it.
 *
 * LOCUS spells names without a rule (`fort_collins`, `kingcove`,
 * `newyorkcity`), so matching compares COMPACT forms: lower case, no spaces,
 * no underscores, no punctuation. "Fort Collins", "fortcollins" and
 * "fort_collins" all find the same place, and "New York" finds `newyorkcity`.
 * A two-letter state code alone ("tx") lists that state.
 */
import type { LocusPlace } from './locusReader';

function compact(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Places matching the query, names starting with it first, then the biggest codes. */
export function filterPlaces(places: readonly LocusPlace[], query: string, limit: number): LocusPlace[] {
  const raw = query.trim().toLowerCase();
  if (!raw) return [];
  // "Austin, TX" / "austin tx": a trailing state code narrows to that state.
  const m = raw.match(/^(.*?)[\s,]+([a-z]{2})$/);
  let stateFilter = m && m[1] ? m[2] : null;
  let q = compact(stateFilter ? m![1]! : raw);
  const onlyState = !stateFilter && /^[a-z]{2}$/.test(raw) ? raw : null;
  // A national law is found by its title or reference too: Canada's name is
  // `C-46`, and "criminel" found nothing (Tony, 2026-10-03).
  const text = (p: LocusPlace) => `${compact(p.name)} ${compact(p.label ?? '')} ${compact(p.reference ?? '')}`;
  const match = (p: LocusPlace) => {
    if (onlyState) return p.state === onlyState || compact(p.name).includes(q);
    if (stateFilter && p.state !== stateFilter) return false;
    return text(p).includes(q);
  };
  let hits = places.filter(match);
  // 🪤 A city whose last word has two letters ("santa fe") read as "santa" in
  // state FE and found nothing (verification 2026-10-03). Nothing found with
  // the state reading = read the whole query as a name.
  if (hits.length === 0 && stateFilter) {
    stateFilter = null;
    q = compact(raw);
    hits = places.filter(match);
  }
  hits.sort((a, b) => {
    const starts = (p: LocusPlace) => (compact(p.name).startsWith(q) || compact(p.label ?? '').startsWith(q) ? 0 : 1);
    const as = starts(a);
    const bs = starts(b);
    return as - bs || (b.rows ?? 0) - (a.rows ?? 0) || a.key.localeCompare(b.key);
  });
  return hits.slice(0, limit);
}

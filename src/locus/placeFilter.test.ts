import { describe, it, expect } from 'vitest';
import { filterPlaces } from './placeFilter';
import type { LocusPlace } from './locusReader';

const P = (type: 'cities' | 'counties', state: string, name: string, rows: number): LocusPlace =>
  ({ key: `${type}|${state}|${name}`, type, state, name, rows });

const places = [
  P('cities', 'co', 'fort_collins', 900),
  P('cities', 'co', 'denver', 2847),
  P('cities', 'ny', 'newyorkcity', 738),
  P('cities', 'tx', 'austin', 3331),
  P('cities', 'mn', 'austin', 400),
  P('counties', 'tx', 'travis_county', 1200),
];

describe('filterPlaces', () => {
  it('finds a LOCUS name however the person spaces it', () => {
    // LOCUS writes `fort_collins` and `newyorkcity`: typed words must still land.
    expect(filterPlaces(places, 'Fort Collins', 10).map((p) => p.name)).toEqual(['fort_collins']);
    expect(filterPlaces(places, 'new york', 10).map((p) => p.name)).toEqual(['newyorkcity']);
  });

  it('narrows by a trailing state code', () => {
    expect(filterPlaces(places, 'Austin, TX', 10).map((p) => p.key)).toEqual(['cities|tx|austin']);
    expect(filterPlaces(places, 'austin', 10).map((p) => p.state)).toEqual(['tx', 'mn']);
  });

  it('lists a state from its two-letter code', () => {
    expect(filterPlaces(places, 'tx', 10).map((p) => p.name).sort()).toEqual(['austin', 'travis_county']);
  });

  it('returns nothing for an empty query and for a place the corpus lacks', () => {
    expect(filterPlaces(places, '  ', 10)).toEqual([]);
    expect(filterPlaces(places, 'Boulder', 10)).toEqual([]);
  });
});

describe('filterPlaces: a city whose last word has two letters (verification 2026-10-03)', () => {
  it('finds "santa fe" although "fe" looks like a state code', () => {
    const santaFe = { key: 'cities|nm|santa_fe', type: 'cities' as const, state: 'nm', name: 'santa_fe', rows: 900 };
    expect(filterPlaces([santaFe], 'santa fe', 10)).toEqual([santaFe]);
    expect(filterPlaces([santaFe], 'santa fe, nm', 10)).toEqual([santaFe]);
  });
});


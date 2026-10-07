import { describe, it, expect } from 'vitest';
import { packOf, countryPack, PACK_NAME_MAX } from './packName';

describe('packOf — one Memory Pack per country, one per US place', () => {
  it('a national law goes into its country', () => {
    expect(packOf({ type: 'code', state: 'co', name: 'codigo-penal' })).toBe('co');
    expect(packOf({ type: 'code', state: 'fr', name: 'code_civil' })).toBe('fr');
    expect(countryPack('ES')).toBe('es');
  });

  it('a US city and a US county of the same name are two packs', () => {
    expect(packOf({ type: 'cities', state: 'TX', name: 'Austin' })).toBe('us-tx-austin');
    expect(packOf({ type: 'counties', state: 'CO', name: 'Denver' })).toBe('us-co-denver-county');
    expect(packOf({ type: 'cities', state: 'CO', name: 'Denver' })).not.toBe(packOf({ type: 'counties', state: 'CO', name: 'Denver' }));
  });

  // The host refuses a pack name over 48 characters; the county suffix must survive the cut.
  it('stays within the host limit and keeps the county suffix', () => {
    const long = packOf({ type: 'counties', state: 'TX', name: 'x'.repeat(80) });
    expect(long.length).toBeLessThanOrEqual(PACK_NAME_MAX);
    expect(long.endsWith('-county')).toBe(true);
  });
});

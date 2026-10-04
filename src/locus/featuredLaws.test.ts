import { describe, expect, it } from 'vitest';
import { featuredPlaces, FEATURED_MAX } from './featuredLaws';
import { loadCanadaLaws } from './canadaCatalogue';
import { legalizeLaws, loadLegalizeLaws } from './legalizeCatalogue';
import { filterPlaces } from './placeFilter';

describe('featured laws', () => {
  it('shows Canada\'s most asked Acts in the app\'s language', async () => {
    const laws = await loadCanadaLaws();
    const fr = featuredPlaces(laws, 'ca', 'fr');
    expect(fr.map((p) => p.label).slice(0, 3)).toEqual(['Code criminel', 'Loi sur le divorce', 'Code canadien du travail']);
    expect(fr.every((p) => p.folder === 'fra')).toBe(true);
    expect(featuredPlaces(laws, 'ca', 'en')[0]!.label).toBe('Criminal Code');
    expect(fr).toHaveLength(FEATURED_MAX);
  });

  it('shows the UK\'s, and the first entries of a short list', async () => {
    const uk = featuredPlaces(await loadLegalizeLaws('uk'), 'uk', 'en');
    expect(uk.map((p) => p.label)).toContain('Theft Act 1968');
    expect(uk.length).toBeGreaterThanOrEqual(10);
    expect(featuredPlaces(legalizeLaws('es'), 'es', 'fr')[0]!.label).toBe('Constitución Española');
    expect(featuredPlaces([], 'us', 'en')).toEqual([]);
  });

  it('finds a national law by its title, not only by its identifier', async () => {
    const laws = await loadCanadaLaws();
    expect(filterPlaces(laws, 'criminel', 10).map((p) => p.label)).toContain('Code criminel');
    expect(filterPlaces(legalizeLaws('co'), 'penal', 10).map((p) => p.label)).toContain('Código Penal');
  });
});

describe('the European Union list', () => {
  it('shows the regulations people ask about under their common name', async () => {
    const eu = await loadLegalizeLaws('eu');
    const tiles = featuredPlaces(eu, 'eu', 'fr');
    expect(tiles[0]).toMatchObject({ label: 'GDPR — General Data Protection Regulation', reference: 'Regulation (EU) 2016/679', folder: 'eu/32016R0679.md' });
    expect(tiles.length).toBeGreaterThanOrEqual(10);
    expect(filterPlaces(eu, 'personal data', 60).length).toBeGreaterThan(0);
  });
});

describe('the international treaties', () => {
  it('ship with the cartridge: every listed file exists and is read article by article', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { parseLegalizeFile, splitArticles, legalizeFileUrl } = await import('./legalizeReader');
    const dir = join(__dirname, '..', '..', 'public', 'data');
    const index = JSON.parse(readFileSync(join(dir, 'treaties', 'index.json'), 'utf8')) as { entries: { path: string; identifier: string; label: string }[] };
    expect(index.entries.length).toBeGreaterThanOrEqual(22);
    for (const e of index.entries) {
      const { meta, body } = parseLegalizeFile(readFileSync(join(dir, e.path), 'utf8'));
      expect(meta).toMatchObject({ identifier: e.identifier, status: 'in_force', textState: 'current' });
      expect(splitArticles(body, { country: 'int' }).filter((a) => a.header.startsWith('Art.')).length).toBeGreaterThan(10);
    }
    expect(legalizeFileUrl('int', 'treaties/un/udhr.md')).toBe('data/treaties/un/udhr.md');
  });

  it('read the UDHR as its 30 articles, labelled for the chat', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { parseLegalizeFile, splitArticles } = await import('./legalizeReader');
    const text = readFileSync(join(__dirname, '..', '..', 'public', 'data', 'treaties', 'un', 'udhr.md'), 'utf8');
    const arts = splitArticles(parseLegalizeFile(text).body, { country: 'int' }).filter((a) => a.header.startsWith('Art.'));
    expect(arts).toHaveLength(30);
    expect(arts[0]!.content).toContain('All human beings are born free and equal in dignity and rights');
  });
});

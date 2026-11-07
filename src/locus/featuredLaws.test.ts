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

describe('Malta (doc 134 §16.16)', () => {
  const read = async (path: string) => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    return readFileSync(join(__dirname, '..', '..', 'public', 'data', path), 'utf8');
  };

  it('ships its laws with the cartridge: every listed file is in force, current and read article by article', async () => {
    const { parseLegalizeFile, splitArticles, legalizeFileUrl } = await import('./legalizeReader');
    const index = JSON.parse(await read('countries/mt/index.json')) as { entries: { path: string; identifier: string; label: string }[] };
    expect(index.entries.length).toBeGreaterThanOrEqual(30);
    // The gaming laws come first: the Act, then its twelve regulations.
    expect(index.entries.slice(0, 13).map((e) => e.identifier)).toEqual([
      'mt-cap-583', ...Array.from({ length: 12 }, (_, i) => `mt-sl-583.${String(i + 1).padStart(2, '0')}`),
    ]);
    for (const e of index.entries) {
      const { meta, body } = parseLegalizeFile(await read(e.path));
      expect(meta).toMatchObject({ identifier: e.identifier, status: 'in_force', textState: 'current' });
      expect(meta.source).toMatch(/^https:\/\/legislation\.mt\/eli\//);
      expect(splitArticles(body, { country: 'mt' }).filter((a) => a.header.startsWith('Art.')).length, e.identifier).toBeGreaterThan(1);
    }
    expect(legalizeFileUrl('mt', 'countries/mt/cap-583.md')).toBe('data/countries/mt/cap-583.md');
  });

  it('reads the Gaming Act as its 59 articles and 56A, each titled by its marginal note, schedules kept', async () => {
    const { parseLegalizeFile, splitArticles } = await import('./legalizeReader');
    const units = splitArticles(parseLegalizeFile(await read('countries/mt/cap-583.md')).body, { country: 'mt' });
    const arts = units.filter((a) => a.header.startsWith('Art.'));
    expect(arts).toHaveLength(60);
    expect(arts.map((a) => a.header)).toContain('Art. 56-A');
    const minors = arts.find((a) => a.header === 'Art. 14')!;
    expect(minors.content).toMatch(/^\(Protection of minors\)/);
    expect(minors.content).toContain('a citizen of Malta under the age of twenty-five years');
    expect(minors.topic).toBe('PART V - Protection of Minors and Vulnerable Persons');
    // The amendment history in the margin is not law text.
    expect(arts.some((a) => /Amended by:/.test(a.content))).toBe(false);
    expect(units.map((u) => u.header)).toContain('THIRD SCHEDULE');
  });

  it('keeps no provision whose whole text is its repeal notice, and gives the 2026 gaming tax', async () => {
    const { parseLegalizeFile, splitArticles } = await import('./legalizeReader');
    const tax = splitArticles(parseLegalizeFile(await read('countries/mt/sl-583.10.md')).body, { country: 'mt' });
    expect(tax.some((a) => /^(\([^)]*\)\s*)?Repealed by/.test(a.content))).toBe(false);
    const art3 = tax.find((a) => a.header === 'Art. 3')!;
    expect(art3.content).toContain('fifteen per cent (15%)');
    expect(art3.content).toMatch(/; and\n\n\(b\) ten per cent/);
  });

  it('opens the list from the cartridge\'s own address and names legislation.mt, never Legalize', async () => {
    const { vi } = await import('vitest');
    const { sourceLine } = await import('./articleText');
    const index = await read('countries/mt/index.json');
    const fetchMock = vi.fn(async () => new Response(index, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const laws = await loadLegalizeLaws('mt');
      expect(fetchMock).toHaveBeenCalledWith('data/countries/mt/index.json');
      const tiles = featuredPlaces(laws, 'mt', 'fr');
      expect(tiles[0]).toMatchObject({ label: 'Gaming Act', reference: 'Cap. 583', folder: 'countries/mt/cap-583.md' });
      expect(tiles.length).toBeGreaterThanOrEqual(10);
      expect(filterPlaces(laws, 'player protection', 10).map((p) => p.label)).toContain('Gaming Player Protection Regulations');
      const line = sourceLine(tiles[0]!, { header: 'Art. 1', content: '', isSubstantive: true, topic: null, function: null });
      expect(line).toContain('legislation.mt');
      expect(line).not.toContain('Legalize');
    } finally {
      vi.unstubAllGlobals();
    }
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

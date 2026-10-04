import { describe, it, expect, vi } from 'vitest';
import {
  ATTRIBUTION_FILE, EMPTY_LIBRARY, importPlace, joinPath, parseLibrary, parsePlaceFile,
  placeFileName, splitArticles, withPlace, withRequest, type HostPort,
} from './library';
import type { LocusArticle, LocusPlace } from './locusReader';

const place: LocusPlace = { key: 'cities|tx|austin', type: 'cities', state: 'tx', name: 'austin', rows: 4 };
const A = (header: string, isSubstantive: boolean, content = 'text'): LocusArticle =>
  ({ header, content, isSubstantive, topic: null, function: null });
const rows = [A('§ 1', true), A('§ 2', false), A('§ 3', true), A('§ 4', true, '   ')];

function fakePort(over: Partial<HostPort> = {}) {
  const files = new Map<string, string>();
  const ingested: string[] = [];
  const port: HostPort = {
    writeFile: async (path, content) => { files.set(path, content); return { success: true }; },
    ingest: async (e) => { ingested.push(e.sourceRef); },
    ...over,
  };
  return { port, files, ingested };
}

describe('splitArticles', () => {
  it('keeps substantive articles with text and COUNTS the rest', () => {
    const { kept, skipped } = splitArticles(rows);
    expect(kept.map((a) => a.header)).toEqual(['§ 1', '§ 3']);
    expect(skipped).toBe(2);
  });
});

describe('importPlace', () => {
  it('writes the place file and the attribution, then one chronicle per kept article', async () => {
    const { port, files, ingested } = fakePort();
    const entry = await importPlace(port, { folder: 'C:/laws', vault: 'APP-MNEMO-LAW', place, rows });
    expect(files.has('C:/laws/tx-austin.json')).toBe(true);
    expect(files.get(`C:/laws/${ATTRIBUTION_FILE}`)).toContain('CC BY-NC-4.0');
    expect(parsePlaceFile(files.get('C:/laws/tx-austin.json')!)!.articles).toHaveLength(2);
    expect(ingested).toEqual(['locus:cities|tx|austin#0', 'locus:cities|tx|austin#1']);
    expect(entry).toMatchObject({ kept: 2, skipped: 2, inVault: 2, vaultFailed: 0, split: 0, corpusRows: 4 });
  });

  it('files each unit under its country, in the one folder the person picked', async () => {
    const made: string[] = [];
    const { port, files } = fakePort({ mkdir: async (p) => { made.push(p); return { success: true }; } });
    await importPlace(port, { folder: 'C:/laws', vault: 'V', place, rows });
    const penal: LocusPlace = { key: 'justice|ca|fra|C-46', type: 'code', state: 'ca', name: 'C-46', rows: null, label: 'Code criminel' };
    await importPlace(port, { folder: 'C:/laws', vault: 'V', place: penal, rows });
    const theft: LocusPlace = { key: 'legalize|uk|ukpga-1968-60', type: 'code', state: 'uk', name: 'ukpga-1968-60', rows: null };
    await importPlace(port, { folder: 'C:/laws', vault: 'V', place: theft, rows });
    expect(made).toEqual(['C:/laws/United States/TX', 'C:/laws/Canada', 'C:/laws/United Kingdom']);
    expect(files.has('C:/laws/United States/TX/tx-austin.json')).toBe(true);
    expect(files.has('C:/laws/Canada/ca-c-46.json')).toBe(true);
    // The attribution stays at the top of the folder, once.
    expect(files.has(`C:/laws/${ATTRIBUTION_FILE}`)).toBe(true);
  });

  it('stops before writing when the country folder cannot be made', async () => {
    const writeFile = vi.fn();
    const { port } = fakePort({ mkdir: async () => ({ success: false, error: 'EPERM' }), writeFile });
    await expect(importPlace(port, { folder: 'C:/laws', vault: 'V', place, rows })).rejects.toThrow('EPERM');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('stops before the vault when the file cannot be written', async () => {
    const ingest = vi.fn();
    const { port } = fakePort({ writeFile: async () => ({ success: false, error: 'EACCES' }), ingest });
    await expect(importPlace(port, { folder: 'C:/laws', vault: 'V', place, rows })).rejects.toThrow('EACCES');
    expect(ingest).not.toHaveBeenCalled();
  });

  it('counts a refused chronicle and goes on with the next one', async () => {
    let n = 0;
    const { port } = fakePort({ ingest: async () => { if (n++ === 0) throw new Error('REFUSED'); } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const entry = await importPlace(port, { folder: 'C:/laws', vault: 'V', place, rows });
    expect(entry).toMatchObject({ inVault: 1, vaultFailed: 1 });
  });

  it('a stop keeps what was written and says how far it got', async () => {
    const ctrl = new AbortController();
    const seen: string[] = [];
    const { port } = fakePort({ ingest: async (e) => { seen.push(e.sourceRef); ctrl.abort(); } });
    const progress: number[] = [];
    const entry = await importPlace(port, {
      folder: 'C:/laws', vault: 'V', place, rows, signal: ctrl.signal, onIngest: (done) => progress.push(done),
    });
    expect(seen).toHaveLength(1);
    expect(entry).toMatchObject({ kept: 2, inVault: 1, vaultFailed: 0 });
    // The counter on screen stops where the import stopped, never at "2 / 2".
    expect(progress).toEqual([1]);
  });
});

describe('long articles in the vault', () => {
  const long = [A('§ big', true, 'w '.repeat(20_000))];

  it('writes every part with its own ref and counts the article once', async () => {
    const { port, ingested } = fakePort();
    const entry = await importPlace(port, { folder: 'C:/laws', vault: 'V', place, rows: long });
    expect(ingested).toEqual(['locus:cities|tx|austin#0.1', 'locus:cities|tx|austin#0.2', 'locus:cities|tx|austin#0.3']);
    expect(entry).toMatchObject({ kept: 1, split: 1, inVault: 1, vaultFailed: 0 });
  });

  it('an article missing one part is NOT in the vault, it is refused', async () => {
    // A law without its second half would be cited as if it were whole.
    let n = 0;
    const { port } = fakePort({ ingest: async () => { if (n++ === 1) throw new Error('REFUSED'); } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const entry = await importPlace(port, { folder: 'C:/laws', vault: 'V', place, rows: long });
    expect(entry).toMatchObject({ inVault: 0, vaultFailed: 1 });
  });
});

describe('library state', () => {
  it('reads the library from the shape the host REALLY returns, so a restart remembers it', () => {
    // host cartridgeState.ts: { state: <what state.set stored>, updatedAt }
    const stored = { library: { folder: 'C:/laws/MnemoLaw', licenseAccepted: true, places: [] } };
    const lib = parseLibrary({ state: stored, updatedAt: '2026-10-03T18:00:00.000Z' });
    expect(lib.licenseAccepted).toBe(true);
    expect(lib.folder).toBe('C:/laws/MnemoLaw');
    // Nothing ever stored: the host answers state: null.
    expect(parseLibrary({ state: null, updatedAt: null })).toEqual(EMPTY_LIBRARY);
  });

  it('drops unreadable entries instead of inventing them', () => {
    const lib = parseLibrary({ library: { folder: 'C:/laws', licenseAccepted: true, places: [{ key: 'x' }, null, 'junk'] } });
    expect(lib).toEqual({ folder: 'C:/laws', licenseAccepted: true, places: [], requested: [], packs: [] });
    expect(parseLibrary(undefined)).toEqual(EMPTY_LIBRARY);
    // Only an explicit true counts as consent.
    expect(parseLibrary({ library: { licenseAccepted: 'yes' } }).licenseAccepted).toBe(false);
  });

  it('replaces a re-imported place', () => {
    const lib = withPlace(withPlace(EMPTY_LIBRARY, { key: 'k', kept: 1 } as never), { key: 'k', kept: 2 } as never);
    expect(lib.places).toHaveLength(1);
    expect(lib.places[0]!.kept).toBe(2);
  });

  it('refuses a file that is not a place file', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parsePlaceFile('{"a":1}')).toBeNull();
    expect(parsePlaceFile('not json')).toBeNull();
  });

  it('names files per type and joins paths with the folder separator', () => {
    expect(placeFileName({ type: 'counties', state: 'ca', name: 'los_angeles_county' })).toBe('ca-los_angeles_county-county.json');
    expect(joinPath('C:\\Users\\me\\Laws\\', 'a.json')).toBe('C:\\Users\\me\\Laws\\a.json');
  });
});

describe('import edge cases the verification found untested (C03, C04)', () => {
  it('stops before the vault when ONLY the place file cannot be written', async () => {
    // The first version of this test failed EVERY write, so the attribution
    // threw instead of the place file and the rule was never discriminated.
    const ingest = vi.fn();
    const { port } = fakePort({
      writeFile: async (path) => (path.endsWith('tx-austin.json') ? { success: false, error: 'EACCES' } : { success: true }),
      ingest,
    });
    await expect(importPlace(port, { folder: 'C:/laws', vault: 'V', place, rows })).rejects.toThrow('EACCES');
    expect(ingest).not.toHaveBeenCalled();
  });

  it('a stop in the middle of a long article is a stop, not a refusal', async () => {
    const ctrl = new AbortController();
    const long = [A('§ big', true, 'w '.repeat(20_000))];
    const { port } = fakePort({ ingest: async () => { ctrl.abort(); } });
    const entry = await importPlace(port, { folder: 'C:/laws', vault: 'V', place, rows: long, signal: ctrl.signal });
    expect(entry).toMatchObject({ kept: 1, inVault: 0, vaultFailed: 0 });
  });
});

describe('requested countries (doc 134 lot 5)', () => {
  it('remembers a request, replaces an older one for the same country, and drops junk on read', () => {
    let lib = withRequest(EMPTY_LIBRARY, 'DE', '2026-10-03T10:00:00.000Z');
    lib = withRequest(lib, 'DE', '2026-10-04T10:00:00.000Z');
    expect(lib.requested).toEqual([{ code: 'DE', at: '2026-10-04T10:00:00.000Z' }]);
    const read = parseLibrary({ state: { library: { requested: [{ code: 'ES', at: 'x' }, { code: 'spain', at: 'x' }, null] } } });
    expect(read.requested).toEqual([{ code: 'ES', at: 'x' }]);
  });
});


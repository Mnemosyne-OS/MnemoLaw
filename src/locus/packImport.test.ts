import { describe, it, expect, vi } from 'vitest';
import { newPack, packDone, parsePack, runPack, shortTitle, withRetry, type PackEntry } from './packImport';
import { EMPTY_LIBRARY, parseLibrary, withPack } from './library';

const law = (id: string, status = 'in_force') => [
  '---',
  `title: "Por la cual se reglamenta ${id}"`,
  `identifier: "${id}"`,
  `status: "${status}"`,
  'last_updated: "2020-01-01"',
  '---',
  `# ${id}`,
  '##### **Artículo 1.** Primero.',
  '##### **Artículo 2.** Segundo.',
].join('\n');

const PATHS = ['co/LEY-1-2000.md', 'co/LEY-2-2000.md', 'co/LEY-3-2000.md'];
const at = () => new Date('2026-10-03T12:00:00Z');

function harness(texts: Record<string, string>) {
  const ingest = vi.fn(async (_e: { vault: string; content: string; sourceRef: string }) => {});
  const saved: PackEntry[] = [];
  const fetchText = vi.fn(async (url: string) => {
    const name = url.split('/').pop()!;
    const t = texts[name];
    if (t === undefined) throw new Error('HTTP_404');
    return t;
  });
  return { ingest, saved, fetchText, save: async (e: PackEntry) => { saved.push(e); } };
}

describe('runPack', () => {
  it('reads every law, writes each article, and saves the resume point', async () => {
    const h = harness({ 'LEY-1-2000.md': law('LEY-1-2000'), 'LEY-2-2000.md': law('LEY-2-2000'), 'LEY-3-2000.md': law('LEY-3-2000') });
    const end = await runPack({ fetchText: h.fetchText, port: { ingest: h.ingest }, vault: 'V', save: h.save, now: at, saveEvery: 2 },
      PATHS, newPack('co', 'ley', 3, at()));
    expect(end).toMatchObject({ cursor: 3, total: 3, laws: 3, refused: 0, inVault: 6, vaultFailed: 0 });
    expect(packDone(end)).toBe(true);
    expect(h.ingest).toHaveBeenCalledTimes(6);
    expect(h.ingest.mock.calls[0]![0].content).toMatch(/^# Por la cual se reglamenta LEY-1-2000 \(Colombia, Ley 1 de 2000\) · Artículo 1\n/);
    expect(h.ingest.mock.calls[0]![0].sourceRef).toBe('legalize:legalize|co|LEY-1-2000#0');
    // Saved after law 2 (every 2) and once at the end.
    expect(h.saved.map((s) => s.cursor)).toEqual([2, 3]);
  });

  it('resumes at the cursor and never reads a law twice', async () => {
    const h = harness({ 'LEY-3-2000.md': law('LEY-3-2000') });
    const start = { ...newPack('co', 'ley', 3, at()), cursor: 2, laws: 2, inVault: 4 };
    const end = await runPack({ fetchText: h.fetchText, port: { ingest: h.ingest }, vault: 'V', save: h.save, now: at }, PATHS, start);
    expect(h.fetchText).toHaveBeenCalledTimes(1);
    expect(end).toMatchObject({ cursor: 3, laws: 3, inVault: 6 });
  });

  it('counts a law the live file refuses and goes on', async () => {
    const h = harness({ 'LEY-1-2000.md': law('LEY-1-2000', 'repealed'), 'LEY-2-2000.md': law('LEY-2-2000'), 'LEY-3-2000.md': '---\nstatus: "in_force"\n---\n# empty' });
    const end = await runPack({ fetchText: h.fetchText, port: { ingest: h.ingest }, vault: 'V', save: h.save, now: at }, PATHS, newPack('co', 'ley', 3, at()));
    expect(end).toMatchObject({ cursor: 3, laws: 1, refused: 2, inVault: 2 });
  });

  it('a download that keeps failing ends the run with the cursor ON that law', async () => {
    const h = harness({ 'LEY-1-2000.md': law('LEY-1-2000') });
    await expect(runPack({ fetchText: h.fetchText, port: { ingest: h.ingest }, vault: 'V', save: h.save, now: at }, PATHS, newPack('co', 'ley', 3, at())))
      .rejects.toThrow('HTTP_404');
    expect(h.saved.at(-1)).toMatchObject({ cursor: 1, laws: 1 });
  });

  it('a stop keeps the cursor on the law it cut, so that law is read again', async () => {
    const ctrl = new AbortController();
    const h = harness({ 'LEY-1-2000.md': law('LEY-1-2000'), 'LEY-2-2000.md': law('LEY-2-2000') });
    let n = 0;
    const ingest = vi.fn(async () => { if (++n === 3) ctrl.abort(); });
    const end = await runPack({ fetchText: h.fetchText, port: { ingest }, vault: 'V', save: h.save, signal: ctrl.signal, now: at }, PATHS, newPack('co', 'ley', 3, at()));
    expect(end.cursor).toBe(1);
    expect(h.saved.at(-1)!.cursor).toBe(1);
  });

  it('counts an article whose chronicle the vault refused, apart from the laws done', async () => {
    const h = harness({ 'LEY-1-2000.md': law('LEY-1-2000') });
    let n = 0;
    const ingest = vi.fn(async () => { if (++n === 2) throw new Error('VAULT_FULL'); });
    const end = await runPack({ fetchText: h.fetchText, port: { ingest }, vault: 'V', save: h.save, now: at }, PATHS.slice(0, 1), newPack('co', 'ley', 1, at()));
    expect(end).toMatchObject({ cursor: 1, laws: 0, inVault: 1, vaultFailed: 1 });
  });
});

describe('withRetry', () => {
  it('waits and tries again on a rate limit, then succeeds', async () => {
    const wait = vi.fn(async (_ms: number) => {});
    const f = vi.fn().mockRejectedValueOnce(new Error('HTTP_429')).mockRejectedValueOnce(new Error('HTTP_503')).mockResolvedValue('ok');
    await expect(withRetry(f, wait)('u')).resolves.toBe('ok');
    expect(wait.mock.calls.map((c) => c[0])).toEqual([2000, 4000]);
  });

  it('gives up after five tries, and never retries a missing file', async () => {
    const wait = vi.fn(async () => {});
    await expect(withRetry(vi.fn().mockRejectedValue(new Error('HTTP_429')), wait)('u')).rejects.toThrow('HTTP_429');
    expect(wait).toHaveBeenCalledTimes(5);
    const missing = vi.fn().mockRejectedValue(new Error('HTTP_404'));
    await expect(withRetry(missing, wait)('u')).rejects.toThrow('HTTP_404');
    expect(missing).toHaveBeenCalledTimes(1);
  });
});

describe('packs in the library', () => {
  it('survive a restart, and an unreadable pack is dropped rather than invented', () => {
    const lib = withPack(EMPTY_LIBRARY, { ...newPack('co', 'ley', 10, at()), cursor: 4 });
    const back = parseLibrary({ state: { library: { ...lib, packs: [...lib.packs, { key: 'x', cursor: -1 }] } } });
    expect(back.packs).toHaveLength(1);
    expect(back.packs[0]).toMatchObject({ key: 'pack|co|ley', cursor: 4, total: 10 });
    expect(parsePack({ ...lib.packs[0], cursor: Number.NaN })).toBeNull();
  });

  it('a long title is cut at a word', () => {
    const long = 'Por la cual se crea el Ministerio del Medio Ambiente, se reordena el Sector Público encargado de la gestión';
    const s = shortTitle(long, 'X');
    expect(s.length).toBeLessThanOrEqual(101);
    expect(s.endsWith('…')).toBe(true);
    expect(long.startsWith(s.slice(0, -1))).toBe(true);
    expect(shortTitle(null, 'LEY-1-2000')).toBe('LEY-1-2000');
  });
});

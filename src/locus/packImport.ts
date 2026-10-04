/**
 * packImport — "load everything" for a Legalize country, one rank at a time
 * (doc 134 §16.6). Tony 2026-10-03: a big corpus is the person's choice.
 *
 * Measured before building: Colombia holds 63 788 laws in force (583 MB);
 * raw.githubusercontent.com served 500 of them in 57 s with 500 × HTTP 200,
 * so the download is not what costs. Writing to memory is: Austin's 2 533
 * articles took 4 minutes, so a whole country runs for hours. Hence:
 *  - one library entry per pack, never one per law: the durable state is
 *    capped at 256 KB (doc 73) and 63 788 entries would be ~19 MB;
 *  - a cursor saved as the import goes, so a stop, a closed window or a
 *    restart resumes at the next law instead of starting over;
 *  - no folder copy: the local search cannot hold 583 MB in the window, the
 *    laws of a pack are searched from the chat;
 *  - a law the live file refuses (repealed since the list was built, published
 *    as enacted, empty) is COUNTED and skipped, never a stop.
 */
import { articleChronicles, articleRef } from './articleText';
import { readLegalizeLaw, referenceOf, type FetchText } from './legalizeReader';
import type { LocusPlace } from './locusReader';
import type { HostPort } from './library';

/** One pack as remembered between sessions. */
export interface PackEntry {
  /** `pack|<cc>|<rank>`. */
  key: string;
  country: string;
  rank: string;
  /** Laws in the pack's list. */
  total: number;
  /** Index of the next law to read: the resume point. */
  cursor: number;
  /** Laws whose every article reached the vault. */
  laws: number;
  /** Laws the live file refused (not in force, as enacted, no article), counted. */
  refused: number;
  /** Articles that reached the vault, and those that did not. */
  inVault: number;
  vaultFailed: number;
  startedAt: string;
  updatedAt: string;
}

export function packKey(country: string, rank: string): string {
  return `pack|${country}|${rank}`;
}

export function newPack(country: string, rank: string, total: number, now: Date): PackEntry {
  const at = now.toISOString();
  return { key: packKey(country, rank), country, rank, total, cursor: 0, laws: 0, refused: 0, inVault: 0, vaultFailed: 0, startedAt: at, updatedAt: at };
}

/** True when nothing is left to read. */
export function packDone(p: Pick<PackEntry, 'cursor' | 'total'>): boolean {
  return p.cursor >= p.total;
}

/** Reads a pack entry back; anything else is refused, not guessed. */
export function parsePack(v: unknown): PackEntry | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  const nums = ['total', 'cursor', 'laws', 'refused', 'inVault', 'vaultFailed'] as const;
  const strs = ['key', 'country', 'rank', 'startedAt', 'updatedAt'] as const;
  if (!nums.every((k) => typeof p[k] === 'number' && Number.isFinite(p[k]) && (p[k] as number) >= 0)) return null;
  if (!strs.every((k) => typeof p[k] === 'string' && p[k])) return null;
  return p as unknown as PackEntry;
}

/** Display title of a law found only in a pack: its title, cut at a word near 100 characters. */
export function shortTitle(title: string | null, fallback: string): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return fallback;
  if (t.length <= 100) return t;
  const cut = t.slice(0, 100);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))}…`;
}

const RETRY_STATUSES = /^(HTTP_(429|5\d\d)|TypeError|Failed to fetch|NetworkError|network)/i;
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000];

/** Waits, or rejects at once when the signal fires. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A fetch that waits and tries again on a rate limit, a server error or a
 * network blip (5 tries, 2 s to 32 s). Any other failure is thrown at once.
 */
export function withRetry(fetchText: FetchText, wait = sleep): FetchText {
  return async (url, signal) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchText(url, signal);
      } catch (err) {
        const msg = err instanceof Error ? `${err.name === 'TypeError' ? 'TypeError ' : ''}${err.message}` : String(err);
        if (signal?.aborted || attempt >= BACKOFF_MS.length || !RETRY_STATUSES.test(msg)) throw err;
        console.warn('[mnemo-law] pack fetch failed, retrying', url, msg);
        await wait(BACKOFF_MS[attempt]!, signal);
      }
    }
  };
}

/**
 * Imports the laws of a pack from its cursor until the end or a stop. Calls
 * `save` with the new entry every `saveEvery` laws and at the end, so the
 * resume point is never far behind. A fetch that still fails after its
 * retries ends the run with the cursor ON that law (it is read again next time).
 */
export async function runPack(
  deps: {
    fetchText: FetchText;
    port: Pick<HostPort, 'ingest'>;
    vault: string;
    save: (entry: PackEntry) => Promise<void>;
    signal?: AbortSignal;
    onLaw?: (entry: PackEntry) => void;
    now?: () => Date;
    saveEvery?: number;
  },
  paths: readonly string[],
  start: PackEntry,
): Promise<PackEntry> {
  const now = deps.now ?? (() => new Date());
  const saveEvery = deps.saveEvery ?? 10;
  let entry = { ...start, total: paths.length };
  let sinceSave = 0;
  try {
    while (entry.cursor < paths.length) {
      if (deps.signal?.aborted) break;
      const path = paths[entry.cursor]!;
      const id = path.split('/').pop()!.replace(/\.md$/, '');
      let refused = false;
      let inVault = 0;
      let failed = 0;
      try {
        const res = await readLegalizeLaw(deps.fetchText, { state: entry.country, folder: path }, { signal: deps.signal });
        const ref = referenceOf(res.meta.identifier ?? id, res.meta.title);
        const unit: LocusPlace = {
          key: `legalize|${entry.country}|${res.meta.identifier ?? id}`,
          type: 'code',
          state: entry.country,
          name: res.meta.identifier ?? id,
          rows: null,
          label: shortTitle(res.meta.title, id),
          ...(ref ? { reference: ref } : {}),
          ...(res.meta.lastUpdated ? { snapshot: res.meta.lastUpdated } : {}),
        };
        for (let i = 0; i < res.articles.length; i++) {
          const bodies = articleChronicles(unit, res.articles[i]!);
          let whole = true;
          for (let p = 0; p < bodies.length; p++) {
            if (deps.signal?.aborted) { whole = false; break; }
            try {
              await deps.port.ingest({
                vault: deps.vault,
                content: bodies[p]!,
                sourceRef: bodies.length > 1 ? articleRef(unit, i, p + 1) : articleRef(unit, i),
              });
            } catch (err) {
              whole = false;
              console.error('[mnemo-law] pack chronicle refused', path, i, p, err);
            }
          }
          if (deps.signal?.aborted) break;
          if (whole) inVault++; else failed++;
        }
      } catch (err) {
        if (deps.signal?.aborted) break;
        const msg = err instanceof Error ? err.message : String(err);
        // The live file refused the law: counted, and the pack goes on.
        if (!msg.startsWith('LEGALIZE_')) throw err;
        refused = true;
      }
      // A law cut by a stop is read again next time: the cursor does not move.
      if (deps.signal?.aborted) break;
      entry = {
        ...entry,
        cursor: entry.cursor + 1,
        laws: entry.laws + (refused || failed > 0 ? 0 : 1),
        refused: entry.refused + (refused ? 1 : 0),
        inVault: entry.inVault + inVault,
        vaultFailed: entry.vaultFailed + failed,
        updatedAt: now().toISOString(),
      };
      deps.onLaw?.(entry);
      if (++sinceSave >= saveEvery) { sinceSave = 0; await deps.save(entry); }
    }
  } finally {
    await deps.save(entry);
  }
  return entry;
}

/**
 * legiReader — French national codes from LEGI, the second source (doc 134 lot 3).
 *
 * LEGI is the consolidated base of French laws, codes and decrees, published
 * by the State (DINUM, from DILA's Légifrance data) on Hugging Face as
 * `AgentPublic/legi`, under Licence Ouverte 2.0 — which ALLOWS commercial use,
 * unlike LOCUS. Read 2026-10-03:
 *  - dated snapshots `data/legi-YYYYMMDD/`, one folder per code inside
 *    (`legi_code_civil`, `legi_code_de_la_route`…);
 *  - 39 GB in all, almost entirely the `embeddings_bge-m3` column. Reading the
 *    text columns only, the whole Code civil is 1.7 MB in 6 s;
 *  - the file holds OLD versions too: of 6 402 chunks of the Code civil,
 *    2 898 are `VIGUEUR` (in force), the rest MODIFIE / ABROGE / TRANSFERE…
 *    Article 1240 appears as its 1804-2016 text AND its current one. Only
 *    `VIGUEUR` is kept: an old version cited as the law is the worst answer;
 *  - a long article is several chunks with DIFFERENT `text` (its parts): they
 *    are joined in `chunk_index` order.
 *
 * The listing uses the Hugging Face tree API (CORS open to the iframe), the
 * files the same byte-range reads as LOCUS. Everything is injected for tests.
 */
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import type { AsyncBuffer } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import type { LocusArticle, LocusPlace, ReadProgress } from './locusReader';

import { LEGI_REPO, LEGI_REPO_URL } from './locusSource';

/** Columns read: never `embeddings_bge-m3`, which is most of the bytes. */
const LEGI_COLUMNS = ['doc_id', 'chunk_index', 'status', 'title', 'number', 'start_date', 'text'];

export type FetchJson = (url: string, signal?: AbortSignal) => Promise<unknown>;
export type FileOpener = (url: string, signal?: AbortSignal) => Promise<AsyncBuffer>;

interface TreeEntry { type?: string; path?: string; size?: number }

function entries(raw: unknown): TreeEntry[] {
  return Array.isArray(raw) ? raw.filter((e): e is TreeEntry => !!e && typeof e === 'object') : [];
}

/** `20260912` from `data/legi-20260912`, or null for anything else (`legi-latest`). */
export function snapshotDate(path: string): string | null {
  const m = path.match(/legi-(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Display name from a folder: `legi_code_de_l_urbanisme` → "Code de l'urbanisme".
 * Accents are absent from folder names and are NOT invented here; the real
 * title (`Code de l'énergie`) replaces this one once the code is read.
 */
export function codeLabelFromFolder(folder: string): string {
  const words = folder.replace(/^legi_/, '').split('_');
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if ((w === 'l' || w === 'd') && i + 1 < words.length) { out.push(`${w}'${words[++i]}`); continue; }
    out.push(w);
  }
  const s = out.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The newest dated snapshot folder and the codes in it. */
export async function listLegiCodes(fetchJson: FetchJson, signal?: AbortSignal): Promise<{ snapshot: string; codes: LocusPlace[] }> {
  const top = entries(await fetchJson(`https://huggingface.co/api/datasets/${LEGI_REPO}/tree/main/data`, signal));
  const dated = top.map((e) => e.path ?? '').filter((p) => snapshotDate(p) !== null).sort();
  const latest = dated.at(-1);
  if (!latest) throw new Error('LEGI_NO_SNAPSHOT');
  const inside = entries(await fetchJson(`https://huggingface.co/api/datasets/${LEGI_REPO}/tree/main/${latest}`, signal));
  const codes = inside
    .map((e) => (e.path ?? '').split('/').pop() ?? '')
    .filter((name) => name.startsWith('legi_code_'))
    .sort()
    .map((folder): LocusPlace => ({
      key: `legi|${folder}`,
      type: 'code',
      state: 'fr',
      name: folder.replace(/^legi_/, ''),
      rows: null,
      label: codeLabelFromFolder(folder),
      folder: `${latest}/${folder}`,
      snapshot: snapshotDate(latest)!,
    }));
  return { snapshot: snapshotDate(latest)!, codes };
}

interface Chunk { doc_id?: unknown; chunk_index?: unknown; status?: unknown; title?: unknown; number?: unknown; start_date?: unknown; text?: unknown }

/** Keeps the articles in force, joins each article's parts in order. */
export function articlesInForce(chunks: readonly Chunk[]): { articles: LocusArticle[]; title: string | null; skipped: number } {
  const byDoc = new Map<string, Chunk[]>();
  let skipped = 0;
  let title: string | null = null;
  for (const c of chunks) {
    if (typeof c.title === 'string' && !title) title = c.title;
    if (c.status !== 'VIGUEUR' || typeof c.doc_id !== 'string') { skipped++; continue; }
    const list = byDoc.get(c.doc_id) ?? [];
    list.push(c);
    byDoc.set(c.doc_id, list);
  }
  const articles: LocusArticle[] = [];
  for (const parts of byDoc.values()) {
    parts.sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index));
    const content = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('\n').trim();
    if (!content) { skipped += parts.length; continue; }
    const first = parts[0]!;
    const number = typeof first.number === 'string' && first.number ? first.number : '?';
    const since = typeof first.start_date === 'string' ? first.start_date : null;
    articles.push({
      header: `Article ${number}`,
      content,
      isSubstantive: true,
      topic: null,
      function: null,
      ...(since ? { inForceSince: since } : {}),
    });
  }
  // Article order as a reader expects it: 1, 2, 10, L111-1… natural sort on the number.
  articles.sort((a, b) => a.header.localeCompare(b.header, 'fr', { numeric: true }));
  return { articles, title, skipped };
}

/** Reads one code: every parquet file of its folder, text columns only. */
export async function readLegiCode(
  fetchJson: FetchJson,
  open: FileOpener,
  code: Pick<LocusPlace, 'folder'>,
  opts: { signal?: AbortSignal; onProgress?: (p: ReadProgress) => void } = {},
): Promise<{ articles: LocusArticle[]; title: string | null; skipped: number; bytes: number }> {
  if (!code.folder) throw new Error('LEGI_NO_FOLDER');
  const files = entries(await fetchJson(`https://huggingface.co/api/datasets/${LEGI_REPO}/tree/main/data/${code.folder.replace(/^data\//, '')}`, opts.signal))
    .map((e) => e.path ?? '')
    .filter((p) => p.endsWith('.parquet'))
    .sort();
  if (files.length === 0) throw new Error('LEGI_EMPTY_CODE');
  let bytes = 0;
  const chunks: Chunk[] = [];
  for (let i = 0; i < files.length; i++) {
    opts.signal?.throwIfAborted();
    const raw = await open(`${LEGI_REPO_URL}/resolve/main/${files[i]}`, opts.signal);
    const file: AsyncBuffer = {
      byteLength: raw.byteLength,
      slice: async (s, e) => {
        const b = await raw.slice(s, e);
        bytes += b.byteLength;
        opts.onProgress?.({ bytes, shard: i, shards: files.length });
        return b;
      },
    };
    const metadata = await parquetMetadataAsync(file);
    chunks.push(...(await parquetReadObjects({ file, metadata, columns: LEGI_COLUMNS, compressors })) as Chunk[]);
  }
  return { ...articlesInForce(chunks), bytes };
}

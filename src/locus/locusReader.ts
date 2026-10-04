/**
 * locusReader — read LOCUS from Hugging Face by byte range (doc 134 §3.2, §9).
 *
 * The cartridge never downloads the 1.77 GB. Each shard is opened as a remote
 * file: its footer gives the row groups and their min/max of `state`/`city`,
 * the place columns are read first, then only the rows of the chosen place.
 * Measured 2026-10-03: 35 to 51 MB and 12 to 19 s per city, 4.2 MB and 32 s
 * for the whole place list.
 *
 * 🪤 The Hugging Face `datasets-server/filter` endpoint looked simpler and
 * failed for five minutes the day it was measured (index "corrupted, being
 * rebuilt"). A cartridge must not depend on an index nobody here controls.
 *
 * The shard opener is injected so the logic is testable without the network;
 * `openRemoteShard` is the production opener.
 */
import { asyncBufferFromUrl, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';
import type { AsyncBuffer, FileMetaData } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { LOCUS_SHARD_COUNT, PLACE_COLUMNS, shardUrl } from './locusSource';

/** One place of the corpus, as LOCUS spells it (no rule: `kingcove`, `fort_collins`). */
export interface LocusPlace {
  /** Stable key `<type>|<state>|<name>` (LOCUS) or `legi|<folder>` (LEGI), the chronicle sourceRef prefix. */
  key: string;
  /** A US city or county (LOCUS), or a French national code (LEGI, doc 134 lot 3). */
  type: 'cities' | 'counties' | 'code';
  /** US state code, or `fr` for a French code. */
  state: string;
  /** `city` / `county` exactly as in LOCUS, or the code folder name without `legi_`. */
  name: string;
  /** Rows the corpus holds for this unit; null when unknown before reading (LEGI lists folders, not rows). */
  rows: number | null;
  /** Display name when the source gives one (a French code); LOCUS names are built by `placeLabel`. */
  label?: string;
  /** LEGI: the snapshot folder of the code, `data/legi-YYYYMMDD/legi_code_…`. */
  folder?: string;
  /** LEGI: the snapshot date, ISO. Legalize: the date of the latest reform included. */
  snapshot?: string;
  /** Legalize: the law's official reference, `Ley 599 de 2000`. */
  reference?: string;
}

/** One ordinance row, the columns the cartridge keeps. Scores are dropped (§2.2). */
export interface LocusArticle {
  header: string;
  content: string;
  isSubstantive: boolean;
  topic: string | null;
  function: string | null;
  /** LEGI: the date the article's current version took effect, ISO. */
  inForceSince?: string;
}

export interface ReadProgress {
  /** Bytes actually received so far: the honest measure of a range read. */
  bytes: number;
  shard: number;
  shards: number;
}

export type ShardOpener = (index: number, signal?: AbortSignal) => Promise<AsyncBuffer>;

/** Per-request deadline (rule 9). A range of one row group is ~40 MB. */
const REQUEST_TIMEOUT_MS = 90_000;

/** A remote file whose every range request carries the caller's signal and a deadline. */
export function openRemoteUrl(url: string, signal?: AbortSignal): Promise<AsyncBuffer> {
  const fetchWithDeadline: typeof fetch = (input, init) => {
    const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    return fetch(input, { ...init, signal: combined });
  };
  return asyncBufferFromUrl({ url, fetch: fetchWithDeadline });
}

/** Production opener for the LOCUS shards. */
export const openRemoteShard: ShardOpener = (index, signal) => openRemoteUrl(shardUrl(index), signal);

/** JSON from an HTTPS endpoint (the Hugging Face tree API), with the same deadline. A non-2xx is an error, never an empty list. */
export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

/** Text from an HTTPS file (a Legalize law on raw.githubusercontent.com), with the same deadline. */
export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.text();
}

/** Bytes from an HTTPS file (Normattiva's zip of the codes), with the same deadline. */
export async function fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A JSON POST (Normattiva's article-by-URN route), with the same deadline. */
export async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

/** Wraps a buffer so every slice adds its size to the running byte count. */
function counting(file: AsyncBuffer, onBytes: (n: number) => void): AsyncBuffer {
  return {
    byteLength: file.byteLength,
    slice: async (start, end) => {
      const buf = await file.slice(start, end);
      onBytes(buf.byteLength);
      return buf;
    },
  };
}

interface RowGroupSpan {
  rowStart: number;
  rowEnd: number;
  stateMin: string | null;
  stateMax: string | null;
}

/** Row ranges of a shard with their `state` statistics. Absent stats = null = "might contain anything". */
export function rowGroupSpans(md: FileMetaData): RowGroupSpan[] {
  const stateIdx = md.schema.slice(1).findIndex((s) => s.name === 'state');
  const spans: RowGroupSpan[] = [];
  let start = 0;
  for (const rg of md.row_groups) {
    const rows = Number(rg.num_rows);
    const stats = stateIdx >= 0 ? rg.columns[stateIdx]?.meta_data?.statistics : undefined;
    const min = stats?.min_value;
    const max = stats?.max_value;
    spans.push({
      rowStart: start,
      rowEnd: start + rows,
      stateMin: typeof min === 'string' ? min : null,
      stateMax: typeof max === 'string' ? max : null,
    });
    start += rows;
  }
  return spans;
}

/** True when a row group MAY hold this state. Unknown statistics never skip a group. */
export function spanMayHoldState(span: RowGroupSpan, state: string): boolean {
  if (span.stateMin === null || span.stateMax === null) return true;
  return span.stateMin <= state && state <= span.stateMax;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Builds the place key the same way for the index and for a row. */
export function placeKeyOf(type: string, state: string, name: string): string {
  return `${type}|${state}|${name}`;
}

function rowPlace(r: Record<string, unknown>): { type: 'cities' | 'counties'; state: string; name: string } | null {
  const state = asString(r.state);
  const type = r.source_jurisdiction_type === 'counties' ? 'counties' : r.source_jurisdiction_type === 'cities' ? 'cities' : null;
  if (!state || !type) return null;
  const name = type === 'cities' ? asString(r.city) : asString(r.county);
  return name ? { type, state, name } : null;
}

/**
 * Reads the place columns of every shard and counts rows per place.
 * A row with no readable place is COUNTED apart, never assigned to a guess.
 */
export async function readPlaceIndex(
  open: ShardOpener,
  opts: { signal?: AbortSignal; onProgress?: (p: ReadProgress) => void } = {},
): Promise<{ places: LocusPlace[]; unplaced: number; bytes: number }> {
  const counts = new Map<string, LocusPlace>();
  let unplaced = 0;
  let bytes = 0;
  for (let i = 0; i < LOCUS_SHARD_COUNT; i++) {
    opts.signal?.throwIfAborted();
    const file = counting(await open(i, opts.signal), (n) => {
      bytes += n;
      opts.onProgress?.({ bytes, shard: i, shards: LOCUS_SHARD_COUNT });
    });
    const metadata = await parquetMetadataAsync(file);
    const rows = await parquetReadObjects({ file, metadata, columns: [...PLACE_COLUMNS], compressors });
    for (const r of rows) {
      const p = rowPlace(r);
      if (!p) { unplaced++; continue; }
      const key = placeKeyOf(p.type, p.state, p.name);
      const seen = counts.get(key);
      if (seen) seen.rows = (seen.rows ?? 0) + 1;
      else counts.set(key, { key, ...p, rows: 1 });
    }
  }
  const places = [...counts.values()].sort((a, b) =>
    a.state.localeCompare(b.state) || a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  return { places, unplaced, bytes };
}

/**
 * Reads every row of ONE place. Only the row groups whose `state` range holds
 * the place are touched; inside them the place columns are read first and the
 * full rows only over the span where the place sits.
 */
export async function readPlaceArticles(
  open: ShardOpener,
  place: Pick<LocusPlace, 'type' | 'state' | 'name'>,
  opts: { signal?: AbortSignal; onProgress?: (p: ReadProgress) => void } = {},
): Promise<{ articles: LocusArticle[]; bytes: number }> {
  const articles: LocusArticle[] = [];
  let bytes = 0;
  const wanted = placeKeyOf(place.type, place.state, place.name);
  for (let i = 0; i < LOCUS_SHARD_COUNT; i++) {
    opts.signal?.throwIfAborted();
    const file = counting(await open(i, opts.signal), (n) => {
      bytes += n;
      opts.onProgress?.({ bytes, shard: i, shards: LOCUS_SHARD_COUNT });
    });
    const metadata = await parquetMetadataAsync(file);
    for (const span of rowGroupSpans(metadata)) {
      if (!spanMayHoldState(span, place.state)) continue;
      opts.signal?.throwIfAborted();
      const keys = await parquetReadObjects({
        file, metadata, columns: [...PLACE_COLUMNS], rowStart: span.rowStart, rowEnd: span.rowEnd, compressors,
      });
      let first = -1;
      let last = -1;
      keys.forEach((k, j) => {
        const p = rowPlace(k);
        if (p && placeKeyOf(p.type, p.state, p.name) === wanted) {
          if (first < 0) first = j;
          last = j;
        }
      });
      if (first < 0) continue;
      const rows = await parquetReadObjects({
        file, metadata, rowStart: span.rowStart + first, rowEnd: span.rowStart + last + 1, compressors,
      });
      for (const r of rows) {
        const p = rowPlace(r);
        if (!p || placeKeyOf(p.type, p.state, p.name) !== wanted) continue;
        articles.push({
          header: asString(r.header) ?? '',
          content: typeof r.content === 'string' ? r.content : '',
          isSubstantive: r.is_substantive === true,
          topic: asString(r.topic),
          function: asString(r.function),
        });
      }
    }
  }
  return { articles, bytes };
}

/**
 * library — what the person imported, where it lives, and how it reaches memory.
 *
 * Two copies, two jobs (doc 134 §3.3, §10):
 *  - a JSON file per place in a folder the PERSON chose: the cartridge's own
 *    copy, read back for its free local search. It sits next to an
 *    ATTRIBUTION.md, because CC BY requires the attribution where the data lives.
 *  - one chronicle per substantive article in the cartridge's sandbox vault:
 *    what the chat will read once the person unlocks the vault (lot 2, doc 58).
 *
 * The small index (folder + imported places) rides in the cartridge's durable
 * state (doc 73), which survives the iframe's origin changing.
 *
 * The host is reached through a port so the logic is testable without a bridge.
 */
import {
  LEGI_ATTRIBUTION, LEGI_LICENSE, LEGI_LICENSE_URL, LEGI_REPO_URL,
  LEGALIZE_SOURCES, LOCUS_ATTRIBUTION, LOCUS_LICENSE_URL, LOCUS_PUBLISHED, LOCUS_REPO_URL, LOCUS_VERSION,
  JUSTICE_CANADA_SOURCE, NORMATTIVA_SOURCE, justiceCanadaAttribution, legalizeAttribution, normattivaAttribution,
} from './locusSource';
import type { LocusArticle, LocusPlace } from './locusReader';
import { parsePack, type PackEntry } from './packImport';
import { articleChronicles, articleRef, placeLabel } from './articleText';

/** One imported place, as remembered between sessions. */
export interface ImportedPlace {
  key: string;
  type: LocusPlace['type'];
  state: string;
  name: string;
  /** Rows the corpus holds for the unit (substantive or not, every version for LEGI). */
  corpusRows: number | null;
  /** Display name a source gave (a French code's real title). */
  label?: string;
  /** LEGI snapshot date, ISO; Legalize: date of the latest reform included. */
  snapshot?: string;
  /** Legalize: the official reference, `Ley 599 de 2000`. */
  reference?: string;
  /** Substantive articles kept and written to the file. */
  kept: number;
  /** Non-substantive rows (tables of contents, empty definitions) left out, COUNTED. */
  skipped: number;
  /** Articles the vault accepted. Below `kept` = the import stopped or some writes failed. */
  inVault: number;
  /** Articles the vault refused (one part or more), counted apart from a stop. */
  vaultFailed: number;
  /** Articles too long for one chronicle, written as several parts (doc 134 §10.3). */
  split: number;
  file: string;
  importedAt: string;
  corpus: string;
}

export interface LibraryState {
  folder: string | null;
  places: ImportedPlace[];
  /** The person ticked "I read the licence" — asked once, before the first download. */
  licenseAccepted: boolean;
  /** Countries this person already asked for (doc 134 lot 5), so the screen says so instead of sending twice. */
  requested: RequestedCountry[];
  /** "Load everything" packs started, with their resume point (doc 134 §16.6). */
  packs: PackEntry[];
}

export interface RequestedCountry {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** When the request left (or was queued), ISO. */
  at: string;
}

export const EMPTY_LIBRARY: LibraryState = { folder: null, places: [], licenseAccepted: false, requested: [], packs: [] };

/** Replaces a pack already in the library, or adds it. */
export function withPack(lib: LibraryState, entry: PackEntry): LibraryState {
  return { ...lib, packs: [...lib.packs.filter((p) => p.key !== entry.key), entry] };
}

/** Records a request, replacing an earlier one for the same country. */
export function withRequest(lib: LibraryState, code: string, at: string): LibraryState {
  return { ...lib, requested: [...lib.requested.filter((r) => r.code !== code), { code, at }] };
}

/** Reads a stored library defensively: anything unreadable is dropped, never invented. */
export function parseLibrary(raw: unknown): LibraryState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // 🪤 `state.get` answers `{ state: { library }, updatedAt }` (host
  // cartridgeState.ts), not `{ library }`. The first version read `library` at
  // the root, found nothing, and every restart forgot the licence, the folder
  // and the imported places (field report 2026-10-03: "the conditions come back
  // at every reboot"). The bare shape is still accepted for the tests' sake.
  const holder = (r.state && typeof r.state === 'object' ? r.state : r) as Record<string, unknown>;
  const lib = (holder.library && typeof holder.library === 'object' ? holder.library : {}) as Record<string, unknown>;
  const places = Array.isArray(lib.places) ? lib.places.filter((p): p is ImportedPlace =>
    !!p && typeof p === 'object'
    && typeof (p as ImportedPlace).key === 'string'
    && typeof (p as ImportedPlace).file === 'string'
    && typeof (p as ImportedPlace).kept === 'number') : [];
  return {
    folder: typeof lib.folder === 'string' && lib.folder ? lib.folder : null,
    places,
    licenseAccepted: lib.licenseAccepted === true,
    requested: Array.isArray(lib.requested)
      ? lib.requested.filter((r): r is RequestedCountry => !!r && typeof r === 'object'
        && typeof (r as RequestedCountry).code === 'string' && /^[A-Z]{2}$/.test((r as RequestedCountry).code)
        && typeof (r as RequestedCountry).at === 'string')
      : [],
    packs: Array.isArray(lib.packs) ? lib.packs.map(parsePack).filter((p): p is PackEntry => p !== null) : [],
  };
}

/** File name of a place's copy: readable, and unique per type/state/name. */
export function placeFileName(place: Pick<LocusPlace, 'type' | 'state' | 'name'>): string {
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return `${safe(place.state)}-${safe(place.name)}${place.type === 'counties' ? '-county' : ''}.json`;
}

/**
 * The sub-folder a unit is filed in, inside the one folder the person picked
 * (Tony, 2026-10-04: "choisir un endroit une fois pour toutes, et après tout
 * est bien classé"): one per country, and one per state for US ordinances.
 * English names, so the tree does not change when the app's language does.
 */
export function countryFolder(place: Pick<LocusPlace, 'type' | 'state'>): string {
  if (place.type !== 'code') return joinPath('United States', place.state.toUpperCase());
  if (place.state === 'int') return 'International';
  const iso = place.state === 'uk' ? 'GB' : (place.state || 'fr').toUpperCase();
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(iso) ?? iso;
  } catch (err) {
    console.warn('[mnemo-law] region names unavailable:', err);
    return iso;
  }
}

export function joinPath(folder: string, file: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return folder.replace(/[\\/]+$/, '') + sep + file;
}

export const ATTRIBUTION_FILE = 'ATTRIBUTION.md';

export function attributionText(): string {
  return [
    '# Laws in this folder',
    '',
    'These files were downloaded by MnemoLaw from two sources.',
    '',
    `## United States local ordinances: ${LOCUS_VERSION} (${LOCUS_REPO_URL})`,
    '',
    `- Attribution: ${LOCUS_ATTRIBUTION}`,
    `- Licence: ${LOCUS_LICENSE_URL} (non-commercial use only)`,
    `- Corpus published: ${LOCUS_PUBLISHED}. A law may have changed since; check the text in force with the city or county.`,
    '',
    `## French national codes: LEGI (${LEGI_REPO_URL})`,
    '',
    `- Attribution: ${LEGI_ATTRIBUTION}`,
    `- Licence: ${LEGI_LICENSE} (${LEGI_LICENSE_URL})`,
    '- Only the articles in force at the snapshot date are kept. Check the text in force on legifrance.gouv.fr.',
    '',
    ...Object.entries(LEGALIZE_SOURCES).flatMap(([cc, src]) => [
      `## National laws (${cc.toUpperCase()}): Legalize (https://github.com/legalize-dev/legalize-${cc})`,
      '',
      `- Attribution: ${legalizeAttribution(cc)}`,
      `- Not an official text. Check the text in force on ${src.checkAt}.`,
      '',
    ]),
    '## Italian codes and constitution: Normattiva (https://www.normattiva.it)',
    '',
    `- Attribution: ${normattivaAttribution()}`,
    `- Not an official text. Check the text in force on ${NORMATTIVA_SOURCE.checkAt}.`,
    '',
    '## Canada, federal Acts: Justice Canada (https://github.com/justicecanada/laws-lois-xml)',
    '',
    `- Attribution: ${justiceCanadaAttribution()}`,
    `- Not an official text. Check the text in force on ${JUSTICE_CANADA_SOURCE.checkAt}.`,
    '',
    'MnemoLaw does not give legal advice.',
    '',
  ].join('\n');
}

/** The corpus name and attribution of a unit, by source. */
export function corpusOf(place: Pick<LocusPlace, 'type' | 'snapshot' | 'state'> & { key?: string }): { corpus: string; attribution: string } {
  if (place.key?.startsWith('justice|')) {
    return { corpus: `justice-canada${place.snapshot ? `-${place.snapshot}` : ''}`, attribution: justiceCanadaAttribution() };
  }
  if (place.key?.startsWith('normattiva|')) {
    return { corpus: `normattiva${place.snapshot ? `-${place.snapshot}` : ''}`, attribution: normattivaAttribution() };
  }
  if (place.key?.startsWith('legalize|')) {
    return { corpus: `legalize-${place.state}${place.snapshot ? `-${place.snapshot}` : ''}`, attribution: legalizeAttribution(place.state) };
  }
  return place.type === 'code'
    ? { corpus: `LEGI${place.snapshot ? `-${place.snapshot}` : ''}`, attribution: LEGI_ATTRIBUTION }
    : { corpus: LOCUS_VERSION, attribution: LOCUS_ATTRIBUTION };
}

/** What the place file holds: the kept articles and where they came from. */
export interface PlaceFile {
  corpus: string;
  attribution: string;
  place: Pick<LocusPlace, 'key' | 'type' | 'state' | 'name'> & Partial<Pick<LocusPlace, 'label' | 'snapshot' | 'reference'>>;
  articles: LocusArticle[];
}

/** Splits the place's rows: substantive ones are kept, the others are counted. */
export function splitArticles(rows: readonly LocusArticle[]): { kept: LocusArticle[]; skipped: number } {
  const kept = rows.filter((r) => r.isSubstantive && r.content.trim().length > 0);
  return { kept, skipped: rows.length - kept.length };
}

/** The host operations the import needs. */
export interface HostPort {
  writeFile(path: string, content: string): Promise<{ success: boolean; error?: string }>;
  /** Creates a folder and its parents; the host's file write does not. */
  mkdir?(path: string): Promise<{ success: boolean; error?: string }>;
  ingest(entry: { vault: string; content: string; sourceRef: string }): Promise<void>;
}

export const SPINE = 'LAW_ARTICLE';

/**
 * Writes the place file and the attribution, then the chronicles one by one.
 * A failed file write stops everything (the search would have nothing to
 * read). A refused chronicle is counted and the import goes on. A stop keeps
 * what was written and reports how far it got.
 */
export async function importPlace(
  port: HostPort,
  args: {
    folder: string;
    vault: string;
    place: LocusPlace;
    rows: readonly LocusArticle[];
    /** Rows the SOURCE already left out before this step (LEGI: versions not in force). Counted with the rest. */
    skippedBefore?: number;
    signal?: AbortSignal;
    onIngest?: (done: number, total: number) => void;
    now?: () => Date;
  },
): Promise<ImportedPlace> {
  const split0 = splitArticles(args.rows);
  const kept = split0.kept;
  const skipped = split0.skipped + (args.skippedBefore ?? 0);
  const dir = joinPath(args.folder, countryFolder(args.place));
  if (port.mkdir) {
    const made = await port.mkdir(dir);
    if (!made.success) throw new Error(`WRITE_FAILED: ${made.error ?? 'unknown'}`);
  }
  const file = joinPath(port.mkdir ? dir : args.folder, placeFileName(args.place));
  const source = corpusOf(args.place);
  const body: PlaceFile = {
    ...source,
    place: {
      key: args.place.key, type: args.place.type, state: args.place.state, name: args.place.name,
      ...(args.place.label ? { label: args.place.label } : {}),
      ...(args.place.snapshot ? { snapshot: args.place.snapshot } : {}),
      ...(args.place.reference ? { reference: args.place.reference } : {}),
    },
    articles: kept,
  };
  const wrote = await port.writeFile(file, JSON.stringify(body));
  if (!wrote.success) throw new Error(`WRITE_FAILED: ${wrote.error ?? 'unknown'}`);
  const attr = await port.writeFile(joinPath(args.folder, ATTRIBUTION_FILE), attributionText());
  if (!attr.success) throw new Error(`WRITE_FAILED: ${attr.error ?? 'unknown'}`);

  let inVault = 0;
  let vaultFailed = 0;
  let split = 0;
  for (let i = 0; i < kept.length; i++) {
    if (args.signal?.aborted) break;
    const bodies = articleChronicles(args.place, kept[i]!);
    if (bodies.length > 1) split++;
    // An article counts as "in the vault" only when EVERY part landed: a law
    // missing its second half would be cited as if it were whole.
    let whole = true;
    for (let p = 0; p < bodies.length; p++) {
      if (args.signal?.aborted) { whole = false; break; }
      try {
        await port.ingest({
          vault: args.vault,
          content: bodies[p]!,
          sourceRef: bodies.length > 1 ? articleRef(args.place, i, p + 1) : articleRef(args.place, i),
        });
      } catch (err) {
        whole = false;
        console.error('[mnemo-law] chronicle refused', placeLabel(args.place), i, p, err);
      }
    }
    if (whole) inVault++;
    else if (!args.signal?.aborted) vaultFailed++;
    args.onIngest?.(i + 1, kept.length);
  }
  return {
    key: args.place.key,
    type: args.place.type,
    state: args.place.state,
    name: args.place.name,
    corpusRows: args.place.rows ?? args.rows.length + (args.skippedBefore ?? 0),
    ...(args.place.label ? { label: args.place.label } : {}),
    ...(args.place.snapshot ? { snapshot: args.place.snapshot } : {}),
    ...(args.place.reference ? { reference: args.place.reference } : {}),
    kept: kept.length,
    skipped,
    inVault,
    vaultFailed,
    split,
    file,
    importedAt: (args.now ?? (() => new Date()))().toISOString(),
    corpus: source.corpus,
  };
}

/** Replaces a place already in the library, or adds it. */
export function withPlace(lib: LibraryState, entry: ImportedPlace): LibraryState {
  return { ...lib, places: [...lib.places.filter((p) => p.key !== entry.key), entry] };
}

/** Reads a place file back. Anything that is not a place file is refused, not guessed. */
export function parsePlaceFile(text: string): PlaceFile | null {
  try {
    const v = JSON.parse(text) as Partial<PlaceFile>;
    if (!v || !Array.isArray(v.articles) || !v.place || typeof v.place.key !== 'string') return null;
    return v as PlaceFile;
  } catch (err) {
    console.error('[mnemo-law] place file unreadable', err);
    return null;
  }
}

/**
 * legalizeCatalogue — the laws offered for a Legalize country, from the list
 * `scripts/build-catalogue.ts` wrote (doc 134 §16.3).
 *
 * The list is a MENU built on a given commit of the repository: the cartridge
 * re-reads the live front matter at import (`readLegalizeLaw`), which refuses
 * a law no longer in force. Nothing here is law text.
 */
import ar from '../catalogue/ar.json';
import co from '../catalogue/co.json';
import es from '../catalogue/es.json';
import pt from '../catalogue/pt.json';
import type { LocusPlace } from './locusReader';

interface CatalogueEntry {
  /** Absent in a long list: `<cc>/<identifier>.md`. */
  path?: string;
  identifier: string;
  label: string;
  reference: string | null;
  lastUpdated: string | null;
  bytes?: number;
}

/** One "load everything" pack: every law in force of one rank. */
export interface PackSummary { rank: string; files: number; bytes: number }

interface Catalogue {
  country: string;
  commit: string;
  commitDate: string;
  entries: CatalogueEntry[];
  packs?: PackSummary[];
}

const CATALOGUES: Record<string, Catalogue> = { co: co as Catalogue, es: es as Catalogue, ar: ar as Catalogue, pt: pt as Catalogue };

/**
 * Lists too long to ship in the window, read when the person opens the
 * country (the UK lists its 2 386 Acts in force: 520 KB).
 */
const LAZY: Record<string, () => Promise<{ default: unknown }>> = {
  uk: () => import('../catalogue/uk.json'),
  eu: () => import('../catalogue/eu.json'),
};

/** True when a country's list is read on opening it. */
export function isLazyCatalogue(country: string): boolean {
  return country in LAZY || country === 'int';
}

/** Reads a lazy list once, then serves it like a shipped one. */
export async function loadLegalizeLaws(country: string): Promise<LocusPlace[]> {
  if (country === 'int' && !CATALOGUES.int) {
    // Built by scripts/build-treaties.ts, shipped in public/data/.
    const res = await fetch('data/treaties/index.json');
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const idx = (await res.json()) as { builtOn: string; entries: CatalogueEntry[] };
    CATALOGUES.int = { country: 'int', commit: '', commitDate: idx.builtOn, entries: idx.entries };
  }
  if (!CATALOGUES[country]) {
    const load = LAZY[country];
    if (!load) throw new Error('CATALOGUE_UNKNOWN_COUNTRY');
    CATALOGUES[country] = (await load()).default as Catalogue;
  }
  return legalizeLaws(country);
}

/** The Legalize countries this build ships a list for, read now or on opening. */
export const LEGALIZE_COUNTRIES = [...Object.keys(CATALOGUES), 'uk', 'eu', 'int'];

/** Key prefix of a Legalize unit: `legalize|<cc>|<identifier>`. */
export const LEGALIZE_KEY = 'legalize|';

export function isLegalizeKey(key: string): boolean {
  return key.startsWith(LEGALIZE_KEY);
}

/** The laws offered for a country, as units the import understands; empty for a country without a list. */
export function legalizeLaws(country: string): LocusPlace[] {
  const cat = CATALOGUES[country];
  if (!cat) return [];
  return cat.entries.map((e): LocusPlace => ({
    key: `${LEGALIZE_KEY}${country}|${e.identifier}`,
    type: 'code',
    state: country,
    name: e.identifier,
    rows: null,
    label: e.label,
    folder: e.path ?? `${country}/${e.identifier}.md`,
    ...(e.reference ? { reference: e.reference } : {}),
    ...(e.lastUpdated ? { snapshot: e.lastUpdated } : {}),
  }));
}

/**
 * Fewest texts for a rank to be offered as a pack. Colombia has ranks of one
 * file (its constitution, one instruction), already in the list or not worth
 * a button.
 */
const MIN_PACK_FILES = 20;

/** The packs of a country, largest first; empty when the list has none. */
export function packSummaries(country: string): PackSummary[] {
  return (CATALOGUES[country]?.packs ?? []).filter((p) => p.files >= MIN_PACK_FILES);
}

/**
 * The paths of one pack, read only when the person starts it: Colombia's
 * 63 788 paths are ~1.6 MB and stay out of the window until then.
 */
export async function loadPackPaths(country: string, rank: string): Promise<string[]> {
  const loaders: Record<string, () => Promise<{ default: { packs: Record<string, string[]> } }>> = {
    co: () => import('../catalogue/co.packs.json') as Promise<{ default: { packs: Record<string, string[]> } }>,
    es: () => import('../catalogue/es.packs.json') as Promise<{ default: { packs: Record<string, string[]> } }>,
    ar: () => import('../catalogue/ar.packs.json') as Promise<{ default: { packs: Record<string, string[]> } }>,
    pt: () => import('../catalogue/pt.packs.json') as Promise<{ default: { packs: Record<string, string[]> } }>,
    eu: () => import('../catalogue/eu.packs.json') as Promise<{ default: { packs: Record<string, string[]> } }>,
    uk: () => import('../catalogue/uk.packs.json') as Promise<{ default: { packs: Record<string, string[]> } }>,
  };
  const load = loaders[country];
  if (!load) throw new Error('PACK_UNKNOWN_COUNTRY');
  const paths = (await load()).default.packs[rank];
  if (!paths) throw new Error('PACK_UNKNOWN_RANK');
  return paths;
}

/** When the list of a country was read from its repository, ISO date. */
export function catalogueDate(country: string): string | null {
  return CATALOGUES[country]?.commitDate.slice(0, 10) ?? null;
}

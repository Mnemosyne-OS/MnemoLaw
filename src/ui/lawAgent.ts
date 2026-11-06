/**
 * lawAgent.ts — what an agent may do in MnemoLaw (doc 149), as plain functions over the app's
 * own state and its own moves. Declared in `mnemo-plugin.json` › agentActions, served by
 * `LawAgentActions` while the window is open.
 *
 * 🚨 Every move is the one the person's own control makes: a country opens through `go` (a home
 * tile), its list through `loadPlaces` (« Load the list »), a city, county or law through
 * `runImport` (its « Add to memory »), and Stop is the job line's Stop. The country is shown
 * first, so the person sees the download and the ingest line.
 *
 * ⛔ The US licence (LOCUS, CC BY-NC-4.0) is accepted by the person, once, on screen: an agent is
 * refused until they have. « Load everything » for a whole country is not offered.
 *
 * Refusals throw `CODE: reason`. A law found is quoted, never legal advice.
 */
import { filterPlaces } from '../locus/placeFilter';
import { findNamed, listed, type Named } from './agentFind';
import { placeLabel } from '../locus/articleText';
import type { LocusPlace } from '../locus/locusReader';
import type { LibraryState } from '../locus/library';
import { COUNTRIES, countryOf, type Country, type Job, type VaultState, type View } from './types';

/** How long a call waits for a list before it answers « still running » (the host gives 60 s). */
export const AGENT_WAIT_MS = 45_000;
/** How many places one search answers at most: what the manifest declares as `limit`'s maximum (the screen shows 60). */
export const FIND_MAX = 60;
const FIND_DEFAULT = 20;

/** The app's state and its own moves, read fresh at every call. */
export interface LawAgentContext {
  view: View;
  vault: VaultState;
  lib: LibraryState;
  libLoaded: boolean;
  placesBy: Partial<Record<Country, LocusPlace[]>>;
  placesError: string | null;
  job: Job | null;
  notice: string[];
  go: (next: View) => void;
  loadPlaces: (country: Country) => Promise<void>;
  runImport: (place: LocusPlace) => Promise<void>;
  stop: () => void;
  /** The Footer's « open the folder » move: the host opens a path in the OS file manager. */
  openInOS: (path: string) => Promise<{ success?: boolean; error?: string } | undefined>;
}

/** How long opening the folder may take before it is said as failed (rule 9). */
export const OPEN_TIMEOUT_MS = 15_000;
/** How many near names a refusal of a spoken name lists (the orb's repair call picks from them). */
const LIST_LIMIT = 12;

/**
 * The one city, county or law of a loaded list that `ref` names: its key, or its words as a
 * person says them (« Austin », « code civil », « C-46 »). Several matches are refused with
 * their names, never the first one taken.
 */
export function resolvePlace(list: readonly LocusPlace[], ref: string, country: Country): LocusPlace {
  const kind = country === 'us' ? { code: 'NO_PLACE', noun: 'city or county', plural: 'cities and counties' } : { code: 'NO_LAW', noun: 'law' };
  const entries: Array<Named<LocusPlace>> = list.map((p) => ({
    item: p,
    id: p.key,
    names: [placeLabel(p), p.name.replace(/_/g, ' '), ...(p.reference ? [p.reference] : [])],
    label: p.reference ? `${placeLabel(p)} (${p.reference})` : placeLabel(p),
  }));
  try {
    return findNamed(entries, ref, kind);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith(`${kind.code}:`)) throw err;
    // LOCUS spells names without a rule (`newyorkcity`, `kingcove`): the screen's own filter
    // compares compact forms, so it gets a second say before the refusal.
    const near = filterPlaces(list, ref, LIST_LIMIT + 1);
    if (near.length === 1) return near[0]!;
    if (near.length > 1) throw new Error(`AMBIGUOUS: "${ref.trim()}" names several ${kind.plural ?? `${kind.noun}s`}: ${listed(near.map((p) => placeLabel(p)))}; say which`);
    throw err;
  }
}

/** The promise's end if it comes within `ms`, else `running` (the work goes on and is shown on screen). */
export async function within<T>(p: Promise<T>, ms: number): Promise<{ done: true } | { done: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<{ done: false }>((resolve) => { timer = setTimeout(() => resolve({ done: false }), ms); });
  try {
    return await Promise.race([p.then(() => ({ done: true as const })), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A country of the app, or the refusal that lists them. */
export function readCountry(v: unknown): Country {
  if (typeof v !== 'string' || !(COUNTRIES as readonly string[]).includes(v)) throw new Error(`NOT_FOUND: no country "${String(v)}"; countries: ${COUNTRIES.join(', ')}`);
  return v as Country;
}

/** A job, as an agent reads it. */
export function jobLine(job: Job | null) {
  if (!job) return null;
  const seconds = Math.max(0, Math.round((Date.now() - job.startedAt) / 1000));
  switch (job.kind) {
    case 'places': return { kind: 'reading the list', bytes: job.bytes, seconds };
    case 'download': return { kind: 'downloading', place: placeLabel(job.place), bytes: job.bytes, seconds };
    case 'ingest': return { kind: 'putting in memory', place: placeLabel(job.place), done: job.done, total: job.total, seconds };
    case 'pack': return { kind: 'loading everything', rank: job.rank, at: job.cursor, of: job.total, articles: job.articles, seconds };
  }
}

/** The handlers `sdk.onAgentActions` serves, over a context read fresh at every call. */
export function lawAgentHandlers(get: () => LawAgentContext) {
  /** The US licence: unknown until the library is read, then accepted or not by the person. */
  const licence = (c: LawAgentContext, country: Country) => {
    if (country !== 'us') return;
    if (!c.libLoaded) throw new Error('NOT_READY: the record of what is already in memory is still being read');
    if (!c.lib.licenseAccepted) throw new Error('LICENSE_NOT_ACCEPTED: US local laws (LOCUS, CC BY-NC-4.0, non-commercial use) need the person to accept the licence once, on the United States screen');
  };
  const show = (c: LawAgentContext, country: Country) => {
    if (c.view.kind !== 'country' || c.view.country !== country) c.go({ kind: 'country', country });
  };
  const placeLine = (c: LawAgentContext, p: LocusPlace) => ({
    key: p.key, name: placeLabel(p), kind: p.type === 'code' ? 'law' : p.type === 'cities' ? 'city' : 'county',
    ...(p.rows !== null ? { articles: p.rows } : {}),
    inMemory: c.lib.places.some((x) => x.key === p.key),
  });

  return {
    // agent-actions:begin
    status: () => {
      const c = get();
      return {
        screen: c.view.kind === 'country' ? { country: c.view.country } : c.view.kind,
        vault: c.vault.kind === 'error' ? `unavailable: ${c.vault.why}` : c.vault.kind,
        library: c.libLoaded ? 'read' : 'reading',
        usLicenceAccepted: c.libLoaded ? c.lib.licenseAccepted : null,
        job: jobLine(c.job),
        onScreen: c.notice,
        inMemory: c.lib.places.map((p) => ({ key: p.key, name: placeLabel(p), country: countryOf(p), kept: p.kept, inVault: p.inVault, importedAt: p.importedAt })),
      };
    },

    countries: () => {
      const c = get();
      return COUNTRIES.map((country) => ({
        country,
        listLoaded: !!c.placesBy[country],
        ...(c.placesBy[country] ? { entries: c.placesBy[country]!.length } : {}),
        inMemory: c.lib.places.filter((p) => countryOf(p) === country).length,
        ...(country === 'us' ? { needsLicence: 'LOCUS CC BY-NC-4.0, accepted by the person on screen' } : {}),
      }));
    },

    showHome: () => {
      const c = get();
      if (c.job) throw new Error('BUSY: a list or an import is running; stop it first or wait');
      if (c.view.kind !== 'home') c.go({ kind: 'home' });
      return { shown: 'home' };
    },

    showRequest: () => {
      const c = get();
      if (c.job) throw new Error('BUSY: a list or an import is running; stop it first or wait');
      if (c.view.kind !== 'request') c.go({ kind: 'request' });
      return { shown: 'request', note: 'The screen to ask for another country is shown; the person picks the country and sends it.' };
    },

    openCountry: (args: Record<string, unknown>) => {
      const country = readCountry(args.country);
      const c = get();
      if (c.job) throw new Error('BUSY: a list or an import is running; stop it first or wait');
      c.go({ kind: 'country', country });
      return { shown: country };
    },

    loadPlaces: async (args: Record<string, unknown>) => {
      const country = readCountry(args.country);
      const c = get();
      licence(c, country);
      const prior = c.placesBy[country];
      if (prior) { show(c, country); return { country, alreadyLoaded: true, entries: prior.length }; }
      if (c.job) throw new Error('BUSY: a list or an import is running; call status, or stop');
      show(c, country);
      const end = await within(c.loadPlaces(country), AGENT_WAIT_MS);
      if (!end.done) return { running: true, note: 'The list is still being read on screen; call status, then findPlaces.' };
      const after = get();
      if (after.placesError) throw new Error(`LIST_FAILED: ${after.placesError}`);
      const list = after.placesBy[country];
      if (!list) throw new Error('STOPPED: the list was stopped before it was read');
      return { country, entries: list.length };
    },

    findPlaces: (args: Record<string, unknown>) => {
      const country = readCountry(args.country);
      const c = get();
      const list = c.placesBy[country];
      if (!list) throw new Error(`NO_LIST: the list of ${country} is not loaded; call loadPlaces first`);
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) throw new Error('BAD_ARG: give query, part of a name (Austin, TX; code civil; C-46)');
      const limit = args.limit === undefined ? FIND_DEFAULT : args.limit;
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > FIND_MAX) throw new Error(`BAD_ARG: limit must be a whole number from 1 to ${FIND_MAX}`);
      const found = filterPlaces(list, query, limit);
      return { country, query, found: found.map((p) => placeLine(c, p)) };
    },

    importPlace: (args: Record<string, unknown>) => {
      const country = readCountry(args.country);
      const c = get();
      licence(c, country);
      const list = c.placesBy[country];
      if (!list) throw new Error(`NO_LIST: the list of ${country} is not loaded; call loadPlaces first`);
      const ref = typeof args.key === 'string' ? args.key.trim() : '';
      if (!ref) throw new Error('BAD_ARG: give key, the name of the city, county or law (Austin, TX; code civil) or its key');
      const place = resolvePlace(list, ref, country);
      if (c.vault.kind !== 'ready') throw new Error(`NO_VAULT: the cartridge's vault is ${c.vault.kind === 'error' ? `unavailable (${c.vault.why})` : 'not ready yet'}`);
      if (!c.libLoaded) throw new Error('NOT_READY: the record of what is already in memory is still being read');
      if (c.job) throw new Error('BUSY: a list or an import is running; call status, or stop');
      show(c, country);
      void c.runImport(place);
      return {
        started: true, key: place.key, name: placeLabel(place),
        note: 'It downloads and goes into memory on screen while MnemoLaw stays open; call status for progress and the outcome, stop to stop.',
      };
    },

    openFolder: async () => {
      const c = get();
      const folder = c.lib.folder;
      if (!folder) throw new Error('NO_FOLDER: nothing is in memory yet, so there is no folder of laws; put a law in memory first');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('WRITE_FAILED: the folder did not open within 15 s')), OPEN_TIMEOUT_MS); });
      try {
        const r = await Promise.race([c.openInOS(folder), late]);
        if (!r?.success) throw new Error(`WRITE_FAILED: the folder did not open (${r?.error ?? 'no answer'})`);
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        throw new Error(why.startsWith('WRITE_FAILED') ? why : `WRITE_FAILED: the folder did not open (${why})`);
      } finally {
        clearTimeout(timer);
      }
      return { opened: folder };
    },

    stop: () => {
      const c = get();
      if (!c.job) return { stopped: false, note: 'nothing is running' };
      c.stop();
      return { stopped: true, was: jobLine(c.job) };
    },
    // agent-actions:end
  };
}

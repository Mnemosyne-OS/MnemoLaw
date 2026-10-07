/**
 * MnemoLaw (doc 134): laws in memory, by country.
 *
 * Three screens (lot 5, 2026-10-03): the countries with a source, one country
 * (licence, list, import, search), and "ask for my country". The import logic
 * and the host calls live here; the screens only draw and call back.
 *
 * Order of consent stays: nothing downloads before a gesture, the US licence
 * is accepted once and remembered, and every long step shows what it measured
 * so far (bytes, seconds, chronicles), never an invented percentage.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MnemoCartridgeSDK } from './sdk/mnemo-sdk';
import { useI18n } from './i18n/useI18n';
import { translate } from './i18n/strings';
import { JUSTICE_CANADA_SOURCE, LEGALIZE_SOURCES, LEGI_LICENSE_URL, LOCUS_LICENSE_URL, NORMATTIVA_SOURCE } from './locus/locusSource';
import { isNormattivaKey, italyLaws } from './locus/italyCatalogue';
import { canadaLangOf, isJusticeKey, loadCanadaLaws } from './locus/canadaCatalogue';
import { readCanadaAct } from './locus/justiceCanadaReader';
import { CONSTITUTION_ID, readConstitution, readNormattivaCode } from './locus/normattivaReader';
import {
  fetchBytes, fetchJson, fetchText, openRemoteShard, postJson, openRemoteUrl, readPlaceArticles, readPlaceIndex, type LocusArticle, type LocusPlace,
} from './locus/locusReader';
import { isLazyCatalogue, isLegalizeKey, legalizeLaws, loadLegalizeLaws, loadPackPaths } from './locus/legalizeCatalogue';
import { newPack, runPack, withRetry } from './locus/packImport';
import { readLegalizeLaw } from './locus/legalizeReader';
import { listLegiCodes, readLegiCode } from './locus/legiReader';
import { placeLabel } from './locus/articleText';
import {
  EMPTY_LIBRARY, SPINE, importPlace, parseLibrary, withPack, withPlace, withRequest,
  type HostPort, type ImportedPlace, type LibraryState,
} from './locus/library';
import { useClock } from './locus/useClock';
import { S } from './ui/styles';
import { Home } from './ui/Home';
import { CountryView } from './ui/CountryView';
import { RequestCountry, type RequestOutcome } from './ui/RequestCountry';
import { Footer } from './ui/Footer';
import { packOf, countryPack } from './locus/packName';
import type { Country, Job, VaultState, View } from './ui/types';

// Must match "name" in mnemo-plugin.json: the host keys the sandbox vault on it.
const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/mnemo-law');

/** A chronicle write is a local IPC; 15 s is the house default (rule 9). */
const INGEST_TIMEOUT_MS = 15_000;

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  const { t, lang } = useI18n();
  const [view, setView] = useState<View>({ kind: 'home' });
  const [lib, setLib] = useState<LibraryState>(EMPTY_LIBRARY);
  const [libLoaded, setLibLoaded] = useState(false);
  const [vault, setVault] = useState<VaultState>({ kind: 'loading' });
  // A Legalize country's list ships with the cartridge (doc 134 §16.3): it is
  // there at once, no download, so its screen never shows a "load" button.
  const [placesBy, setPlacesBy] = useState<Partial<Record<Country, LocusPlace[]>>>(() => ({ co: legalizeLaws('co'), es: legalizeLaws('es'), ar: legalizeLaws('ar'), it: italyLaws(), pt: legalizeLaws('pt') }));
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  // The library as last saved, read by async steps that would otherwise
  // write back a copy taken before an await (two saves racing).
  const libRef = useRef(lib);
  libRef.current = lib;
  // Pack → vault name and folder, for this window's life (the host answers the same).
  const packVaults = useRef(new Map<string, { vault: string; folder: string | null }>());

  /**
   * The vault of one Memory Pack (host doc 135 §6.6): one per country, one per
   * US place, under the knowledge folder the person chose in the Hub. Words
   * only: laws are found by their words, and vectors would cost an embedding
   * per article for nothing (doc 134).
   */
  const packVault = useCallback(async (pack: string): Promise<{ vault: string; folder: string | null }> => {
    const known = packVaults.current.get(pack);
    if (known) return known;
    const res = await sdk.invoke<{ vault?: string; folder?: string }>('vault.pack.ensure', { pack, lexicalOnly: true });
    if (!res?.vault) throw new Error('ENSURE_PACK_FAILED');
    // `folder` = `<knowledge root>/<app>/`, next to the packs: the laws' files
    // go there and the person is never asked for a folder (Tony, 07/10).
    const found = { vault: res.vault, folder: typeof res.folder === 'string' && res.folder ? res.folder : null };
    packVaults.current.set(pack, found);
    return found;
  }, []);

  /** A failure, worded when it is one the person can act on. */
  const failureText = useCallback((err: unknown): string => {
    const why = errText(err);
    return why.includes('NO_KNOWLEDGE_ROOT') ? t('import.noKnowledgeRoot') : t('import.failed', { why });
  }, [t]);

  // ── Boot: durable library + the sandbox vault ─────────────────────────
  const bootVault = useCallback(() => {
    setVault({ kind: 'loading' });
    sdk.ensureSandbox()
      .then(({ vault: name, unlocked }) => {
        setVault({ kind: 'ready', vault: name, unlocked });
        return sdk.describeVaultTile({ icon: '⚖️', metrics: [{ label: translate(lang, 'lib.articles'), spine: SPINE }] });
      })
      .catch((err) => setVault({ kind: 'error', why: errText(err) }));
  }, [lang]);

  useEffect(() => {
    let alive = true;
    sdk.invoke('state.get')
      .then((raw) => { if (alive) setLib(parseLibrary(raw)); })
      .catch((err) => console.error('[mnemo-law] state.get failed', err))
      .finally(() => { if (alive) setLibLoaded(true); });
    bootVault();
    return () => { alive = false; };
  }, [bootVault]);

  const saveLib = useCallback(async (next: LibraryState) => {
    setLib(next);
    libRef.current = next;
    try {
      await sdk.invoke('state.set', { state: { library: next } });
    } catch (err) {
      console.error('[mnemo-law] state.set failed', err);
      setNotice((n) => [...n, translate(lang, 'import.failed', { why: errText(err) })]);
    }
  }, [lang]);

  // ── The clock of a running job: one tick a second, only while a job runs ─
  const now = useClock(job !== null);

  // Cancel any running read when the window goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const readFile = useCallback((path: string) => sdk.readFile(path), []);

  const openExternal = (url: string) => {
    sdk.invoke('shell.openExternal', { url })
      .catch((err) => setNotice([t('import.failed', { why: errText(err) })]));
  };

  // ── The list of one country ───────────────────────────────────────────
  const loadPlaces = async (country: Country) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPlacesError(null);
    const startedAt = Date.now();
    setJob({ kind: 'places', startedAt, bytes: 0 });
    try {
      if (country === 'fr') {
        const res = await listLegiCodes(fetchJson, ctrl.signal);
        setPlacesBy((m) => ({ ...m, fr: res.codes }));
      } else if (country === 'ca') {
        const laws = await loadCanadaLaws();
        setPlacesBy((m) => ({ ...m, ca: laws }));
      } else if (isLazyCatalogue(country)) {
        const laws = await loadLegalizeLaws(country);
        setPlacesBy((m) => ({ ...m, [country]: laws }));
      } else if (country !== 'us') {
        // Never fall back to the US index: it would list American cities under another flag.
        throw new Error('CATALOGUE_UNKNOWN_COUNTRY');
      } else {
        const res = await readPlaceIndex(openRemoteShard, {
          signal: ctrl.signal,
          onProgress: (p) => setJob({ kind: 'places', startedAt, bytes: p.bytes }),
        });
        setPlacesBy((m) => ({ ...m, us: res.places }));
      }
    } catch (err) {
      if (!ctrl.signal.aborted) setPlacesError(errText(err));
    } finally {
      setJob(null);
    }
  };

  // ── One unit (city, county or code), into the folder and the vault ────
  const runImport = async (initial: LocusPlace) => {
    if (vault.kind !== 'ready') return;
    setNotice([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let place = initial;
    let label = placeLabel(place);
    const startedAt = Date.now();
    setJob({ kind: 'download', startedAt, bytes: 0, place });
    try {
      // The pack first: a missing knowledge folder must be said before a
      // download, not after it.
      const { vault: target, folder } = await packVault(packOf(initial));
      // An older host answers no folder: said, never a guessed path.
      if (!folder) throw new Error('NO_PACK_FOLDER');
      const onProgress = (p: { bytes: number }) => setJob({ kind: 'download', startedAt, bytes: p.bytes, place });
      let articles: LocusArticle[];
      let skippedBefore = 0;
      if (isJusticeKey(place.key)) {
        // Justice Canada: one XML file per Act and language.
        const res = await readCanadaAct(fetchText, canadaLangOf(place), place.name, { signal: ctrl.signal });
        onProgress({ bytes: res.bytes });
        articles = res.articles;
        skippedBefore = res.repealed;
      } else if (isNormattivaKey(place.key)) {
        // Normattiva: the constitution article by article, a code from the
        // zip of the collection (fetched once per window).
        if (place.name === CONSTITUTION_ID) {
          const res = await readConstitution(postJson, { signal: ctrl.signal });
          articles = res.articles;
          skippedBefore = res.repealed;
        } else {
          const res = await readNormattivaCode(fetchBytes, place.name, { signal: ctrl.signal });
          onProgress({ bytes: res.bytes });
          articles = res.articles;
          skippedBefore = res.repealed;
          if (res.versionDate) place = { ...place, snapshot: res.versionDate };
        }
      } else if (isLegalizeKey(place.key)) {
        // Legalize: one file per law. The live front matter decides: a law no
        // longer in force is refused here, whatever the shipped list said.
        const res = await readLegalizeLaw(fetchText, place, { signal: ctrl.signal });
        onProgress({ bytes: res.bytes });
        articles = res.articles;
        if (res.meta.lastUpdated) place = { ...place, snapshot: res.meta.lastUpdated };
      } else if (place.type === 'code') {
        // LEGI: only the articles in force are kept; the code's real title
        // (with its accents) replaces the one built from the folder name.
        const res = await readLegiCode(fetchJson, openRemoteUrl, place, { signal: ctrl.signal, onProgress });
        articles = res.articles;
        skippedBefore = res.skipped;
        if (res.title) { place = { ...place, label: res.title }; label = res.title; }
      } else {
        articles = (await readPlaceArticles(openRemoteShard, place, { signal: ctrl.signal, onProgress })).articles;
      }
      const ingestStarted = Date.now();
      const port: HostPort = {
        writeFile: (path, content) => sdk.writeFile(path, content),
        // Read like `pickFolder` does: only an explicit `success: false` is a failure.
        mkdir: async (dirPath) => {
          const made = await sdk.invoke<{ success?: boolean; error?: string }>('dialog.mkdir', { dirPath });
          return { success: made?.success !== false, ...(made?.error ? { error: made.error } : {}) };
        },
        ingest: async (entry) => {
          await sdk.invoke('mnemosyne.ingest', { ...entry, spineType: SPINE }, INGEST_TIMEOUT_MS);
        },
      };
      const entry: ImportedPlace = await importPlace(port, {
        folder, vault: target, place, rows: articles, skippedBefore, signal: ctrl.signal,
        onIngest: (done, total) => setJob({ kind: 'ingest', startedAt: ingestStarted, place, done, total }),
      });
      await saveLib(withPlace({ ...libRef.current, folder }, entry));
      const lines = [t('import.done', { place: label, kept: entry.kept, skipped: entry.skipped })];
      if (entry.inVault < entry.kept) lines.push(t('import.partial', { place: label, inVault: entry.inVault, kept: entry.kept }));
      if (entry.split > 0) lines.push(t('import.split', { n: entry.split }));
      if (entry.vaultFailed > 0) lines.push(t('import.refused', { n: entry.vaultFailed }));
      if (ctrl.signal.aborted) lines.push(t('import.stopped'));
      setNotice(lines);
    } catch (err) {
      setNotice([ctrl.signal.aborted ? t('import.stopped') : failureText(err)]);
    } finally {
      setJob(null);
    }
  };

  // ── "Load everything" for one rank of a Legalize country (doc 134 §16.6) ─
  // Resumes at the saved cursor. Runs while this window is open: closing it
  // aborts, and the next press starts again at the next law.
  const runPackImport = async (country: Country, rank: string) => {
    if (vault.kind !== 'ready') return;
    setNotice([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    try {
      const { vault: target } = await packVault(countryPack(country));
      const paths = await loadPackPaths(country, rank);
      const prior = libRef.current.packs.find((p) => p.country === country && p.rank === rank);
      const start = prior ?? newPack(country, rank, paths.length, new Date());
      setJob({ kind: 'pack', startedAt, rank, cursor: start.cursor, startCursor: start.cursor, total: paths.length, articles: start.inVault });
      const end = await runPack({
        fetchText: withRetry(fetchText),
        port: { ingest: async (entry) => { await sdk.invoke('mnemosyne.ingest', { ...entry, spineType: SPINE }, INGEST_TIMEOUT_MS); } },
        vault: target,
        signal: ctrl.signal,
        save: (entry) => saveLib(withPack(libRef.current, entry)),
        onLaw: (entry) => setJob({ kind: 'pack', startedAt, rank, cursor: entry.cursor, startCursor: start.cursor, total: entry.total, articles: entry.inVault }),
      }, paths, start);
      setNotice([ctrl.signal.aborted
        ? t('pack.stopped', { cursor: end.cursor.toLocaleString(), total: end.total.toLocaleString() })
        : t('pack.finished', { laws: end.laws.toLocaleString(), articles: end.inVault.toLocaleString(), refused: end.refused.toLocaleString() })]);
    } catch (err) {
      setNotice([failureText(err)]);
    } finally {
      setJob(null);
    }
  };

  // ── "Add my country" (lot 5): the host writes the words, from the code ──
  const requestCountry = async (code: string): Promise<RequestOutcome> => {
    try {
      const data = await sdk.invoke<{ status?: string; retryAfterMs?: number } | undefined>('feedback.requestCountry', { country: code });
      const status = data?.status;
      if (status === 'sent' || status === 'queued') {
        await saveLib(withRequest(libRef.current, code, new Date().toISOString()));
        return { kind: status };
      }
      if (status === 'cooldown') {
        return { kind: 'cooldown', ...(typeof data?.retryAfterMs === 'number' ? { retryAfterMs: data.retryAfterMs } : {}) };
      }
      return { kind: 'error', why: 'UNKNOWN_ANSWER' };
    } catch (err) {
      return { kind: 'error', why: errText(err) };
    }
  };

  const go = (next: View) => { setNotice([]); setPlacesError(null); setView(next); };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.title}>⚖️ MnemoLaw</div>
        <div style={S.muted}>{t('app.subtitle')}</div>
      </header>

      {view.kind === 'home' && (
        <Home t={t} lang={lang} lib={lib} onOpen={(country) => go({ kind: 'country', country })} onRequest={() => go({ kind: 'request' })} />
      )}

      {view.kind === 'country' && (
        <CountryView
          t={t}
          lang={lang}
          country={view.country}
          lib={lib}
          libLoaded={libLoaded}
          vault={vault}
          places={placesBy[view.country] ?? null}
          placesError={placesError}
          job={job}
          now={now}
          notice={notice}
          onBack={() => go({ kind: 'home' })}
          onAcceptLicense={() => saveLib({ ...libRef.current, licenseAccepted: true })}
          onOpenLicense={() => openExternal(
            view.country === 'fr' ? LEGI_LICENSE_URL
              : view.country === 'us' ? LOCUS_LICENSE_URL
                : view.country === 'it' ? NORMATTIVA_SOURCE.licenceUrl
                  : view.country === 'ca' ? JUSTICE_CANADA_SOURCE.licenceUrl
                  : LEGALIZE_SOURCES[view.country]?.licenceUrl ?? LOCUS_LICENSE_URL,
          )}
          onLoadPlaces={() => loadPlaces(view.country)}
          onImport={runImport}
          onStop={() => abortRef.current?.abort()}
          onStartPack={(rank) => { void runPackImport(view.country, rank); }}
          readFile={readFile}
        />
      )}

      {view.kind === 'request' && (
        <>
          <button style={S.link} onClick={() => go({ kind: 'home' })}>{t('nav.back')}</button>
          <RequestCountry t={t} lang={lang} lib={lib} onSend={requestCountry} />
        </>
      )}

      <Footer
        t={t}
        vault={vault}
        folder={lib.folder}
        busy={!!job}
        onRetryVault={bootVault}
        onOpenFolder={() => {
          if (!lib.folder) return;
          sdk.openInOS(lib.folder).then((r) => { if (!r?.success) console.error('[mnemo-law] open folder refused', r?.error); })
            .catch((err) => console.error('[mnemo-law] open folder failed', err));
        }}
      />
    </div>
  );
}

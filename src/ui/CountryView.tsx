/**
 * CountryView — one country: its licence, the list to import from, the
 * running job, and what was already imported.
 *
 * The US licence (CC BY-NC) is accepted ONCE and remembered; the French one
 * (Licence Ouverte) is only shown, there is nothing to accept.
 */
import { useMemo, useState } from 'react';
import { S } from './styles';
import { FlagOf } from './Flags';
import { Library } from './Library';
import { countryLabel, isoCode } from '../countries';
import { countryOf, type Country, type Job, type T, type VaultState } from './types';
import type { LibraryState } from '../locus/library';
import type { LocusPlace } from '../locus/locusReader';
import { placeLabel } from '../locus/articleText';
import { catalogueDate, packSummaries } from '../locus/legalizeCatalogue';
import { ITALY_LIST_DATE } from '../locus/italyCatalogue';
import { canadaListDate } from '../locus/canadaCatalogue';
import { LEGALIZE_SOURCES } from '../locus/locusSource';
import { Packs } from './Packs';
import { filterPlaces } from '../locus/placeFilter';
import { featuredPlaces } from '../locus/featuredLaws';
import { formatDuration, remainingSeconds } from '../locus/eta';

const MB = (bytes: number) => (bytes / 1e6).toFixed(1);

export function CountryView(props: {
  t: T;
  lang: string;
  country: Country;
  lib: LibraryState;
  libLoaded: boolean;
  vault: VaultState;
  places: LocusPlace[] | null;
  placesError: string | null;
  job: Job | null;
  now: number;
  notice: string[];
  onBack: () => void;
  onAcceptLicense: () => void;
  onOpenLicense: () => void;
  onLoadPlaces: () => void;
  onImport: (place: LocusPlace) => void;
  onStop: () => void;
  onStartPack: (rank: string) => void;
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
}) {
  const { t, lang, country, lib, job, now } = props;
  const [filter, setFilter] = useState('');
  // Every country but the US lists national laws (codes), with a licence that is only shown.
  const fr = country !== 'us';
  const shown = useMemo(() => (props.places ? filterPlaces(props.places, filter, 60) : []), [props.places, filter]);
  const tiles = useMemo(() => (props.places ? featuredPlaces(props.places, country, lang) : []), [props.places, country, lang]);
  const imported = useMemo(() => new Set(lib.places.map((p) => p.key)), [lib.places]);
  const mine = lib.places.filter((p) => countryOf(p) === country);
  const seconds = job ? Math.max(0, Math.round((now - job.startedAt) / 1000)) : 0;
  const needsLicense = !fr && props.libLoaded && !lib.licenseAccepted;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button style={S.link} disabled={!!job} onClick={props.onBack}>{t('nav.back')}</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <FlagOf country={country} width={40} />
        <div>
          <div style={S.countryName}>{countryLabel(isoCode(country), lang)}</div>
          <div style={S.small}>{t(`home.kind.${country}` as const)}</div>
        </div>
      </div>

      {fr && (
        <section style={S.card}>
          <p style={S.small}>{t(country === 'fr' ? 'license.legi' : country === 'it' ? 'license.normattiva' : country === 'ca' ? 'license.justiceCanada' : 'license.legalize', { date: (country === 'it' ? ITALY_LIST_DATE : country === 'ca' ? canadaListDate() : catalogueDate(country)) ?? '—', official: LEGALIZE_SOURCES[country]?.official ?? '—' })}</p>
          <button style={S.link} onClick={props.onOpenLicense}>{t('license.read')}</button>
        </section>
      )}

      {needsLicense && (
        <section style={S.card}>
          <h2 style={S.h2}>{t('license.title')}</h2>
          <p style={S.p}>{t('license.body')}</p>
          <button style={S.link} onClick={props.onOpenLicense}>{t('license.read')}</button>
          <button style={S.button} onClick={props.onAcceptLicense}>{t('license.accept')}</button>
        </section>
      )}

      {job && (
        <section style={S.card} aria-live="polite">
          <div>
            {job.kind === 'places' && t('places.loading', { mb: MB(job.bytes), s: seconds })}
            {job.kind === 'download' && t('import.download', { place: placeLabel(job.place), mb: MB(job.bytes), s: seconds })}
            {job.kind === 'pack' && (() => {
              const left = remainingSeconds(job.cursor - job.startCursor, job.total - job.startCursor, (now - job.startedAt) / 1000);
              const line = t('pack.running', {
                cursor: job.cursor.toLocaleString(), total: job.total.toLocaleString(),
                articles: job.articles.toLocaleString(), elapsed: formatDuration(seconds),
              });
              return left === null ? line : `${line} · ${t('import.eta', { left: formatDuration(left) })}`;
            })()}
            {job.kind === 'ingest' && (() => {
              const left = remainingSeconds(job.done, job.total, (now - job.startedAt) / 1000);
              const line = t('import.vault', { done: job.done, total: job.total, elapsed: formatDuration(seconds) });
              return left === null ? line : `${line} · ${t('import.eta', { left: formatDuration(left) })}`;
            })()}
          </div>
          <button style={{ ...S.ghost, alignSelf: 'flex-start' }} onClick={props.onStop}>{t('import.stop')}</button>
        </section>
      )}

      {props.notice.length > 0 && <section style={S.card} role="status">{props.notice.map((n, i) => <div key={i}>{n}</div>)}</section>}

      {!needsLicense && (
        <section style={S.card}>
          {!props.places && (
            <>
              <button style={S.button} disabled={!!job} onClick={props.onLoadPlaces}>
                {t(country === 'us' ? 'places.load' : country === 'fr' ? 'places.loadCodes' : 'places.loadLaws')}
              </button>
              {props.placesError && <div style={S.error}>{t('places.failed', { why: props.placesError })}</div>}
            </>
          )}
          {props.places && (
            <>
              <div style={S.small}>{t(country === 'us' ? 'places.count' : country === 'fr' ? 'places.countCodes' : 'places.countLaws', { n: props.places.length.toLocaleString(lang) })}</div>
              <input
                style={S.input}
                value={filter}
                placeholder={t(country === 'us' ? 'places.filter' : country === 'fr' ? 'places.filterCodes' : 'places.filterLaws')}
                onChange={(e) => setFilter(e.target.value)}
              />
              {!filter.trim() && tiles.length > 0 && (
                <>
                  <div style={S.small}>{t('places.featured')}</div>
                  <div style={S.grid}>
                    {tiles.map((p) => (
                      <div key={p.key} style={S.lawTile}>
                        <span style={S.countryName}>{placeLabel(p)}</span>
                        {p.reference && <span style={S.small}>{p.reference}</span>}
                        <button style={{ ...S.ghost, alignSelf: 'flex-start' }} disabled={!!job || props.vault.kind !== 'ready'} onClick={() => props.onImport(p)}>
                          {imported.has(p.key) ? t('import.reimport') : t('country.import')}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {filter.trim() && shown.length === 0 && <div style={S.muted}>{t(fr ? 'places.noneCodes' : 'places.none', { q: filter.trim() })}</div>}
              <ul style={S.list}>
                {shown.map((p) => (
                  <li key={p.key} style={S.row}>
                    <span>
                      {placeLabel(p)}
                      {p.type === 'counties' && <span style={S.muted}> · {t('places.county')}</span>}
                      {p.rows !== null && <span style={S.muted}> · {t('places.rows', { n: p.rows.toLocaleString() })}</span>}
                      {p.reference && <span style={S.muted}> · {p.reference}</span>}
                    </span>
                    <button style={S.ghost} disabled={!!job || props.vault.kind !== 'ready'} onClick={() => props.onImport(p)}>
                      {imported.has(p.key) ? t('import.reimport') : t('country.import')}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {fr && country !== 'fr' && !needsLicense && (
        <Packs
          t={t}
          packs={packSummaries(country)}
          started={lib.packs.filter((p) => p.country === country)}
          job={job}
          disabled={!!job || props.vault.kind !== 'ready'}
          onStart={props.onStartPack}
        />
      )}

      <Library t={t} places={mine} readFile={props.readFile} />
      <p style={S.small}>{t('chat.hint')}</p>
    </>
  );
}

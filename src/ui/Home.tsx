/**
 * Home — the countries MnemoLaw has laws for, and a way to ask for yours.
 *
 * Only the countries with a source are shown (decided 2026-10-03: no greyed
 * "coming soon", which is a public promise). Each card says what kind of law
 * it holds and how much of it this person already imported.
 */
import { FlagOf } from './Flags';
import { S } from './styles';
import { countryLabel, isoCode } from '../countries';
import { COUNTRIES, countryOf, type Country, type T } from './types';
import type { LibraryState } from '../locus/library';

export function Home({ t, lang, lib, onOpen, onRequest }: {
  t: T;
  lang: string;
  lib: LibraryState;
  onOpen: (country: Country) => void;
  onRequest: () => void;
}) {
  const imported = (c: Country) => lib.places.filter((p) => countryOf(p) === c).length;
  const cards = COUNTRIES.map((country) => {
    const n = imported(country);
    const count = n === 0 ? t('home.nothingYet')
      : country === 'us' ? t('home.importedPlaces', { n }) : t('home.importedCodes', { n });
    return { country, code: isoCode(country), kind: t(`home.kind.${country}` as const), count };
  });
  const requested = lib.requested.map((r) => countryLabel(r.code, lang));

  return (
    <>
      <p style={S.p}>{t('home.lead')}</p>
      <div style={S.grid}>
        {cards.map((c) => (
          <button key={c.country} style={S.countryCard} onClick={() => onOpen(c.country)}>
            <FlagOf country={c.country} />
            <span style={S.countryName}>{countryLabel(c.code, lang)}</span>
            <span style={S.small}>{c.kind}</span>
            <span style={S.small}>{c.count}</span>
          </button>
        ))}
        <button style={S.addCard} onClick={onRequest}>
          <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">＋</span>
          <span style={S.countryName}>{t('home.add')}</span>
          <span style={S.small}>{t('home.addHint')}</span>
          {requested.length > 0 && <span style={S.small}>{t('home.requested', { list: requested.join(', ') })}</span>}
        </button>
      </div>
      <p style={S.small}>{t('chat.hint')}</p>
    </>
  );
}

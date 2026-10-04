/**
 * RequestCountry — ask the Mnemosyne OS team for a country (doc 134 lot 5).
 *
 * The person picks a country; the screen shows the EXACT message before it
 * leaves (the host writes it, from the code only: "[mnemo-law] country
 * request: DE (Germany)") and says it is signed by their wallet. After the
 * send it says what IS — sent, queued, or wait — never "your country will be
 * next". A country already asked shows its date instead of a second send.
 */
import { useMemo, useState } from 'react';
import { S } from './styles';
import { countryLabel, requestableCountries } from '../countries';
import type { T } from './types';
import type { LibraryState } from '../locus/library';
import { formatDuration } from '../locus/eta';

/** What the host answered for one request. */
export type RequestOutcome =
  | { kind: 'sent' } | { kind: 'queued' } | { kind: 'cooldown'; retryAfterMs?: number } | { kind: 'error'; why: string };

export function RequestCountry({ t, lang, lib, onSend }: {
  t: T;
  lang: string;
  lib: LibraryState;
  onSend: (code: string) => Promise<RequestOutcome>;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<{ code: string; result: RequestOutcome } | null>(null);
  const list = useMemo(() => requestableCountries(lang, query).slice(0, 80), [lang, query]);
  const already = (code: string) => lib.requested.find((r) => r.code === code) ?? null;
  const dateOf = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang);
  };

  const send = async () => {
    if (!picked) return;
    setSending(true);
    setOutcome(null);
    const result = await onSend(picked);
    setOutcome({ code: picked, result });
    setSending(false);
  };

  const outcomeLine = (o: { code: string; result: RequestOutcome }) => {
    const country = countryLabel(o.code, lang);
    switch (o.result.kind) {
      case 'sent': return t('request.sent', { country });
      case 'queued': return t('request.queued', { country });
      case 'cooldown': return o.result.retryAfterMs !== undefined
        ? t('request.cooldown', { when: formatDuration(o.result.retryAfterMs / 1000) })
        : t('request.cooldownSoon');
      case 'error': return t('request.failed', { why: o.result.why });
    }
  };

  return (
    <section style={S.card}>
      <h2 style={S.h2}>{t('request.title')}</h2>
      <p style={S.small}>{t('request.lead')}</p>
      <input style={S.input} value={query} placeholder={t('request.search')} onChange={(e) => { setQuery(e.target.value); setOutcome(null); }} />
      {query.trim() && list.length === 0 && <div style={S.muted}>{t('request.none', { q: query.trim() })}</div>}
      <ul style={{ ...S.list, maxHeight: 220, overflow: 'auto' }}>
        {list.map((c) => {
          const was = already(c.code);
          return (
            <li key={c.code} style={S.row}>
              <button
                style={picked === c.code ? S.button : S.ghost}
                onClick={() => { setPicked(c.code); setOutcome(null); }}
                aria-pressed={picked === c.code}
              >
                {c.name}
              </button>
              {was && <span style={S.small}>{t('request.already', { date: dateOf(was.at) })}</span>}
            </li>
          );
        })}
      </ul>

      {picked && (
        <>
          <div style={S.small}>{t('request.preview')}</div>
          {/* The same words the host composes (cartridgeCountryRequest.ts). */}
          <div style={S.preview}>{`[mnemo-law] country request: ${picked} (${countryLabel(picked, 'en')})`}</div>
          <div style={S.small}>{t('request.signed')}</div>
          {already(picked)
            ? <div style={S.small}>{t('request.already', { date: dateOf(already(picked)!.at) })}</div>
            : (
              <button style={S.button} disabled={sending} onClick={send}>
                {sending ? t('request.sending') : t('request.send')}
              </button>
            )}
        </>
      )}

      {outcome && <div role="status" style={outcome.result.kind === 'error' ? S.error : S.p}>{outcomeLine(outcome)}</div>}
    </section>
  );
}

/**
 * Library — what this person imported for ONE country, and the free local
 * search over one of those units (a city, a county or a code).
 *
 * Words only (lawSearch.ts): a question in everyday words belongs to the chat,
 * which the hint under the search box says.
 */
import { useEffect, useMemo, useState } from 'react';
import { S } from './styles';
import type { T } from './types';
import type { ImportedPlace } from '../locus/library';
import { parsePlaceFile } from '../locus/library';
import type { LocusArticle } from '../locus/locusReader';
import { cleanHeader, placeLabel } from '../locus/articleText';
import { buildIndex, search } from '../locus/lawSearch';
import { JUSTICE_CANADA_SOURCE, LEGALIZE_SOURCES, LOCUS_ATTRIBUTION, LOCUS_PUBLISHED, NORMATTIVA_SOURCE, justiceCanadaAttribution, legalizeAttribution, normattivaAttribution } from '../locus/locusSource';
import { isLegalizeKey } from '../locus/legalizeCatalogue';
import { isNormattivaKey } from '../locus/italyCatalogue';
import { isJusticeKey } from '../locus/canadaCatalogue';

export function Library({ t, places, readFile }: {
  t: T;
  places: ImportedPlace[];
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [articles, setArticles] = useState<LocusArticle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const open = places.find((p) => p.key === openKey) ?? null;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setArticles(null);
    setLoadError(null);
    readFile(open.file)
      .then((res) => {
        if (!alive) return;
        if (!res.success || typeof res.content !== 'string') { setLoadError(res.error ?? 'READ_FAILED'); return; }
        const parsed = parsePlaceFile(res.content);
        if (!parsed) { setLoadError('NOT_A_PLACE_FILE'); return; }
        setArticles(parsed.articles);
      })
      .catch((err) => { if (alive) setLoadError(err instanceof Error ? err.message : String(err)); });
    return () => { alive = false; };
  }, [open, readFile]);

  const index = useMemo(() => (articles ? buildIndex(articles.map((a) => `${a.header}\n${a.content}`)) : null), [articles]);
  const hits = useMemo(() => (index && query.trim() ? search(index, query, 50) : []), [index, query]);

  if (places.length === 0) return null;
  return (
    <section style={S.card}>
      <h2 style={S.h2}>{t('country.yours')}</h2>
      <ul style={S.list}>
        {places.map((p) => (
          <li key={p.key} style={S.row}>
            <button style={p.key === openKey ? S.button : S.ghost} onClick={() => { setOpenKey(p.key); setQuery(''); setExpanded(null); }}>
              {placeLabel(p)}{p.reference ? ` · ${p.reference}` : ''}
            </button>
            <span style={S.small}>
              {t('places.rows', { n: p.kept.toLocaleString() })}
              {p.inVault < p.kept && ` · ${t('lib.partial', { inVault: p.inVault, kept: p.kept })}`}
            </span>
          </li>
        ))}
      </ul>

      {open && !articles && !loadError && <div style={S.muted}>{t('search.loading', { place: placeLabel(open) })}</div>}
      {open && loadError && <div style={S.error}>{t('lib.fileMissing', { place: placeLabel(open), why: loadError })}</div>}
      {open && articles && (
        <>
          <input style={S.input} value={query} placeholder={t('search.placeholder')} onChange={(e) => setQuery(e.target.value)} />
          <div style={S.small}>{t('search.hint')}</div>
          {query.trim() && hits.length === 0 && <div style={S.muted}>{t('search.none', { place: placeLabel(open) })}</div>}
          {hits.length > 0 && <div style={S.small}>{t('search.results', { n: hits.length })}</div>}
          <ul style={S.list}>
            {hits.map((i) => {
              const a = articles[i]!;
              return (
                <li key={i} style={S.article}>
                  <button style={S.articleHead} onClick={() => setExpanded(expanded === i ? null : i)}>{cleanHeader(a.header)}</button>
                  {expanded === i && (
                    <>
                      <pre style={S.text}>{a.content}</pre>
                      <div style={S.small}>{isJusticeKey(open.key)
                        ? t('article.sourceLegalize', {
                          attr: justiceCanadaAttribution(),
                          date: open.snapshot ?? '—',
                          at: JUSTICE_CANADA_SOURCE.checkAt,
                        })
                        : isLegalizeKey(open.key) || isNormattivaKey(open.key)
                        ? t(open.snapshot ? 'article.sourceLegalize' : 'article.sourceLegalizeUndated', {
                          attr: isNormattivaKey(open.key) ? normattivaAttribution() : legalizeAttribution(open.state),
                          date: open.snapshot ?? '—',
                          at: isNormattivaKey(open.key) ? NORMATTIVA_SOURCE.checkAt : LEGALIZE_SOURCES[open.state]?.checkAt ?? '—',
                        })
                        : open.type === 'code'
                          ? t('article.sourceLegi', { since: a.inForceSince ?? '—', date: open.snapshot ?? '—' })
                          : t('article.source', { attr: LOCUS_ATTRIBUTION, date: LOCUS_PUBLISHED })}</div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

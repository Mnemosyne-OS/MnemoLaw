/**
 * Packs — "load everything" for a country, one kind of text at a time
 * (doc 134 §16.6). The person sees the count and the size BEFORE starting,
 * the measured time once it runs, and a resume point after any stop.
 *
 * No duration is promised before the run: it depends on this machine, so the
 * estimate appears only once the first laws are measured (eta.ts).
 */
import { S } from './styles';
import type { Job, T } from './types';
import type { PackSummary } from '../locus/legalizeCatalogue';
import { packDone, type PackEntry } from '../locus/packImport';

const MB = (bytes: number) => (bytes / 1e6).toFixed(0);

/**
 * Ranks whose plain spelling loses its accent or a word. The ranks are the
 * source's own names, in Spanish for every Legalize country shipped so far.
 */
const RANK_NAMES: Record<string, string> = {
  resolucion: 'Resolución',
  instruccion: 'Instrucción',
  ley_organica: 'Ley orgánica',
  acuerdo_internacional: 'Acuerdo internacional',
  decreto_necesidad_urgencia: 'Decreto de necesidad y urgencia',
};

/** `acto_legislativo` → `Acto legislativo`: the rank as the source names it. */
function rankLabel(rank: string): string {
  if (RANK_NAMES[rank]) return RANK_NAMES[rank];
  const s = rank.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Packs({ t, packs, started, job, disabled, onStart }: {
  t: T;
  packs: PackSummary[];
  started: PackEntry[];
  job: Job | null;
  disabled: boolean;
  onStart: (rank: string) => void;
}) {
  if (packs.length === 0) return null;
  return (
    <section style={S.card}>
      <h2 style={S.h2}>{t('pack.title')}</h2>
      <p style={S.small}>{t('pack.lead')}</p>
      <ul style={S.list}>
        {packs.map((p) => {
          const entry = started.find((e) => e.rank === p.rank);
          const running = job?.kind === 'pack' && job.rank === p.rank;
          const done = entry ? packDone(entry) : false;
          return (
            <li key={p.rank} style={S.row}>
              <span>
                {rankLabel(p.rank)}
                <span style={S.muted}> · {t('pack.size', { n: p.files.toLocaleString(), mb: MB(p.bytes) })}</span>
                {entry && (
                  <span style={S.muted}> · {t(done ? 'pack.done' : 'pack.progress', {
                    cursor: entry.cursor.toLocaleString(), total: entry.total.toLocaleString(),
                    articles: entry.inVault.toLocaleString(), refused: entry.refused.toLocaleString(),
                  })}</span>
                )}
              </span>
              {!done && (
                <button style={S.ghost} disabled={disabled || running} onClick={() => onStart(p.rank)}>
                  {entry && entry.cursor > 0 ? t('pack.resume') : t('pack.start')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

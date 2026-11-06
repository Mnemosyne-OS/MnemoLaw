/**
 * agentFind — a city, a county or a law named the way a person says it (doc 149 §19).
 *
 * The voice orb plans a spoken sentence in ONE model call and never reads the list first, so
 * « mets le code civil en mémoire » reaches `importPlace` with the words « code civil », never
 * a key. A key still works (other agents call `findPlaces` first).
 *
 * 🚨 Several matches are REFUSED with their names (AMBIGUOUS), never the first one taken: the
 *    refusal is what the orb's repair call reads to pick the right one. No match is refused
 *    with names that exist.
 *
 * Copied from Vitrine Studio's `agentFind.ts` (cartridges never import each other), with the
 * filler words of laws and places.
 */

/** Lower case, accents off, œ/æ spelled out. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

/**
 * Words that carry no name: articles and the words a sentence wraps a law or a place in.
 * 🪤 Matched BEFORE the accents come off: folded, « thé » is « the », so an accented word is
 *    listed as written.
 */
const FILLER = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'mon', 'ma', 'mes', 'ce', 'cette', 'ces', 'et', 'en', 'au', 'aux', 'à',
  'the', 'a', 'an', 'of', 'my', 'and', 'el', 'los', 'las', 'del', 'mi', 'y', 'il', 'lo', 'di', 'do', 'da', 'o', 'os', 'as',
  'loi', 'lois', 'law', 'laws', 'ley', 'leyes', 'lei', 'leis', 'legge',
  'ville', 'city', 'ciudad', 'cidade', 'comté', 'county', 'condado',
]);

/** The words of a name, folded, fillers out, a plural « s »/« x » off so « codes » finds « code ». */
export function nameWords(s: string): string[] {
  return s.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w))
    .map((w) => fold(w))
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w));
}

export interface Named<T> { item: T; id: string; names: string[]; label: string }

const LIST_MAX = 12;
/** Names said in a refusal, capped so a list of thousands of cities stays a sentence. */
export const listed = (labels: string[]) => {
  const unique = [...new Set(labels)];
  return unique.length > LIST_MAX ? `${unique.slice(0, LIST_MAX).join(', ')} (+${unique.length - LIST_MAX})` : unique.join(', ');
};

/**
 * The one item `ref` names: its id; else the item one of whose names is `ref` word for word;
 * else the item whose words hold every word of `ref`. `kind` names the error (NO_LAW,
 * NO_PLACE…) and the noun said; `plural` when the noun's plural is not a plain « s ».
 */
export function findNamed<T>(entries: ReadonlyArray<Named<T>>, ref: string, kind: { code: string; noun: string; plural?: string }): T {
  const raw = ref.trim();
  const plural = kind.plural ?? `${kind.noun}s`;
  if (!raw) throw new Error(`BAD_ARG: name the ${kind.noun}`);
  const byId = entries.find((e) => e.id === raw);
  if (byId) return byId.item;
  const asked = nameWords(raw);
  const all = entries.map((e) => e.label);
  if (!asked.length) throw new Error(`${kind.code}: "${raw}" names no ${kind.noun}; ${plural}: ${listed(all) || 'none'}`);
  // The whole name said as written wins over a partial match (« Code civil » against « Code civil local »).
  const whole = entries.filter((e) => e.names.some((n) => nameWords(n).join(' ') === asked.join(' ')));
  if (whole.length === 1) return whole[0]!.item;
  const hits = whole.length > 1 ? whole : entries.filter((e) => {
    const have = new Set(e.names.flatMap(nameWords));
    return asked.every((w) => have.has(w));
  });
  if (hits.length === 1) return hits[0]!.item;
  if (hits.length > 1) throw new Error(`AMBIGUOUS: "${raw}" names several ${plural}: ${listed(hits.map((e) => e.label))}; say which`);
  throw new Error(`${kind.code}: no ${kind.noun} named "${raw}"; ${plural}: ${listed(all) || 'none'}`);
}

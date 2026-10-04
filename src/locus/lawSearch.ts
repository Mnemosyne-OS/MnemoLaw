/**
 * lawSearch — the cartridge's own search over the articles it imported.
 *
 * Why a local search at all: a cartridge has NO free retrieval through the
 * bridge (`mnemosyne.query` is a billed inference, memory note
 * cartridge-memory-read-costs-an-inference). Browsing a city code must cost
 * nothing, so the cartridge ranks its own copy.
 *
 * Why lexical and not vectors: the cartridge has no embedder. Measured on
 * 20 Austin questions (doc 134 §10): this lexical ranking puts the right
 * article in the top 5 for 8 of 20, vectors for 13 of 20. So this screen is
 * for finding by WORDS (an article number, "decibel", "fence"); a question in
 * everyday words belongs to the chat, which reads the vectorized vault
 * (lot 2). The screen says so under the search box.
 *
 * Okapi BM25 with the core's constants (k1 1.5, b 0.75, smoothed IDF). The
 * tokenizer is a plain one: the core's is sealed and not importable from a
 * cartridge (doc 102 hit the same wall).
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'has', 'have',
  'i', 'if', 'in', 'is', 'it', 'its', 'my', 'of', 'on', 'or', 'so', 'that', 'the', 'their', 'there',
  'this', 'to', 'was', 'what', 'when', 'where', 'which', 'who', 'will', 'with', 'you', 'your',
]);

/** Lower-cased word tokens, accents folded, stopwords and 1-letter tokens dropped. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9§.-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface SearchIndex {
  size: number;
  df: Map<string, number>;
  tf: Map<string, number>[];
  len: number[];
  avgdl: number;
}

export function buildIndex(documents: readonly string[]): SearchIndex {
  const df = new Map<string, number>();
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  let total = 0;
  for (const doc of documents) {
    const tokens = tokenize(doc);
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(counts);
    len.push(tokens.length);
    total += tokens.length;
  }
  return { size: documents.length, df, tf, len, avgdl: total / Math.max(1, documents.length) };
}

/** Indices of matching documents, best first. A document sharing no query word is NOT returned. */
export function search(index: SearchIndex, query: string, limit = 50): number[] {
  const k1 = 1.5;
  const b = 0.75;
  const terms = new Set(tokenize(query));
  if (terms.size === 0 || index.size === 0) return [];
  const scores = new Float64Array(index.size);
  for (const term of terms) {
    const n = index.df.get(term);
    if (!n) continue;
    const idf = Math.log(1 + (index.size - n + 0.5) / (n + 0.5));
    for (let i = 0; i < index.size; i++) {
      const f = index.tf[i]!.get(term);
      if (!f) continue;
      scores[i]! += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (index.len[i]! / index.avgdl)));
    }
  }
  const ranked: number[] = [];
  for (let i = 0; i < index.size; i++) if (scores[i]! > 0) ranked.push(i);
  ranked.sort((x, y) => scores[y]! - scores[x]! || x - y);
  return ranked.slice(0, limit);
}

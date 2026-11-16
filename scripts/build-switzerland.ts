/**
 * build-switzerland — the list of Swiss federal laws MnemoLaw offers (doc 134
 * §16.17), read from Fedlex's own SPARQL endpoint. Run by a developer:
 *
 *   npx tsx scripts/build-switzerland.ts
 *
 * Legalize's `legalize-ch` was measured first and refused: its texts stop
 * mid-code (Civil Code at art. 27, Criminal Code at art. 64) and date from
 * 2019-2020. Fedlex serves every consolidated law in French, German and
 * Italian, with CORS `*`, so the cartridge reads the text live at import;
 * this list is only the menu (§16.3): which laws, their titles, their SR
 * number and their ELI. Order matters: the first entries are the tiles.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPARQL = 'https://fedlex.data.admin.ch/sparqlendpoint';

/** SR numbers, most asked first: the constitution, the codes, then daily life. */
const SR = [
  '101', '210', '220', '311.0', '221.213.11', '822.11', '741.01', '235.1', '142.20', '141.0',
  '832.10', '281.1', '272', '312.0', '642.11', '641.20', '831.10', '831.40', '837.0', '832.20',
  '142.31', '151.1', '241', '221.229.1', '231.1', '251', '935.51', '955.0', '952.0', '812.121',
  '514.54', '700', '814.01', '784.10', '173.110', '172.021', '211.231', '151.3', '221.214.1',
];

export interface SwissEntry { sr: string; eli: string; lang: 'fr' | 'de' | 'it'; label: string; short: string | null }

const LANG = { FRA: 'fr', DEU: 'de', ITA: 'it' } as const;

async function main(): Promise<void> {
  const values = SR.map((s) => `"${s}"`).join(' ');
  const query = `PREFIX jolux: <http://data.legilux.public.lu/resource/ontology/jolux#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?cc ?sr ?lang ?title ?short WHERE {
  VALUES ?srv { ${values} }
  ?cc a jolux:ConsolidationAbstract ;
      jolux:inForceStatus <https://fedlex.data.admin.ch/vocabulary/enforcement-status/0> ;
      jolux:classifiedByTaxonomyEntry ?e ;
      jolux:isRealizedBy ?expr .
  ?e skos:notation ?sr . FILTER(str(?sr) = ?srv)
  ?expr jolux:language ?l ; jolux:title ?title .
  OPTIONAL { ?expr jolux:titleShort ?short }
  BIND(STRAFTER(STR(?l), "language/") AS ?lang)
  FILTER(?lang IN ("FRA", "DEU", "ITA"))
}`;
  const res = await fetch(SPARQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`SPARQL ${res.status}`);
  const json = await res.json() as { results: { bindings: Record<string, { value: string }>[] } };
  const seen = new Map<string, SwissEntry>();
  for (const b of json.results.bindings) {
    const lang = LANG[b.lang!.value as keyof typeof LANG];
    const eli = b.cc!.value.replace('https://fedlex.data.admin.ch/eli/', '');
    const sr = String(b.sr!.value);
    const key = `${sr}|${lang}`;
    const prev = seen.get(key);
    // Two laws in force under one SR number would be a list error: said, never guessed.
    if (prev && prev.eli !== eli) throw new Error(`two laws in force for SR ${sr}: ${prev.eli} and ${eli}`);
    seen.set(key, { sr, eli, lang, label: b.title!.value.replace(/\s+/g, ' ').trim(), short: b.short?.value ?? null });
  }
  const missing = SR.filter((s) => !seen.has(`${s}|fr`));
  if (missing.length) throw new Error(`no law in force for SR ${missing.join(', ')}`);
  const entries = SR.flatMap((s) => (['fr', 'de', 'it'] as const).map((l) => seen.get(`${s}|${l}`)).filter((e): e is SwissEntry => !!e));
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'catalogue', 'ch.json');
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  writeFileSync(out, `${JSON.stringify({ country: 'ch', source: 'fedlex.data.admin.ch', listedOn: today, entries }, null, 1)}\n`);
  console.log(`ch: ${SR.length} laws, ${entries.length} entries → ${out}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

/**
 * build-canada — the list of Canada's federal Acts MnemoLaw offers (doc 134
 * §16.12), from Justice Canada's own index. Run by a developer:
 *
 *   curl -o Legis.xml https://laws-lois.justice.gc.ca/eng/XML/Legis.xml
 *   npx tsx scripts/build-canada.ts Legis.xml
 *
 * The index names every consolidated Act twice, in English and in French,
 * with the date it is current to. Both are listed: a person searches the
 * title in their language ("Criminal Code", "Code criminel").
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface CanadaEntry { id: string; lang: 'eng' | 'fra'; label: string; number: string; currentTo: string | null }

function field(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : null;
}

function main(): void {
  const [file] = process.argv.slice(2);
  if (!file) throw new Error('usage: build-canada.ts <Legis.xml>');
  const xml = readFileSync(file, 'utf8');
  const acts = xml.slice(xml.indexOf('<Acts>'), xml.indexOf('</Acts>'));
  const entries: CanadaEntry[] = [];
  for (const block of acts.split('<Act>').slice(1)) {
    const id = field(block, 'UniqueId');
    const lang = field(block, 'Language');
    const label = field(block, 'Title');
    if (!id || !label || (lang !== 'eng' && lang !== 'fra')) continue;
    entries.push({ id, lang, label, number: field(block, 'OfficialNumber') ?? id, currentTo: field(block, 'CurrentToDate') });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label, a.lang === 'fra' ? 'fr' : 'en'));
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'catalogue', 'ca.json');
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  writeFileSync(out, `${JSON.stringify({ country: 'ca', source: 'justicecanada/laws-lois-xml', listedOn: today, entries })}\n`);
  console.log(`ca: ${entries.length} Acts (${entries.filter((e) => e.lang === 'eng').length} English, ${entries.filter((e) => e.lang === 'fra').length} French) → ${out}`);
}

main();

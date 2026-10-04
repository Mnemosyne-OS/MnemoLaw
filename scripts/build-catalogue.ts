/**
 * build-catalogue — the list of laws MnemoLaw offers for one Legalize country
 * (doc 134 §16.3). Run by a developer, never by the cartridge:
 *
 *   git clone --depth 1 https://github.com/legalize-dev/legalize-co.git <dir>
 *   npx tsx scripts/build-catalogue.ts co <dir>
 *
 * A Legalize repository has no index and its file names are numbers
 * (`LEY-599-2000.md`), so the names a person can pick from come from reading
 * the front matter of every file, once, here. The list is a MENU: the
 * cartridge re-reads the live front matter at import and refuses a law that
 * is no longer in force.
 *
 * Kept: the constitution(s) in force, and the codes in force. What a "code"
 * is depends on the country (§16.2): Colombia marks it (`is_code`), Spain and
 * Argentina do not, so their list is the hand-picked `ADDITIONS`.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLegalizeFile, referenceOf, splitArticles } from '../src/locus/legalizeReader';

/**
 * Countries whose list is every text in force of these ranks, searched by
 * title (Tony, 2026-10-03: the UK has no codes, the person finds an Act by
 * its name). A text with no article left (a PDF-only Act, a repealed one
 * whose sections are dots) stays out.
 */
const LIST_ALL: Record<string, Set<string>> = { uk: new Set(['public-general-act']), eu: new Set(['regulation']) };

/**
 * The EU's regulations under the name people use (the official title is a
 * sentence of 40 words). Any other regulation is listed by its subject.
 */
const EU_LABELS: Record<string, string> = {
  '32016R0679': 'GDPR — General Data Protection Regulation',
  '32024R1689': 'AI Act — Artificial Intelligence Act',
  '32022R2065': 'Digital Services Act (DSA)',
  '32022R1925': 'Digital Markets Act (DMA)',
  '32023R2854': 'Data Act',
  '32023R1114': 'Markets in Crypto-Assets (MiCA)',
  '32014R0910': 'eIDAS — electronic identification and trust services',
  '32004R0261': 'Air passenger rights (denied boarding, delays, cancellations)',
  '32021R0782': 'Rail passenger rights',
  '32011R0181': 'Bus and coach passenger rights',
  '32022R0612': 'Roaming in the EU',
  '32008R0593': 'Rome I — law applicable to contracts',
  '32007R0864': 'Rome II — law applicable to non-contractual obligations',
  '32012R1215': 'Brussels I bis — jurisdiction and judgments in civil and commercial matters',
  '32012R0650': 'Succession — wills and inheritance across borders',
  '32019R1111': 'Brussels II ter — divorce, parental responsibility, child abduction',
  '32009R0004': 'Maintenance obligations across borders',
  '32015R0848': 'Insolvency proceedings across borders',
  '32013R0604': 'Dublin III — asylum applications',
  '32016R0399': 'Schengen Borders Code',
  '32009R0810': 'Visa Code',
  '32013R0952': 'Union Customs Code',
  '32017R0745': 'Medical devices',
  '32017R1001': 'EU trade mark',
  '32017R2394': 'Consumer protection cooperation',
};

/** `Regulation (EU) 2016/679 of the European Parliament… of 27 April 2016 on the protection…` → `On the protection…`, cut near 160 characters. */
function euSubject(title: string): string {
  const after = title.replace(/^.*?\bof \d{1,2} [A-Z][a-z]+ \d{4}\s*/, '');
  const s = (after || title).replace(/\s+/g, ' ').trim();
  const cut = s.length <= 160 ? s : `${s.slice(0, s.lastIndexOf(' ', 160))}…`;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

interface Entry {
  path: string; identifier: string; label: string; reference: string | null; rank: string;
  lastUpdated: string | null; textState: string | null; bytes: number;
}

/** Fields a country marks codes with, read beside the reader's own fields. */
function extraField(text: string, name: string): string | null {
  const end = text.indexOf('\n---', 3);
  const head = end > 0 ? text.slice(0, end).replace(/\r/g, '') : '';
  const m = head.match(new RegExp(`^${name}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'));
  return m ? m[1]!.trim() : null;
}

/** `CODIGO PENAL` → `Código Penal`: the source writes code names in capitals without accents. */
const ACCENTS: Record<string, string> = {
  CODIGO: 'Código', TRANSITO: 'Tránsito', PROCEDIMIENTO: 'Procedimiento', ELECTORAL: 'Electoral',
  REGIMEN: 'Régimen', POLITICO: 'Político', MUNICIPAL: 'Municipal', ADMINISTRATIVO: 'Administrativo',
  CONTENCIOSO: 'Contencioso', MINAS: 'Minas', PENITENCIARIO: 'Penitenciario', CARCELARIO: 'Carcelario',
  DISCIPLINARIO: 'Disciplinario', GENERAL: 'General', ORGANICO: 'Orgánico', TRIBUTARIO: 'Tributario',
  ESTATUTO: 'Estatuto', SUSTANTIVO: 'Sustantivo', TRABAJO: 'Trabajo', PROCESAL: 'Procesal',
  COMERCIO: 'Comercio', CIVIL: 'Civil', PENAL: 'Penal', INFANCIA: 'Infancia', ADOLESCENCIA: 'Adolescencia',
  POLICIA: 'Policía', CONVIVENCIA: 'Convivencia', NACIONAL: 'Nacional', RECURSOS: 'Recursos',
  NATURALES: 'Naturales', RENOVABLES: 'Renovables', PROTECCION: 'Protección', MEDIO: 'Medio', AMBIENTE: 'Ambiente',
  EDUCACION: 'Educación', NAVEGACION: 'Navegación', CONTRATACION: 'Contratación', PUBLICA: 'Pública',
  ADMINISTRACION: 'Administración', ORGANIZACION: 'Organización', ADUANERO: 'Aduanero', SANITARIO: 'Sanitario', PETROLEOS: 'Petróleos', MILITAR: 'Militar', JUSTICIA: 'Justicia',
};
const SMALL = new Set(['DE', 'LO', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'E', 'EN', 'EL', 'PARA', 'A', 'AL']);

function codeLabel(raw: string): string {
  return raw.split(/\s+/).filter(Boolean).map((w, i) => {
    const up = w.toUpperCase();
    if (ACCENTS[up]) return ACCENTS[up];
    if (i > 0 && SMALL.has(up)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Under this size a "code" is a decree that amends a code, not the code.
 * Measured on Colombia 2026-10-03: the 53 files marked `is_code` run from
 * 1 KB (`LEY-69-1919`, "Código Penal") to 1.5 MB; every one under 40 KB is a
 * reform or a fragment, and the smallest real code is 66 KB.
 */
const MIN_CODE_BYTES = 50_000;

/**
 * Codes a country does not mark, by identifier, with the name shown. Colombia
 * 2026-10-03: the labour code and the consumer statute are in force and not
 * marked `is_code`. (The 2016 police code, Ley 1801, and the 2019
 * disciplinary code, Ley 1952, are absent from the source altogether.)
 */
const ADDITIONS: Record<string, Record<string, string>> = {
  co: {
    'DECRETO-2663-1950': 'Código Sustantivo del Trabajo',
    'LEY-1480-2011': 'Estatuto del Consumidor',
  },
  // Spain marks no code, and most of its "codes" are titled `Ley 1/2000, de 7
  // de enero, de Enjuiciamiento Civil`: the list is chosen by hand, each id
  // checked in force in the clone of 2026-10-02.
  es: {
    'BOE-A-1889-4763': 'Código Civil',
    'BOE-A-1995-25444': 'Código Penal',
    'BOE-A-1885-6627': 'Código de Comercio',
    'BOE-A-2000-323': 'Ley de Enjuiciamiento Civil',
    'BOE-A-1882-6036': 'Ley de Enjuiciamiento Criminal',
    'BOE-A-2015-11430': 'Estatuto de los Trabajadores',
    'BOE-A-2015-11724': 'Ley General de la Seguridad Social',
    'BOE-A-1995-24292': 'Ley de Prevención de Riesgos Laborales',
    'BOE-A-2007-13409': 'Estatuto del Trabajo Autónomo',
    'BOE-A-2015-11719': 'Estatuto Básico del Empleado Público',
    'BOE-A-2011-15936': 'Ley reguladora de la Jurisdicción Social',
    'BOE-A-1994-26003': 'Ley de Arrendamientos Urbanos',
    'BOE-A-1960-10906': 'Ley de Propiedad Horizontal',
    'BOE-A-2023-12203': 'Ley por el derecho a la vivienda',
    'BOE-A-1946-2453': 'Ley Hipotecaria',
    'BOE-A-1999-21567': 'Ley de Ordenación de la Edificación',
    'BOE-A-2015-11723': 'Ley de Suelo y Rehabilitación Urbana',
    'BOE-A-2007-20555': 'Ley General para la Defensa de los Consumidores y Usuarios',
    'BOE-A-2002-13758': 'Ley de Servicios de la Sociedad de la Información',
    'BOE-A-2018-16673': 'Ley Orgánica de Protección de Datos',
    'BOE-A-2015-10565': 'Ley del Procedimiento Administrativo Común',
    'BOE-A-2015-10566': 'Ley de Régimen Jurídico del Sector Público',
    'BOE-A-1998-16718': 'Ley de la Jurisdicción Contencioso-administrativa',
    'BOE-A-2017-12902': 'Ley de Contratos del Sector Público',
    'BOE-A-1985-12666': 'Ley Orgánica del Poder Judicial',
    'BOE-A-2015-7391': 'Ley de la Jurisdicción Voluntaria',
    'BOE-A-1996-750': 'Ley de Asistencia Jurídica Gratuita',
    'BOE-A-2003-23186': 'Ley General Tributaria',
    'BOE-A-2006-20764': 'Ley del Impuesto sobre la Renta (IRPF)',
    'BOE-A-1992-28740': 'Ley del Impuesto sobre el Valor Añadido (IVA)',
    'BOE-A-2014-12328': 'Ley del Impuesto sobre Sociedades',
    'BOE-A-2004-4214': 'Ley Reguladora de las Haciendas Locales',
    'BOE-A-2010-10544': 'Ley de Sociedades de Capital',
    'BOE-A-2020-4859': 'Ley Concursal',
    'BOE-A-1996-8930': 'Ley de Propiedad Intelectual',
    'BOE-A-2015-11722': 'Ley sobre Tráfico y Seguridad Vial',
    'BOE-A-2015-3442': 'Ley de Seguridad Ciudadana',
    'BOE-A-2000-544': 'Ley de Extranjería',
    'BOE-A-2004-21760': 'Ley contra la Violencia de Género',
    'BOE-A-1996-1069': 'Ley de Protección Jurídica del Menor',
  },
  // Argentina marks no code either, and the original law of a code is often
  // not the text in force: the ordered text (texto ordenado, a decree) is
  // taken when there is one (labour 390/1976, mining 456/1997, electoral
  // 2135/1983, tax procedure 821/1998, income tax 824/2019, federal criminal
  // procedure 118/2019). The constitution sits inside Ley 24.430.
  ar: {
    'LEY-24430': 'Constitución de la Nación Argentina',
    'LEY-26994': 'Código Civil y Comercial de la Nación',
    'LEY-11179': 'Código Penal',
    'LEY-17454': 'Código Procesal Civil y Comercial de la Nación',
    'DEC-118-2019': 'Código Procesal Penal Federal',
    'LEY-23984': 'Código Procesal Penal de la Nación',
    'DEC-390-1976': 'Ley de Contrato de Trabajo',
    'LEY-24557': 'Ley de Riesgos del Trabajo',
    'LEY-24240': 'Ley de Defensa del Consumidor',
    'LEY-19550': 'Ley General de Sociedades',
    'LEY-24522': 'Ley de Concursos y Quiebras',
    'LEY-24449': 'Ley de Tránsito',
    'LEY-25326': 'Ley de Protección de Datos Personales',
    'LEY-26061': 'Ley de Protección Integral de Niñas, Niños y Adolescentes',
    'LEY-26485': 'Ley de Protección Integral a las Mujeres',
    'LEY-25871': 'Ley de Migraciones',
    'LEY-23737': 'Ley de Estupefacientes',
    'DEC-821-1998': 'Ley de Procedimiento Tributario',
    'DEC-824-2019': 'Ley de Impuesto a las Ganancias',
    'DEC-2135-1983': 'Código Electoral Nacional',
    'DEC-456-1997': 'Código de Minería',
    'LEY-17285': 'Código Aeronáutico',
    'LEY-20094': 'Ley de la Navegación',
  },
  // Portugal publishes 159 613 of its 164 431 national texts as enacted,
  // without their amendments; the consolidated ones are the codes and great
  // laws below (measured 2026-10-03). Its consumer and data protection laws
  // are as enacted only, so they are absent.
  pt: {
    'DRE-1976-502635': 'Constituição da República Portuguesa',
    'DRE-1966-47344-477358': 'Código Civil',
    'DRE-1995-48-185720': 'Código Penal',
    'DRE-2013-41-497406': 'Código de Processo Civil',
    'DRE-1987-78-662562': 'Código de Processo Penal',
    'DRE-2009-7-602073': 'Código do Trabalho',
    'DRE-1999-480-683065': 'Código de Processo do Trabalho',
    'DRE-2013-72-499526': 'Código da Estrada',
    'DRE-2006-6-693853': 'Novo Regime do Arrendamento Urbano',
    'DRE-1986-262-220107': 'Código das Sociedades Comerciais',
    'DRE-2004-53-538423': 'Código da Insolvência e da Recuperação de Empresas',
    'DRE-2014-82-E-66022085': 'Código do IRS',
    'DRE-2014-2-571007': 'Código do IRC',
    'DRE-1999-150-571194': 'Código do Imposto do Selo',
    'DRE-1999-433-692261': 'Código de Procedimento e de Processo Tributário',
    'DRE-2015-4-66041468': 'Código do Procedimento Administrativo',
    'DRE-2002-15-280920': 'Código de Processo nos Tribunais Administrativos',
    'DRE-2008-18-248178': 'Código dos Contratos Públicos',
    'DRE-2014-35-25676932': 'Lei Geral do Trabalho em Funções Públicas',
    'DRE-1981-37-564050': 'Lei da Nacionalidade',
    'DRE-1985-63-326921': 'Código do Direito de Autor e dos Direitos Conexos',
    'DRE-1999-486-682983': 'Código dos Valores Mobiliários',
    'DRE-1992-298-448953': 'Regime Geral das Instituições de Crédito',
    'DRE-1995-131-521238': 'Código do Registo Civil',
    'DRE-1984-224-591313': 'Código do Registo Predial',
    'DRE-1986-403-221517': 'Código do Registo Comercial',
    'DRE-1999-555-655682': 'Regime Jurídico da Urbanização e Edificação',
    'DRE-2013-75-500023': 'Regime Jurídico das Autarquias Locais',
    'DRE-2007-9-522807': 'Regulamento Geral do Ruído',
    'DRE-2003-100-446475': 'Código de Justiça Militar',
  },
};

/**
 * The folders of a clone that hold national law. Spain keeps each autonomous
 * community in its own folder (`es-an`, `es-ct`...): read with the State's
 * laws, they would fill the national packs with regional texts.
 */
const NATIONAL_FOLDERS: Record<string, string> = { es: 'es', pt: 'pt' };

/** `Por el cual se expide el Estatuto Tributario de…` → `Estatuto Tributario`. */
function labelFromTitle(title: string | null): string | null {
  const m = title?.match(/(C[oó]digo|Estatuto)\s+[^,;.(]*?(?=\s+(?:de los|y se|que|para)\b|[,;.(]|$)/i);
  return m ? m[0].trim().replace(/^./, (c) => c.toUpperCase()) : null;
}

function main(): void {
  const [country, dir] = process.argv.slice(2);
  if (!country || !dir) throw new Error('usage: build-catalogue.ts <cc> <clone dir>');
  const sha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  // Legalize dates each commit at the publication it replays: Argentina's
  // last commit says 1984. A date before the source existed is no reading
  // date, so the day the list was built stands in for it.
  const committed = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%cI'], { encoding: 'utf8' }).trim();
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const date = committed >= '2025' ? committed : today;

  const additions = ADDITIONS[country] ?? {};
  const entries: Entry[] = [];
  // Every law in force, by rank: the "load everything" packs (doc 134 §16.6).
  const packs = new Map<string, { paths: string[]; bytes: number }>();
  let scanned = 0;
  let asEnacted = 0;
  let stubs = 0;
  for (const sub of readdirSync(dir, { withFileTypes: true })) {
    if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
    if (NATIONAL_FOLDERS[country] && sub.name !== NATIONAL_FOLDERS[country]) continue;
    // Portugal files its laws by year (`pt/1976/DRE-….md`): the walk goes down.
    const listed = (readdirSync(join(dir, sub.name), { recursive: true }) as string[]).map((f) => f.replace(/\\/g, '/'));
    for (const f of listed) {
      if (!f.endsWith('.md')) continue;
      scanned++;
      const file = join(dir, sub.name, f);
      const text = readFileSync(file, 'utf8');
      const { meta } = parseLegalizeFile(text);
      if (meta.status !== 'in_force') continue;
      const listAll = LIST_ALL[country]?.has(meta.rank ?? '') ?? false;
      // A text with no article left is in neither the list nor a pack.
      if (listAll && !splitArticles(parseLegalizeFile(text).body, { country }).some((a) => a.header !== 'Preámbulo')) { stubs++; continue; }
      if (meta.textState !== 'as_enacted') {
        const rank = meta.rank ?? 'other';
        const pack = packs.get(rank) ?? { paths: [], bytes: 0 };
        pack.paths.push(`${sub.name}/${f}`);
        pack.bytes += statSync(file).size;
        packs.set(rank, pack);
      }
      const id = meta.identifier ?? f.replace(/\.md$/, '');
      const isConstitution = (meta.rank ?? '').startsWith('constituci');
      const isCode = extraField(text, 'is_code') === 'true';
      const added = additions[id];
      if (!isConstitution && !isCode && !added && !listAll) continue;
      if (meta.textState === 'as_enacted') { asEnacted++; continue; }
      const bytes = statSync(file).size;
      if (!isConstitution && !added && !listAll && bytes < MIN_CODE_BYTES) { stubs++; continue; }
      const label = (country === 'eu' ? EU_LABELS[id] ?? euSubject(meta.title ?? id) : null)
        ?? added
        ?? (isCode && meta.codeName ? codeLabel(meta.codeName) : null)
        ?? labelFromTitle(meta.title)
        ?? meta.title ?? id;
      entries.push({
        path: `${sub.name}/${f}`,
        identifier: id,
        label,
        reference: referenceOf(id, meta.title),
        rank: meta.rank ?? '',
        lastUpdated: meta.lastUpdated,
        textState: meta.textState,
        bytes,
      });
    }
  }
  // Constitutions first, then the codes by name.
  // A hand-picked law the clone no longer holds in force is said, never skipped quietly.
  const missing = Object.keys(additions).filter((id) => !entries.some((e) => e.identifier === id));
  if (missing.length) console.warn(`${country}: hand-picked laws absent or not in force: ${missing.join(', ')}`);
  // Argentina's constitution is published by a law (rank `ley`): its label puts it first.
  const first = (e: Entry) => Number(!(e.rank.startsWith('constituci') || /^Constitu/.test(e.label)));
  entries.sort((a, b) => first(a) - first(b)
    || a.label.localeCompare(b.label, 'es'));

  // A long list (the UK's 2 386 Acts) is written on one line: it ships in the window.
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'catalogue', `${country}.json`);
  mkdirSync(dirname(out), { recursive: true });
  // The summary rides in the small list; the paths go to their own file, loaded
  // only when the person opens a pack (63 788 paths for Colombia, ~1.6 MB).
  const ranked = [...packs.entries()].sort((a, b) => b[1].paths.length - a[1].paths.length);
  const summary = ranked.map(([rank, p]) => ({ rank, files: p.paths.length, bytes: p.bytes }));
  // A list of every text (the UK, the EU) keeps only what the screen and the
  // import read: the path is `<cc>/<identifier>.md`, the rest is not shown.
  const slim = LIST_ALL[country]
    ? entries.map(({ identifier, label, reference, lastUpdated }) => ({ identifier, label, reference, lastUpdated }))
    : entries;
  writeFileSync(out, `${JSON.stringify({ country, source: `legalize-dev/legalize-${country}`, commit: sha, commitDate: date, scanned, entries: slim, packs: summary }, null, entries.length > 200 ? undefined : 2)}\n`);
  const packsOut = out.replace(/\.json$/, '.packs.json');
  writeFileSync(packsOut, `${JSON.stringify({ country, commit: sha, packs: Object.fromEntries(ranked.map(([rank, p]) => [rank, p.paths.sort()])) })}\n`);
  for (const r of summary) console.log(`  pack ${r.rank}: ${r.files} files, ${(r.bytes / 1e6).toFixed(1)} MB`);
  console.log(`${country}: ${scanned} files read, ${entries.length} kept, ${stubs} under ${MIN_CODE_BYTES / 1000} KB and ${asEnacted} as enacted left out → ${out}`);
}

main();

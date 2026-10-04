/**
 * build-treaties — copies the international treaties MnemoLaw offers into
 * `public/data/treaties/` (doc 134 §16.15). Run by a developer:
 *
 *   npx tsx scripts/build-treaties.ts            every treaty
 *   npx tsx scripts/build-treaties.ts udhr crc   only these
 *
 * Measured 2026-10-04: the official sites refuse a browser cartridge (no
 * CORS on un.org, icj-cij.org, EUR-Lex; a Cloudflare challenge on OHCHR, the
 * Council of Europe and the Hague Conference), and Wikisource serves the
 * ORIGINAL text of amended treaties (its UN Charter says "eleven Members" of
 * the Security Council, the text of 1945). So:
 *  - a treaty never amended is copied from Wikisource (API with CORS, its
 *    revision recorded);
 *  - an amended treaty is copied from its official page, in its current text.
 * Each run prints the article count beside the one expected: a page whose
 * layout changed shows up there instead of in a person's answer.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

type Source =
  | { kind: 'wikisource'; lang: 'en' | 'fr'; page: string }
  | { kind: 'html'; url: string; root?: string }
  /** EU primary law from the Publications Office (CELLAR), consolidated XHTML. */
  | { kind: 'cellar'; celex: string };

interface Treaty {
  id: string;
  group: 'un' | 'ihl' | 'coe' | 'eu' | 'hcch';
  title: string;
  /** Short name in the list, when the title is long. */
  label?: string;
  adopted: string;
  /** The official page a person checks. */
  official: string;
  source: Source;
  /** Articles the treaty has; the run says when the copy has another count. */
  expect: number;
}

const UA = 'MnemoLaw/0.8 (treaty snapshot for a law cartridge; https://github.com/Mnemosyne-OS)';

const TREATIES: Treaty[] = [
  // ── United Nations ──────────────────────────────────────────────────────
  { id: 'un-charter', group: 'un', title: 'Charter of the United Nations', adopted: '1945-06-26',
    official: 'https://www.un.org/en/about-us/un-charter/full-text',
    source: { kind: 'html', url: 'https://www.un.org/en/about-us/un-charter/full-text', root: 'main' }, expect: 111 },
  { id: 'icj-statute', group: 'un', title: 'Statute of the International Court of Justice', adopted: '1945-06-26',
    official: 'https://www.icj-cij.org/statute',
    source: { kind: 'html', url: 'https://www.icj-cij.org/statute', root: 'main' }, expect: 70 },
  { id: 'udhr', group: 'un', title: 'Universal Declaration of Human Rights', adopted: '1948-12-10',
    official: 'https://www.un.org/en/about-us/universal-declaration-of-human-rights',
    source: { kind: 'wikisource', lang: 'en', page: 'Universal Declaration of Human Rights' }, expect: 30 },
  { id: 'iccpr', group: 'un', title: 'International Covenant on Civil and Political Rights', adopted: '1966-12-16',
    official: 'https://www.ohchr.org/en/instruments-mechanisms/instruments/international-covenant-civil-and-political-rights',
    source: { kind: 'wikisource', lang: 'en', page: 'International Covenant on Civil and Political Rights' }, expect: 53 },
  { id: 'icescr', group: 'un', title: 'International Covenant on Economic, Social and Cultural Rights', adopted: '1966-12-16',
    official: 'https://www.ohchr.org/en/instruments-mechanisms/instruments/international-covenant-economic-social-and-cultural-rights',
    source: { kind: 'wikisource', lang: 'en', page: 'International Covenant on Economic, Social and Cultural Rights' }, expect: 31 },
  { id: 'crc', group: 'un', title: 'Convention on the Rights of the Child', adopted: '1989-11-20',
    official: 'https://www.ohchr.org/en/instruments-mechanisms/instruments/convention-rights-child',
    source: { kind: 'wikisource', lang: 'en', page: 'Convention on the Rights of the Child' }, expect: 54 },
  { id: 'cedaw', group: 'un', title: 'Convention on the Elimination of All Forms of Discrimination against Women', label: 'Convention on discrimination against women (CEDAW)', adopted: '1979-12-18',
    official: 'https://www.ohchr.org/en/instruments-mechanisms/instruments/convention-elimination-all-forms-discrimination-against-women',
    source: { kind: 'wikisource', lang: 'en', page: 'Convention on the Elimination of All Forms of Discrimination Against Women' }, expect: 30 },
  { id: 'cat', group: 'un', title: 'Convention against Torture and Other Cruel, Inhuman or Degrading Treatment or Punishment', label: 'Convention against Torture', adopted: '1984-12-10',
    official: 'https://www.ohchr.org/en/instruments-mechanisms/instruments/convention-against-torture-and-other-cruel-inhuman-or-degrading',
    source: { kind: 'wikisource', lang: 'en', page: 'Convention against Torture and Other Cruel, Inhuman or Degrading Treatment or Punishment' }, expect: 33 },
  { id: 'vclt', group: 'un', title: 'Vienna Convention on the Law of Treaties', adopted: '1969-05-23',
    official: 'https://legal.un.org/ilc/texts/instruments/english/conventions/1_1_1969.pdf',
    source: { kind: 'wikisource', lang: 'en', page: 'Vienna Convention on the Law of Treaties' }, expect: 85 },
  { id: 'vcdr', group: 'un', title: 'Vienna Convention on Diplomatic Relations', adopted: '1961-04-18',
    official: 'https://legal.un.org/ilc/texts/instruments/english/conventions/9_1_1961.pdf',
    source: { kind: 'wikisource', lang: 'en', page: 'Vienna Convention on Diplomatic Relations' }, expect: 53 },
  { id: 'vccr', group: 'un', title: 'Vienna Convention on Consular Relations', adopted: '1963-04-24',
    official: 'https://legal.un.org/ilc/texts/instruments/english/conventions/9_2_1963.pdf',
    source: { kind: 'wikisource', lang: 'en', page: 'Vienna Convention on Consular Relations' }, expect: 79 },
  { id: 'refugees-1951', group: 'un', title: 'Convention relating to the Status of Refugees', label: 'Refugee Convention (1951)', adopted: '1951-07-28',
    official: 'https://www.unhcr.org/media/convention-and-protocol-relating-status-refugees',
    source: { kind: 'wikisource', lang: 'en', page: '1951 Refugee Convention' }, expect: 46 },
  // ── International humanitarian law ──────────────────────────────────────
  { id: 'geneva-1', group: 'ihl', title: 'Geneva Convention (I) for the Amelioration of the Condition of the Wounded and Sick in Armed Forces in the Field', label: 'First Geneva Convention (wounded and sick soldiers)', adopted: '1949-08-12',
    official: 'https://ihl-databases.icrc.org/en/ihl-treaties/gci-1949',
    source: { kind: 'wikisource', lang: 'en', page: 'First Geneva Convention (1949)' }, expect: 64 },
  { id: 'geneva-2', group: 'ihl', title: 'Geneva Convention (II) for the Amelioration of the Condition of Wounded, Sick and Shipwrecked Members of Armed Forces at Sea', label: 'Second Geneva Convention (at sea)', adopted: '1949-08-12',
    official: 'https://ihl-databases.icrc.org/en/ihl-treaties/gcii-1949',
    source: { kind: 'wikisource', lang: 'en', page: 'Geneva Convention/Second Geneva Convention' }, expect: 63 },
  { id: 'geneva-3', group: 'ihl', title: 'Geneva Convention (III) relative to the Treatment of Prisoners of War', label: 'Third Geneva Convention (prisoners of war)', adopted: '1949-08-12',
    official: 'https://ihl-databases.icrc.org/en/ihl-treaties/gciii-1949',
    source: { kind: 'wikisource', lang: 'en', page: 'Geneva Convention/Third Geneva Convention' }, expect: 143 },
  { id: 'geneva-4', group: 'ihl', title: 'Geneva Convention (IV) relative to the Protection of Civilian Persons in Time of War', label: 'Fourth Geneva Convention (civilians)', adopted: '1949-08-12',
    official: 'https://ihl-databases.icrc.org/en/ihl-treaties/gciv-1949',
    source: { kind: 'wikisource', lang: 'en', page: 'Geneva Convention/Fourth Geneva Convention' }, expect: 159 },
  { id: 'geneva-ap1', group: 'ihl', title: 'Protocol Additional to the Geneva Conventions of 12 August 1949, and relating to the Protection of Victims of International Armed Conflicts (Protocol I)', label: 'Additional Protocol I (international armed conflicts)', adopted: '1977-06-08',
    official: 'https://ihl-databases.icrc.org/en/ihl-treaties/api-1977',
    source: { kind: 'wikisource', lang: 'en', page: 'Geneva Convention/Protocol I' }, expect: 102 },
  { id: 'geneva-ap3', group: 'ihl', title: 'Protocol Additional to the Geneva Conventions of 12 August 1949, and relating to the Adoption of an Additional Distinctive Emblem (Protocol III)', label: 'Additional Protocol III (red crystal emblem)', adopted: '2005-12-08',
    official: 'https://ihl-databases.icrc.org/en/ihl-treaties/apiii-2005',
    source: { kind: 'wikisource', lang: 'en', page: 'Geneva Convention/Protocol III' }, expect: 17 },
  // ── Council of Europe ───────────────────────────────────────────────────
  { id: 'istanbul', group: 'coe', title: 'Council of Europe Convention on preventing and combating violence against women and domestic violence', label: 'Istanbul Convention (violence against women)', adopted: '2011-05-11',
    official: 'https://www.coe.int/en/web/conventions/full-list?module=treaty-detail&treatynum=210',
    source: { kind: 'wikisource', lang: 'en', page: 'Council of Europe Convention on preventing and combating violence against women and domestic violence' }, expect: 81 },
  // ── EU primary law (current consolidated text, 2016 OJ C 202) ───────────
  { id: 'teu', group: 'eu', title: 'Treaty on European Union (consolidated version)', label: 'Treaty on European Union (TEU)', adopted: '1992-02-07',
    official: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:12016M/TXT',
    source: { kind: 'cellar', celex: '12016M/TXT' }, expect: 55 },
  { id: 'tfeu', group: 'eu', title: 'Treaty on the Functioning of the European Union (consolidated version)', label: 'Treaty on the Functioning of the European Union (TFEU)', adopted: '1957-03-25',
    official: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:12016E/TXT',
    source: { kind: 'cellar', celex: '12016E/TXT' }, expect: 358 },
  { id: 'eu-charter', group: 'eu', title: 'Charter of Fundamental Rights of the European Union', label: 'EU Charter of Fundamental Rights', adopted: '2000-12-07',
    official: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:12016P/TXT',
    source: { kind: 'cellar', celex: '12016P/TXT' }, expect: 54 },
];

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'data', 'treaties');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A GET that waits and tries again on a rate limit (Wikisource answers 429 after ~10 quick calls). */
async function get(url: string, headers: Record<string, string> = {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, ...headers } });
    if (res.ok) return res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 5) { await sleep(5_000 * (attempt + 1)); continue; }
    throw new Error(`HTTP_${res.status} ${url}`);
  }
}

/** The page's HTML and where it came from. */
async function fetchSource(t: Treaty): Promise<{ html: string; via: string | null }> {
  if (t.source.kind === 'wikisource') {
    const api = `https://${t.source.lang}.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(t.source.page)}&prop=text|revid&formatversion=2&redirects=1&format=json`;
    const data = JSON.parse(await get(api)) as { parse?: { text: string; revid: number; title: string }; error?: { info: string } };
    if (!data.parse) throw new Error(`WIKISOURCE ${data.error?.info ?? 'no page'}`);
    const link = `https://${t.source.lang}.wikisource.org/wiki/${encodeURIComponent(data.parse.title.replace(/ /g, '_'))}`;
    return { html: data.parse.text, via: `${link} (revision ${data.parse.revid})` };
  }
  if (t.source.kind === 'cellar') {
    // 🪤 The slash of a CELEX number must be encoded: `12016M/TXT` answers 404.
    const url = `https://publications.europa.eu/resource/celex/${t.source.celex.replace('/', '%2F')}`;
    return { html: await get(url, { Accept: 'application/xhtml+xml', 'Accept-Language': 'eng' }), via: `${url} (Publications Office of the EU, consolidated text)` };
  }
  return { html: await get(t.source.url), via: null };
}

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DD', 'DT', 'TD', 'BLOCKQUOTE', 'PRE']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NAV', 'HEADER', 'FOOTER', 'SUP', 'NOSCRIPT', 'TEMPLATE', 'LINK']);
/** Wikisource's header, licence box and notes: not the treaty's text. */
const SKIP_CLASSES = ['mw-editsection', 'reference', 'references', 'reflist', 'licenseContainer', 'ws-noexport', 'wst-header', 'ws-header', 'mw-references-wrap', 'navbox'];

/** The text of an element, its scripts, styles and skipped parts left out. */
function textOf(el: Element): string {
  let out = '';
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3) out += n.textContent ?? '';
    else if (n.nodeType === 1) {
      const e = n as Element;
      if (SKIP.has(e.tagName) || SKIP_CLASSES.some((c) => e.classList.contains(c))) continue;
      out += ` ${textOf(e)} `;
    }
  }
  return out;
}

/** The text blocks of a page in reading order: paragraphs, headings, list items. */
function blocks(html: string, root?: string): string[] {
  const doc = new JSDOM(html).window.document;
  const start = (root ? doc.querySelector(root) : null) ?? doc.body;
  const out: string[] = [];
  const walk = (el: Element) => {
    if (SKIP.has(el.tagName) || SKIP_CLASSES.some((c) => el.classList.contains(c))) return;
    // 🪤 un.org wraps its whole text in `div > section > section`: a div is a
    // block of text only when nothing structural is left inside it.
    const hasBlockChild = !!el.querySelector('p,h1,h2,h3,h4,h5,h6,li,div,table,ul,ol,section,article,blockquote,dd,dt,pre');
    if ((BLOCKS.has(el.tagName) || el.tagName === 'DIV') && !hasBlockChild) {
      // Zero-width spaces sit before some headings (`​Article 29.` in the ICCPR).
      const text = textOf(el).replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
      if (text) out.push(text);
      return;
    }
    for (const c of Array.from(el.children)) walk(c);
  };
  walk(start);
  return out;
}

const DIVISION = /^(PART|CHAPTER|TITLE|SECTION|PREAMBLE)\b/i;

/** Blocks → the Markdown MnemoLaw reads: `#### Article N`, divisions as `##`. */
function toMarkdown(lines: string[]): { body: string; articles: number } {
  const out: string[] = [];
  let articles = 0;
  let inAnnex = false;
  const pending = [...lines];
  for (let line = pending.shift(); line !== undefined; line = pending.shift()) {
    // A division and the next article on one line (VCLT: `Section 4.Treaties
    // and Third States Article 34 General rule…`): two lines.
    const glued = line.match(/^(.*?\S)\s+(Article\s+\d+[a-z]?\b.*)$/);
    if (glued && DIVISION.test(glued[1]!)) { pending.unshift(glued[1]!, glued[2]!); continue; }
    // `Article 1`, `Article 1 Purposes`, `Article 28. 1. There shall be…`. A
    // mention (`Article 2 of the present Covenant`) goes on in lower case.
    // 🪤 Wikisource's VCLT spells its first article `Article I` (a letter for the figure).
    // `Art 1. General principles` (Protocol I) and `Article 1 . definition of
    // the term` (Refugee Convention) are headings too: a punctuation mark
    // between the number and the text says so, where a mention runs on
    // (`Article 2 of the present Covenant`).
    const art = line.replace(/^Article\s+I\b(?=\s+[A-Z])/, 'Article 1').match(/^Art(?:icle|\.)?\s+(\d+[a-z]?)\b\s*([.:—–-]?)\s*(.*)$/i);
    // A reference glues its bracket to the number (`Article 48(7) of the
    // Treaty`, TFEU), where a heading leaves a space (`Article 1 (Purposes)`).
    const reference = /^Art(?:icle|\.)?\s+\d+[a-z]?\(/i.test(line);
    if (art && !reference && (art[3]!.length === 0 || art[2] || /^[A-Z0-9(“"‘]/.test(art[3]!))) {
      // The TFEU's source repeats some headings (`Article 354` twice in a row).
      if (out.length >= 2 && out[out.length - 2] === `#### Article ${art[1]}` && !art[3]) continue;
      if (!inAnnex) articles++;
      out.push(`#### Article ${art[1]}`, '');
      if (art[3]) out.push(art[3], '');
      continue;
    }
    // An annex or protocol starts again at Article 1: counted only after the
    // treaty itself (the EU text opens on a table of contents naming them).
    if (/^(ANNEX|PROTOCOL|DECLARATIONS?)\b/i.test(line) && line.length < 200) { if (articles > 0) inAnnex = true; out.push(`## ${line}`, ''); continue; }
    if (DIVISION.test(line) && line.length < 140) { out.push(`## ${line}`, ''); continue; }
    out.push(line, '');
  }
  return { body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), articles };
}

function frontMatter(t: Treaty, via: string | null, today: string): string {
  const q = (s: string) => JSON.stringify(s);
  return [
    '---',
    `title: ${q(t.title)}`,
    `identifier: ${q(`int-${t.id}`)}`,
    'country: "int"',
    'rank: "treaty"',
    'status: "in_force"',
    'text_state: "current"',
    `source: ${q(t.official)}`,
    ...(via ? [`via: ${q(via)}`] : []),
    `adopted: ${q(t.adopted)}`,
    `last_updated: ${q(today)}`,
    '---',
  ].join('\n');
}

async function main(): Promise<void> {
  const only = new Set(process.argv.slice(2));
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const indexFile = join(OUT, 'index.json');
  const previous = existsSync(indexFile) ? (JSON.parse(readFileSync(indexFile, 'utf8')) as { entries: unknown[] }).entries : [];
  const entries = new Map<string, unknown>((previous as { identifier: string }[]).map((e) => [e.identifier, e]));
  for (const t of TREATIES) {
    if (only.size && !only.has(t.id)) continue;
    try {
      const { html, via } = await fetchSource(t);
      const root = t.source.kind === 'html' ? t.source.root : undefined;
      const { body, articles } = toMarkdown(blocks(html, root));
      const path = `treaties/${t.group}/${t.id}.md`;
      mkdirSync(join(OUT, t.group), { recursive: true });
      writeFileSync(join(OUT, t.group, `${t.id}.md`), `${frontMatter(t, via, today)}\n# ${t.title}\n\n${body}\n`);
      entries.set(`int-${t.id}`, { path, identifier: `int-${t.id}`, label: t.label ?? t.title, reference: `${t.group.toUpperCase()}, ${t.adopted.slice(0, 4)}`, lastUpdated: today, group: t.group });
      const flag = articles === t.expect ? 'ok' : `⚠ expected ${t.expect}`;
      console.log(`${t.id}: ${articles} articles (${flag})`);
    } catch (err) {
      console.error(`${t.id}: FAILED ${err instanceof Error ? err.message : String(err)}`);
    }
    if (t.source.kind === 'wikisource') await sleep(3_000);
  }
  const list = [...entries.values()].sort((a, b) => String((a as { label: string }).label).localeCompare(String((b as { label: string }).label)));
  writeFileSync(indexFile, `${JSON.stringify({ country: 'int', builtOn: today, entries: list }, null, 2)}\n`);
  console.log(`index: ${list.length} treaties → ${indexFile}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

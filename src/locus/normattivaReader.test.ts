import { deflateRawSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CODICI_URL, entryText, findEntry, forgetCodici, parseAknCode, readConstitution, readNormattivaCode,
  referenceOfUrn, unzip, versionDate,
} from './normattivaReader';
import { italyLaws } from './italyCatalogue';
import { articleChronicles, chronicleTitle } from './articleText';

// Shapes copied from the real zip of 2026-10-03 (doc 134 §16.9).
const AKN = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><akomaNtoso xmlns="http://docs.oasis-open.org/legaldocml/ns/akn/3.0"><act name="monovigente"><meta><identification source=""><FRBRWork><FRBRalias name="urn:nir" value="urn:nir:stato:regio.decreto:1930-10-19;1398"/></FRBRWork></identification></meta><preface><p><docTitle>Approvazione del testo definitivo del Codice Penale.</docTitle></p></preface>${body}</act></akomaNtoso>`;

const attachment = (text: string) => `<attachment><doc name="x"><meta/><mainBody><paragraph><content><p>${text}</p></content></paragraph></mainBody></doc></attachment>`;

/** An old code: the decree's own article, then one attachment per article of the code. */
const OLD = AKN(`<body><article eId="art_1"><num>Art. 1.</num><paragraph><content><p>E' approvato il testo definitivo del Codice penale.</p></content></paragraph></article></body><attachments>
${attachment(' <ref href="#art_1">CODICE PENALE \n \n \n Art. 1</ref>. \n \n (Reati e pene: disposizione espressa di legge) \n \n Nessuno puo\' essere punito per un fatto che non sia espressamente preveduto come reato dalla legge.\n')}
${attachment(' Art. 100. \n \n<ins eId="ins_70">((ARTICOLO ABROGATO DAL D.L. 11 APRILE 1974, N. 99))</ins>\n')}
${attachment(' Art. 734-bis. (Divulgazione delle generalita\') \n \n Chiunque divulga le generalita\' della persona offesa.\n')}
</attachments>`);

/** A recent code: articles in the body under chapters, an annex that stays out. */
const RECENT = AKN(`<body><chapter><num>Capo I</num><heading>Disposizioni generali</heading>
<article eId="art_1"><num>Art. 1.</num><heading> Finalita'</heading><paragraph><num>1.</num><content><p>Il presente codice tutela i consumatori.</p></content></paragraph><paragraph><num>2.</num><content><p>Secondo comma.</p></content></paragraph></article>
<article eId="art_2"><num>Art. 2-bis.</num><heading/><paragraph><content><p><ins>((ARTICOLO ABROGATO DAL D.LGS. 21 FEBBRAIO 2014, N. 21))</ins></p></content></paragraph></article>
</chapter></body><attachments>${attachment('Allegato I. Art. 5 Tabella.')}</attachments>`);

describe('parseAknCode', () => {
  it('reads an old code from its attachments and leaves out a repealed article', () => {
    const code = parseAknCode(OLD);
    expect(code.urn).toBe('urn:nir:stato:regio.decreto:1930-10-19;1398');
    expect(code.articles.map((a) => a.header)).toEqual(['Art. 1', 'Art. 1', 'Art. 734-bis']);
    expect(code.articles[1]!.content).toBe("Nessuno puo' essere punito per un fatto che non sia espressamente preveduto come reato dalla legge.".replace(/^/, '(Reati e pene: disposizione espressa di legge)\n\n'));
    expect(code.repealed).toBe(1);
    expect(code.actRepealed).toBe(false);
  });

  it('reads a recent code from its articles, with the chapter and the heading, and leaves its annexes out', () => {
    const code = parseAknCode(RECENT);
    expect(code.articles).toHaveLength(1);
    expect(code.articles[0]).toMatchObject({ header: 'Art. 1', topic: 'Capo I Disposizioni generali' });
    expect(code.articles[0]!.content).toBe("(Finalita')\n\n1. Il presente codice tutela i consumatori.\n\n2. Secondo comma.");
    expect(code.repealed).toBe(1);
  });

  it('marks an act repealed as a whole', () => {
    const gone = AKN(`<body>${[1, 2, 3].map((n) => `<article><num>Art. ${n}.</num><paragraph><content><p><ins>((PROVVEDIMENTO ABROGATO DAL D.LGS. 31 MARZO 2023, N. 36))</ins></p></content></paragraph></article>`).join('')}</body>`);
    expect(parseAknCode(gone).actRepealed).toBe(true);
    expect(parseAknCode(RECENT).actRepealed).toBe(false);
  });
});

/** A zip built the way the collection's is: one stored entry, one deflated. */
function zipOf(files: Record<string, { data: Buffer; deflate: boolean }>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, f] of Object.entries(files)) {
    const body = f.deflate ? deflateRawSync(f.data) : f.data;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(f.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(f.deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, body);
    centrals.push(central, n);
    offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}

const PENAL = 'REGIO DECRETO_19301019_1398/1930-10-26_030U1398_VIGENZA_2026-07-16_V0.xml';
const CIVIL = 'REGIO DECRETO_19420316_262/1942-04-04_042U0262_VIGENZA_2026-04-29_V0.xml';
const REPEALED = 'DECRETO LEGISLATIVO_20160418_50/2016-04-19_16G00062_VIGENZA_2025-12-12_V0.xml';
const ZIP = zipOf({
  [PENAL]: { data: Buffer.from(OLD), deflate: true },
  // The civil code's entry is base64 text, not XML.
  [CIVIL]: { data: Buffer.from(Buffer.from(RECENT).toString('base64')), deflate: false },
  [REPEALED]: { data: Buffer.from(AKN(`<body><article><num>Art. 1.</num><paragraph><content><p>((PROVVEDIMENTO ABROGATO DAL D.LGS. 31 MARZO 2023, N. 36))</p></content></paragraph></article></body>`)), deflate: true },
});

describe('the zip of the codes', () => {
  beforeEach(() => forgetCodici());

  it('opens stored and deflated entries, base64 included', async () => {
    const entries = await unzip(ZIP);
    expect(entryText(entries.get(PENAL)!)).toBe(OLD);
    expect(entryText(entries.get(CIVIL)!)).toBe(RECENT);
    expect(findEntry(entries.keys(), '042U0262')).toBe(CIVIL);
    expect(findEntry(entries.keys(), '042U9999')).toBeNull();
    expect(versionDate(PENAL)).toBe('2026-07-16');
  });

  it('fetches the zip once per window, and gives the date of the text in force', async () => {
    const fetchBytes = vi.fn(async (url: string) => { expect(url).toBe(CODICI_URL); return ZIP; });
    const penal = await readNormattivaCode(fetchBytes, '030U1398');
    const civil = await readNormattivaCode(fetchBytes, '042U0262');
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(penal).toMatchObject({ repealed: 1, versionDate: '2026-07-16' });
    expect(civil.articles).toHaveLength(1);
  });

  it('refuses a repealed code and one the collection no longer holds, and fetches again after a failure', async () => {
    const fetchBytes = vi.fn(async () => ZIP);
    await expect(readNormattivaCode(fetchBytes, '16G00062')).rejects.toThrow('NORMATTIVA_REPEALED');
    await expect(readNormattivaCode(fetchBytes, '99X00000')).rejects.toThrow('NORMATTIVA_NOT_IN_COLLECTION');
    forgetCodici();
    const failing = vi.fn().mockRejectedValueOnce(new Error('HTTP_503')).mockResolvedValue(ZIP);
    await expect(readNormattivaCode(failing, '030U1398')).rejects.toThrow('HTTP_503');
    await expect(readNormattivaCode(failing, '030U1398')).resolves.toMatchObject({ repealed: 1 });
  });
});

describe('the constitution', () => {
  const answer = (n: number) => ({
    data: { atto: { articoloHtml: n === 115
      ? `<div class="bodyTesto"><h2 class="article-num-akn">Art. ${n}</h2><span>((ARTICOLO ABROGATO DALLA L. COSTITUZIONALE 18 OTTOBRE 2001, N. 3))</span></div>`
      : `<div class="bodyTesto"><h2 class="article-num-akn">Art. ${n}</h2><span><br> Testo dell&#39;articolo ${n}.<br> Secondo comma.</span></div>` } },
  });

  it('reads the 139 articles one by one and leaves out the repealed ones', async () => {
    const postJson = vi.fn(async (_url: string, body: unknown) => answer(Number(String((body as { urn: string }).urn).split('~art')[1])));
    const res = await readConstitution(postJson);
    expect(postJson).toHaveBeenCalledTimes(139);
    expect(res.repealed).toBe(1);
    expect(res.articles).toHaveLength(138);
    expect(res.articles[0]).toMatchObject({ header: 'Art. 1', content: "Testo dell'articolo 1.\n\nSecondo comma." });
  });

  it('says which article the source did not give', async () => {
    const postJson = vi.fn(async () => ({ data: { atto: null }, message: 'idArticolo:140' }));
    await expect(readConstitution(postJson)).rejects.toThrow('NORMATTIVA_NO_ARTICLE (1: idArticolo:140)');
  });
});

describe('the Italian list and chronicles', () => {
  it('cites each act the way Italy does', () => {
    expect(referenceOfUrn('urn:nir:stato:regio.decreto:1942-03-16;262')).toBe('R.D. 16 marzo 1942, n. 262');
    expect(referenceOfUrn('urn:nir:stato:decreto.legislativo:2005-09-06;206')).toBe('D.Lgs. 6 settembre 2005, n. 206');
    expect(referenceOfUrn('urn:nir:stato:decreto.del.presidente.della.repubblica:1988-09-22;447')).toBe('D.P.R. 22 settembre 1988, n. 447');
    expect(referenceOfUrn(null)).toBeNull();
  });

  it('puts the constitution first and names the country and the act in every chronicle', () => {
    const laws = italyLaws();
    expect(laws[0]).toMatchObject({ key: 'normattiva|it|047U0001', label: 'Costituzione della Repubblica Italiana' });
    expect(laws[0]!.reference).toBeUndefined();
    const penal = { ...laws.find((p) => p.name === '030U1398')!, snapshot: '2026-07-16' };
    expect(chronicleTitle(penal)).toBe('Codice penale (Italy, R.D. 19 ottobre 1930, n. 1398)');
    const [chronicle] = articleChronicles(penal, { header: 'Art. 1', content: 'Nessuno.', isSubstantive: true, topic: null, function: null });
    expect(chronicle).toContain('# Codice penale (Italy, R.D. 19 ottobre 1930, n. 1398) · Art. 1');
    expect(chronicle).toContain('Source: Normattiva');
    expect(chronicle).toContain('Text in force as of 2026-07-16.');
    expect(chronicle).toContain('check the text in force on normattiva.it');
  });
});

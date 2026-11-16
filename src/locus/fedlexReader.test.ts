import { describe, expect, it, vi } from 'vitest';
import { articleNumber, parseFedlexXml, parseVersion, readSwissLaw, sparqlUrl, versionQuery } from './fedlexReader';
import { isFedlexKey, loadSwissLaws, swissLangFor, swissLangOf } from './swissCatalogue';
import { featuredPlaces, FEATURED_MAX } from './featuredLaws';
import { chronicleTitle, sourceLine } from './articleText';
import { corpusOf } from './library';

// Shapes copied from the Civil Code (fr, version of 2026-07-01) and the
// Federal Constitution (de, 2024-03-03), doc 134 §16.17.
const XML = `<?xml version="1.0" encoding="UTF-8"?><akomaNtoso xmlns="http://docs.oasis-open.org/legaldocml/ns/akn/3.0" xmlns:fedlex="http://fedlex.admin.ch/"><act name="publicLaw"><preface><p class="title"><docTitle>Code civil suisse</docTitle></p></preface><body>
<title eId="tit_0"><num>Titre préliminaire</num><level eId="tit_0/lvl_A" fedlex:role="marginal"><num>A. </num><heading>Application de la loi</heading>
<article eId="art_1"><num><b>Art. 1</b></num><paragraph eId="art_1/para_1"><num>1</num><content><p>La loi régit toutes les matières.</p></content></paragraph><paragraph eId="art_1/para_2"><num>2</num><content><p>À défaut d’une disposition légale, le juge prononce.</p></content></paragraph></article></level>
<article eId="art_10"><num><b>Art. 10</b><authorialNote><p> Abrogé par l’annexe 1 ch. II 3 du CPC du 19 déc. 2008 (RO 2010 1739).</p></authorialNote></num></article></title>
<book eId="book_1"><num>Livre premier: </num><heading>Droit des personnes</heading><chapter eId="book_1/chap_1"><num>Chapitre I: </num><heading>De la personnalité<authorialNote><p>Nouvelle teneur selon le ch. I de la LF du 23 juin 2006.</p></authorialNote></heading>
<level eId="book_1/lvl_a" fedlex:role="marginal"><num>a. </num><heading>Actions</heading>
<article eId="art_28_a"><num><b>Art. 28</b><i>a</i></num><paragraph eId="art_28_a/para_1"><num>1</num><content><blockList><listIntroduction>Le demandeur peut requérir le juge:</listIntroduction><item><num>1. </num><p>d’interdire une atteinte illicite, si elle est imminente;</p></item><item><num>2. </num><p>de la faire cesser, si elle dure encore.</p></item></blockList></content></paragraph></article>
<article eId="art_29"><num><b>Art. 29</b></num><paragraph><content><p>Abrogé</p></content></paragraph></article>
</level></chapter></book>
<chapter eId="chap_2"><num>2. Kapitel:</num><heading>Grundrechte</heading><article eId="art_8"><num><b>Art. 8</b></num><heading>Rechtsgleichheit</heading><paragraph><num>1</num><content><p>Alle Menschen sind vor dem Gesetz gleich.</p></content></paragraph></article></chapter>
</body></act></akomaNtoso>`;

describe('parseFedlexXml', () => {
  it('reads each article with its marginal note or own heading, its paragraphs and the headings above it', () => {
    const law = parseFedlexXml(XML);
    expect(law.title).toBe('Code civil suisse');
    expect(law.articles.map((a) => a.header)).toEqual(['Art. 1', 'Art. 28a', 'Art. 8']);
    expect(law.articles[0]).toMatchObject({
      topic: 'Titre préliminaire',
      content: '(Application de la loi)\n\n1 La loi régit toutes les matières.\n\n2 À défaut d’une disposition légale, le juge prononce.',
    });
    expect(law.articles[1]).toMatchObject({
      topic: 'Livre premier: Droit des personnes › Chapitre I: De la personnalité',
      content: '(Actions)\n\n1 Le demandeur peut requérir le juge:\n\n1. d’interdire une atteinte illicite, si elle est imminente;\n\n2. de la faire cesser, si elle dure encore.',
    });
    expect(law.articles[2]).toMatchObject({ topic: '2. Kapitel: Grundrechte', content: '(Rechtsgleichheit)\n\n1 Alle Menschen sind vor dem Gesetz gleich.' });
  });

  it('skips repealed articles and never keeps a footnote', () => {
    const law = parseFedlexXml(XML);
    expect(law.repealed).toBe(2);
    const all = law.articles.map((a) => `${a.header} ${a.topic} ${a.content}`).join(' ');
    for (const gone of ['RO 2010', 'Nouvelle teneur', 'Art. 10', 'Art. 29']) expect(all).not.toContain(gone);
  });

  it('refuses a file that is not a law', () => {
    expect(() => parseFedlexXml('<akomaNtoso><act></act></akomaNtoso>')).toThrow('FEDLEX_EMPTY_TEXT');
  });

  it('writes a lettered article the way it is cited', () => {
    expect(articleNumber('Art. 62 a')).toBe('Art. 62a');
    expect(articleNumber(' Art.  336 c ')).toBe('Art. 336c');
    expect(articleNumber('Art. 3 à 6')).toBe('Art. 3 à 6');
    // Shapes written by the source itself (Criminal Code, Road Traffic Act).
    expect(articleNumber('Art . 264 a')).toBe('Art. 264a');
    expect(articleNumber('Art 89 d')).toBe('Art. 89d');
  });

  // Shapes copied from the Civil Code (art. 43a, Titre final) and the Constitution (art. 197).
  const MORE = `<akomaNtoso xmlns="http://docs.oasis-open.org/legaldocml/ns/akn/3.0"><act><body>
<article eId="art_43_a"><num><b>Art. 4</b><b>3</b><i>a</i></num><paragraph><num>1</num><content><p>Le Conseil fédéral assure la protection de la per<i>son</i>nalité.</p></content></paragraph></article>
<article eId="art_197"><num><b>Art. 197</b></num><heading>Dispositions transitoires<authorialNote><p>Accepté en votation populaire.</p></authorialNote></heading><subdivision eId="art_197/subdiv_u1"><heading>Adhésion de la Suisse à l’ONU</heading><paragraph><num>1</num><content><p>La Suisse adhère à l’ONU.</p></content></paragraph></subdivision></article>
<proviso eId="disp_u1"><heading>Titre final: De l’entrée en vigueur et de l’application du code civil</heading><chapter eId="disp_u1/chap_1"><num>Chapitre I:</num><heading>Dispositions générales</heading>
<article eId="disp_u1/art_1"><num><b>Art. 1</b></num><paragraph><num>1</num><content><p>Les effets juridiques de faits antérieurs restent régis par l’ancien droit.</p></content></paragraph></article></chapter></proviso>
</body></act></akomaNtoso>`;

  it('joins a number split over inline marks, and never splits a word', () => {
    const a = parseFedlexXml(MORE).articles[0]!;
    expect(a.header).toBe('Art. 43a');
    expect(a.content).toBe('1 Le Conseil fédéral assure la protection de la personnalité.');
  });

  it('reads the blocks of an article split in subdivisions, each with its heading', () => {
    const law = parseFedlexXml(MORE);
    expect(law.repealed).toBe(0);
    expect(law.articles[1]).toMatchObject({ header: 'Art. 197', content: '(Dispositions transitoires)\n\n(Adhésion de la Suisse à l’ONU)\n\n1 La Suisse adhère à l’ONU.' });
  });

  it('names the final title in the header of its articles: their numbers start again at 1', () => {
    const law = parseFedlexXml(MORE);
    expect(law.articles[2]).toMatchObject({ header: 'Art. 1 (Titre final)', topic: 'Titre final: De l’entrée en vigueur et de l’application du code civil › Chapitre I: Dispositions générales' });
  });
});

describe('the version that applies today', () => {
  const IN_FORCE = { value: 'https://fedlex.data.admin.ch/vocabulary/enforcement-status/0' };
  const FILE = 'https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/eli/cc/24/233_245_233/20260701/fr/xml/x.xml';

  it('asks for the latest version on or before today, in the language asked, as XML', () => {
    const q = versionQuery('cc/24/233_245_233', 'fr', '2026-11-10');
    // The Civil Code has a version for 2027-01-01: without this filter it would be read.
    expect(q).toContain('FILTER(?date <= "2026-11-10"^^xsd:date)');
    expect(q).toContain('ORDER BY DESC(?date) LIMIT 1');
    expect(q).toContain('language/FRA');
    expect(sparqlUrl(q)).toMatch(/^https:\/\/fedlex\.data\.admin\.ch\/sparqlendpoint\?query=.+&format=application%2Fsparql-results%2Bjson$/);
  });

  it('refuses an ELI or a date that would change the query', () => {
    expect(() => versionQuery('cc/1> } DROP', 'fr', '2026-11-10')).toThrow('FEDLEX_BAD_ELI');
    expect(() => versionQuery('cc/1999/404', 'fr', '2026-11-10" ')).toThrow('FEDLEX_BAD_DATE');
  });

  it('refuses a law no longer in force, no version, and a file outside Fedlex', () => {
    expect(parseVersion({ results: { bindings: [{ status: IN_FORCE, date: { value: '2026-07-01' }, file: { value: FILE } }] } })).toEqual({ date: '2026-07-01', file: FILE });
    expect(() => parseVersion({ results: { bindings: [{ status: { value: 'https://fedlex.data.admin.ch/vocabulary/enforcement-status/3' }, date: { value: '2020-01-01' }, file: { value: FILE } }] } })).toThrow('FEDLEX_NOT_IN_FORCE');
    expect(() => parseVersion({ results: { bindings: [] } })).toThrow('FEDLEX_NO_VERSION');
    expect(() => parseVersion({ results: { bindings: [{ status: IN_FORCE, date: { value: '2026-07-01' }, file: { value: 'https://evil.example/x.xml' } }] } })).toThrow('FEDLEX_NO_VERSION');
  });

  it('reads the law from the file the answer names, and says which version it is', async () => {
    const fetchJson = vi.fn(async () => ({ results: { bindings: [{ status: IN_FORCE, date: { value: '2026-07-01' }, file: { value: FILE } }] } }));
    const fetchText = vi.fn(async () => XML);
    const law = await readSwissLaw(fetchJson, fetchText, 'cc/24/233_245_233', 'fr', { today: '2026-11-10' });
    expect(fetchText).toHaveBeenCalledWith(FILE, undefined);
    expect(law.version).toBe('2026-07-01');
    expect(law.articles).toHaveLength(3);
  });
});

describe('Switzerland in the cartridge', () => {
  it('ships 39 laws in three languages, the constitution first, cited by their SR number', async () => {
    const laws = await loadSwissLaws();
    expect(laws.length).toBe(39 * 3);
    expect(laws[0]).toMatchObject({ state: 'ch', folder: 'fr', name: 'cc/1999/404', reference: 'RS 101, Cst.' });
    const zgb = laws.find((p) => p.name === 'cc/24/233_245_233' && p.folder === 'de');
    expect(zgb).toMatchObject({ label: 'Schweizerisches Zivilgesetzbuch vom 10. Dezember 1907', reference: 'SR 210, ZGB' });
    expect(laws.every((p) => isFedlexKey(p.key) && /^cc\/[\w/]+$/.test(p.name))).toBe(true);
    expect(swissLangOf(zgb!)).toBe('de');
    // The new data protection act (2023), never the repealed one of 1992.
    expect(laws.find((p) => p.reference?.startsWith('RS 235.1'))?.name).toBe('cc/2022/491');
  });

  it('shows its tiles in the app\'s language, German when Switzerland has no text in it', async () => {
    const laws = await loadSwissLaws();
    const fr = featuredPlaces(laws, 'ch', 'fr');
    expect(fr).toHaveLength(FEATURED_MAX);
    expect(fr.every((p) => p.folder === 'fr')).toBe(true);
    expect(fr.map((p) => p.label).slice(0, 2)).toEqual(['Constitution fédérale de la Confédération suisse du 18 avril 1999', 'Code civil suisse du 10 décembre 1907']);
    expect(swissLangFor('en')).toBe('de');
    expect(featuredPlaces(laws, 'ch', 'es').every((p) => p.folder === 'de')).toBe(true);
  });

  it('says in each chronicle which country, which law and which source', async () => {
    const zgb = { ...(await loadSwissLaws()).find((p) => p.name === 'cc/24/233_245_233' && p.folder === 'fr')!, snapshot: '2026-07-01' };
    expect(chronicleTitle(zgb)).toBe('Code civil suisse du 10 décembre 1907 (Switzerland, RS 210, CC)');
    const line = sourceLine(zgb, { header: 'Art. 1', content: '', isSubstantive: true, topic: null, function: null });
    expect(line).toContain('Fedlex');
    expect(line).toContain('Version in force on 2026-07-01');
    expect(line).not.toContain('Legalize');
    expect(corpusOf(zgb)).toMatchObject({ corpus: 'fedlex-2026-07-01' });
  });
});

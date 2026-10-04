import { describe, it, expect, vi } from 'vitest';
import { articleHeading, legalizeFileUrl, parseLegalizeFile, inlineArticles, readLegalizeLaw, referenceOf, reflow, splitArticles } from './legalizeReader';
import { legalizeLaws } from './legalizeCatalogue';
import { articleChronicles, articleRef, chronicleTitle } from './articleText';
import { countryOf } from '../ui/types';

// Shapes copied from the real files, 2026-10-03 (doc 134 §16.2).
const CO = [
  '---',
  'title: "Por la cual se expide el Codigo Penal"',
  'identifier: "LEY-599-2000"',
  'rank: "ley"',
  'last_updated: "2026-07-30"',
  'status: "in_force"',
  'source: "https://www.suin-juriscol.gov.co/viewDocument.asp?id=1663230"',
  'code_name: "CODIGO PENAL"',
  'modification_summary: "Modificado [Artículo 21 LEY 1121 de 2006](https://x) · Derogado [Artículo 9](https://y)"',
  '---',
  '# Por la cual se expide el Codigo Penal',
  '',
  'El Congreso de Colombia',
  '',
  '## **LIBRO PRIMERO**',
  '## **TITULO I**',
  '### **CAPITULO UNICO**',
  '##### **Artículo 1º.***Dignidad humana*. El derecho penal tendrá como fundamento el respeto a la dignidad humana.',
  '##### **Artículo 38 A. Derogado**',
  '##### **Artículo 38-H.Prestación de servicios de utilidad pública.** El juez podrá sustituir la pena.',
  '',
  'Segundo párrafo del 38-H.',
  '##### **Artículo 269-1.** Delitos contra el Patrimonio Cultural Sumergido.',
  '##### **Artículo 319 2.Inexequible Decreto 126 de 2010.**',
].join('\n');

describe('parseLegalizeFile', () => {
  it('keeps the fields MnemoLaw reads and never the huge reform list', () => {
    const { meta, body } = parseLegalizeFile(CO);
    expect(meta).toMatchObject({ identifier: 'LEY-599-2000', status: 'in_force', codeName: 'CODIGO PENAL', lastUpdated: '2026-07-30' });
    expect(JSON.stringify(meta)).not.toContain('Modificado');
    expect(body.startsWith('# Por la cual')).toBe(true);
  });

  it('reads a file with Windows line ends the same way', () => {
    const { meta } = parseLegalizeFile(CO.replace(/\n/g, '\r\n'));
    expect(meta.status).toBe('in_force');
  });
});

describe('articleHeading', () => {
  it('reads the article number with each suffix spelling of the Código Penal', () => {
    expect(articleHeading('**Artículo 38 A. Derogado**')?.label).toBe('Artículo 38-A');
    expect(articleHeading('**Artículo 38G.** La ejecución')?.label).toBe('Artículo 38-G');
    expect(articleHeading('**Artículo 38-H.Prestación**')?.label).toBe('Artículo 38-H');
    expect(articleHeading('**Artículo 38- L. Control**')?.label).toBe('Artículo 38-L');
    expect(articleHeading('**Artículo 38-Ñ. Extinción**')?.label).toBe('Artículo 38-Ñ');
    expect(articleHeading('**Artículo 269-1.** Delitos')?.label).toBe('Artículo 269-1');
    expect(articleHeading('**Artículo 319 2.Inexequible**')?.label).toBe('Artículo 319-2');
    expect(articleHeading('**Artículo 178-A:** Declarado')?.label).toBe('Artículo 178-A');
  });

  it('reads `1º.` and `1o.` as the ordinal of article 1, and capitals as the same article', () => {
    expect(articleHeading('**Artículo 1º.***Dignidad*')?.label).toBe('Artículo 1');
    expect(articleHeading('Artículo 1o. Objeto')?.label).toBe('Artículo 1');
    expect(articleHeading('ARTICULO 10.- Abuso del derecho.')?.label).toBe('Artículo 10');
    expect(articleHeading('Artículo 1.')?.label).toBe('Artículo 1');
  });

  it('keeps the text written on the heading line', () => {
    expect(articleHeading('**Artículo 1º.***Dignidad humana*. El derecho penal')?.rest).toBe('Dignidad humana. El derecho penal');
  });

  it('reads Spain\'s bare heading and Argentina\'s em dash and ordinals', () => {
    expect(articleHeading('Artículo 1')).toMatchObject({ label: 'Artículo 1', rest: '' });
    expect(articleHeading('**ARTICULO 1° —** Apruébase el')).toMatchObject({ label: 'Artículo 1', rest: 'Apruébase el' });
    expect(articleHeading('ARTICULO 8º bis: Trato digno.')).toMatchObject({ label: 'Artículo 8 bis', rest: 'Trato digno.' });
    expect(articleHeading('Art. 2.° - Si la ley vigente')).toMatchObject({ label: 'Art. 2', rest: 'Si la ley vigente' });
  });

  it('reads Portugal\'s `ARTIGO 1.º — (title)` and its letter after the ordinal, as `Art.`', () => {
    expect(articleHeading('ARTIGO 1.º — (Aprovação do Orçamento)')).toMatchObject({ label: 'Art. 1', rest: '(Aprovação do Orçamento)' });
    expect(articleHeading('Artigo 5.º-A — (Regime transitório)')).toMatchObject({ label: 'Art. 5-A', rest: '(Regime transitório)' });
    expect(articleHeading('Artigo 12.º')?.label).toBe('Art. 12');
  });

  it('refuses a sentence cut at a line break (Argentina\'s preamble) and a section heading', () => {
    expect(articleHeading('artículo 14')).toBeNull();
    expect(articleHeading('artículo 11— y III —con excepción de los párrafos')).toBeNull();
    expect(articleHeading('**TITULO I**')).toBeNull();
    expect(articleHeading('CAPÍTULO I. Fuentes del derecho')).toBeNull();
  });
});

describe('splitArticles', () => {
  it('cuts the body into articles with their section path, in order', () => {
    const arts = splitArticles(parseLegalizeFile(CO).body);
    expect(arts.map((a) => a.header)).toEqual(['Artículo 1', 'Artículo 38-A', 'Artículo 38-H', 'Artículo 269-1', 'Artículo 319-2']);
    // LIBRO and TITULO share a level in the Colombian files, so the second replaces the first.
    expect(arts[0]).toMatchObject({ topic: 'TITULO I › CAPITULO UNICO', content: 'Dignidad humana. El derecho penal tendrá como fundamento el respeto a la dignidad humana.' });
    expect(arts[2]!.content).toBe('Prestación de servicios de utilidad pública. El juez podrá sustituir la pena.\n\nSegundo párrafo del 38-H.');
  });

  it('keeps a real preamble as an article of its own, never a short title line', () => {
    const long = `# Constitución\n\nEL PUEBLO DE COLOMBIA, ${'en ejercicio de su poder soberano '.repeat(8)}\n\n##### **Artículo 1.** Colombia es un Estado.`;
    expect(splitArticles(long).map((a) => a.header)).toEqual(['Preámbulo', 'Artículo 1']);
    expect(splitArticles(CO.split('---\n')[2]!).map((a) => a.header)[0]).toBe('Artículo 1');
  });

  it('opens an article on Argentina\'s bold or bare line, never on a wrapped sentence', () => {
    const body = [
      '**ARTICULO 1° —** Apruébase el', '', 'código que integra esta ley.', '',
      'lo que dispone el', '', 'ARTICULO 11 DE LA LEY 22.021 y el', '',
      'conforme al', '', 'Artículo 14. Además, el plazo', '',
      'ARTICULO 2º.- Comuníquese.',
    ].join('\n');
    const arts = splitArticles(body);
    expect(arts.map((a) => a.header)).toEqual(['Artículo 1', 'Artículo 2']);
    // The wrapped pieces are joined back into one paragraph.
    expect(arts[0]!.content.startsWith('Apruébase el código que integra esta ley.')).toBe(true);
  });

  it('makes Spain\'s additional and final provisions units of their own', () => {
    const body = '###### Artículo 1.\n\nTexto.\n\n###### Disposición adicional primera. Plazos.\n\nTexto de la disposición.';
    expect(splitArticles(body).map((a) => a.header)).toEqual(['Artículo 1', 'Disposición adicional primera. Plazos']);
  });

  it('leaves a list item on its own line', () => {
    expect(reflow('son los siguientes\n\na) el primero')).toBe('son los siguientes\n\na) el primero');
    expect(reflow('por voluntad y\n\nelección de las provincias')).toBe('por voluntad y elección de las provincias');
  });

  it('reads a UK section by its number alone, and a schedule\'s paragraphs as such', () => {
    const body = [
      '# Theft Act 1968', '', '### Definition of “theft”', '', '#### Basic definition of theft', '', '##### 1', '',
      '- (1) A person is guilty of theft if he dishonestly appropriates property.[^c1]', '',
      '##### 4A', '', 'Text of 4A.', '', '## SCHEDULE 1', '', '##### 1', '', 'First paragraph of the schedule.', '',
      '[^c1]: Act amended by the Magistrates’ Courts Act 1980.',
    ].join('\n');
    const arts = splitArticles(body);
    expect(arts.map((a) => a.header)).toEqual(['Section 1', 'Section 4A', 'Schedule 1, paragraph 1']);
    expect(arts[0]).toMatchObject({ topic: 'Definition of “theft” › Basic definition of theft', content: '- (1) A person is guilty of theft if he dishonestly appropriates property.' });
    expect(arts.map((a) => a.content).join(' ')).not.toContain('Magistrates');
  });

  it('keeps an annex under its own heading, and drops a heading that holds only reform notices', () => {
    const annex = `El titular de un permiso ${'sancionado en firme '.repeat(15)}`;
    const body = [
      '###### Artículo 1.', '', 'Texto.', '',
      '### CAPÍTULO II. Consejo', '', '> <small>Se modifica el título por la Ley 9/2025.</small>', '',
      '## ANEXO II. Infracciones', '', annex,
    ].join('\n');
    const arts = splitArticles(body);
    expect(arts.map((a) => a.header)).toEqual(['Artículo 1', 'ANEXO II. Infracciones']);
    expect(arts[1]!.content).toBe(annex.trim());
  });

  it('reads Argentina\'s headings made of wrapped sentences as text of the article', () => {
    const body = [
      '##### ARTICULO 5º.- Las disposiciones de esta', '', '##### Sección se aplican durante el tiempo', '',
      'la descarga, al transporte de cosas.', '', '### TITULO II', '', '##### ARTICULO 6º.- Otro.',
    ].join('\n');
    expect(splitArticles(body, { country: 'ar' }).map((a) => a.header)).toEqual(['Artículo 5', 'Artículo 6']);
    expect(splitArticles(body, { country: 'ar' })[0]!.content).toContain('Sección se aplican durante el tiempo la descarga');
  });

  it('writes an article repeated word for word only once', () => {
    const once = '###### Artículo 1.\n\nTexto uno.\n\n###### Artículo 2.\n\nTexto dos.';
    expect(splitArticles(`${once}\n\n${once}\n\n###### Artículo 1.\n\nOtro texto.`).map((a) => a.content))
      .toEqual(['Texto uno.', 'Texto dos.', 'Otro texto.']);
  });

  it('leaves out the notice Legalize puts under the title', () => {
    const body = `# Ley\n\n> **This file always contains the latest consolidated text published by the source.\n> It is not the text as it stood.**\n\n${'x '.repeat(150)}\n\n###### Artículo 1.\n\nTexto.`;
    expect(splitArticles(body)[0]!.content).not.toContain('This file always');
  });
});

describe('readLegalizeLaw', () => {
  const unit = { state: 'co', folder: 'co/LEY-599-2000.md' };

  it('reads the file from the country repository', async () => {
    const fetchText = vi.fn(async () => CO);
    const res = await readLegalizeLaw(fetchText, unit);
    expect(fetchText).toHaveBeenCalledWith('https://raw.githubusercontent.com/legalize-dev/legalize-co/main/co/LEY-599-2000.md', undefined);
    expect(res.articles).toHaveLength(5);
    expect(res.meta.lastUpdated).toBe('2026-07-30');
  });

  it('refuses a law the live file says is repealed, whatever the shipped list said', async () => {
    const repealed = CO.replace('status: "in_force"', 'status: "repealed"');
    await expect(readLegalizeLaw(async () => repealed, unit)).rejects.toThrow('LEGALIZE_NOT_IN_FORCE (repealed)');
  });

  it('refuses a law published as enacted: its amendments are not in the text', async () => {
    const enacted = CO.replace('status: "in_force"', 'status: "in_force"\ntext_state: "as_enacted"');
    await expect(readLegalizeLaw(async () => enacted, unit)).rejects.toThrow('LEGALIZE_AS_ENACTED');
  });

  it('refuses a file with no article rather than importing an empty law', async () => {
    const empty = CO.split('# Por la cual')[0]! + '# Bürgerliches Gesetzbuch\n';
    await expect(readLegalizeLaw(async () => empty, unit)).rejects.toThrow('LEGALIZE_EMPTY_TEXT');
  });

  it('encodes a file name with a non-ASCII letter (German file names carry umlauts)', () => {
    expect(legalizeFileUrl('de', 'de/ÖZV.md')).toBe('https://raw.githubusercontent.com/legalize-dev/legalize-de/main/de/%C3%96ZV.md');
  });
});

describe('a Colombian law through the catalogue and the chronicles', () => {
  const penal = legalizeLaws('co').find((p) => p.name === 'LEY-599-2000')!;

  it('the shipped list holds the constitution first and the penal code with its reference', () => {
    const laws = legalizeLaws('co');
    expect(laws[0]!.label).toBe('Constitución Política de 1991');
    expect(penal).toMatchObject({ key: 'legalize|co|LEY-599-2000', type: 'code', state: 'co', label: 'Código Penal', reference: 'Ley 599 de 2000' });
    expect(legalizeLaws('zz')).toEqual([]);
  });

  it('belongs to Colombia, not to France, on the home screen', () => {
    expect(countryOf(penal)).toBe('co');
    expect(countryOf({ type: 'code', state: 'fr' })).toBe('fr');
    expect(countryOf({ type: 'cities', state: 'tx' })).toBe('us');
  });

  it('a chronicle names the country and the law, and where to check it', () => {
    expect(chronicleTitle(penal)).toBe('Código Penal (Colombia, Ley 599 de 2000)');
    const [body] = articleChronicles(penal, { header: 'Artículo 1', content: 'Dignidad humana.', isSubstantive: true, topic: null, function: null });
    expect(body).toMatch(/^# Código Penal \(Colombia, Ley 599 de 2000\) · Artículo 1\n/);
    expect(body).toContain('SUIN-Juriscol');
    expect(body).toContain('Not an official text: check the text in force on suin-juriscol.gov.co.');
    expect(articleRef(penal, 3)).toBe('legalize:legalize|co|LEY-599-2000#3');
  });
});

describe('Spain and Argentina', () => {
  it('cite each law the way its country does', () => {
    expect(referenceOf('LEY-26994')).toBe('Ley 26.994');
    expect(referenceOf('LEY-1919')).toBe('Ley 1.919');
    expect(referenceOf('DEC-118-2019')).toBe('Decreto 118/2019');
    expect(referenceOf('DNU-70-2023')).toBe('DNU 70/2023');
    expect(referenceOf('BOE-A-1995-25444', 'Ley Orgánica 10/1995, de 23 de noviembre, del Código Penal')).toBe('Ley Orgánica 10/1995');
    expect(referenceOf('BOE-A-1889-4763', 'Real Decreto de 24 de julio de 1889 por el que se publica el Código Civil')).toBe('Real Decreto de 24 de julio de 1889');
    expect(referenceOf('BOE-A-1978-31229', 'Constitución Española')).toBeNull();
  });

  it('show no reform date that Argentina does not know', () => {
    const file = (country: string, date: string) => `---\ncountry: "${country}"\nlast_updated: "${date}"\n---\n`;
    expect(parseLegalizeFile(file('ar', '1921-11-03')).meta.lastUpdated).toBeNull();
    expect(parseLegalizeFile(file('es', '1900-01-01')).meta.lastUpdated).toBeNull();
    expect(parseLegalizeFile(file('es', '2026-04-09')).meta.lastUpdated).toBe('2026-04-09');
  });

  it('ship their lists with the constitution first', () => {
    expect(legalizeLaws('es')[0]).toMatchObject({ label: 'Constitución Española', state: 'es' });
    expect(legalizeLaws('ar')[0]).toMatchObject({ label: 'Constitución de la Nación Argentina', reference: 'Ley 24.430' });
    expect(legalizeLaws('es').find((p) => p.label === 'Código Penal')?.reference).toBe('Ley Orgánica 10/1995');
  });
});

describe('the United Kingdom', () => {
  it('reads a repeal from the title, the only place the UK says it', () => {
    const file = (title: string) => `---\ntitle: "${title}"\ncountry: "uk"\nstatus: "in_force"\n---\n`;
    expect(parseLegalizeFile(file('Fireworks Act 1964 (repealed)')).meta.status).toBe('repealed');
    expect(parseLegalizeFile(file('Theft Act 1968')).meta.status).toBe('in_force');
  });

  it('leaves out a repealed section, whose text is dots', () => {
    const body = '##### 1\n\n. . . . . . . . . . . .\n\n##### 2\n\nA live section.';
    expect(splitArticles(body).map((a) => a.header)).toEqual(['Section 2']);
  });

  it('cites an Act by its year and chapter', () => {
    expect(referenceOf('ukpga-1968-60')).toBe('1968 c. 60');
  });
});

describe('Portugal', () => {
  it('ships its list with the constitution first and the reference from the title', () => {
    const laws = legalizeLaws('pt');
    expect(laws[0]).toMatchObject({ label: 'Constituição da República Portuguesa', state: 'pt' });
    expect(laws.find((p) => p.label === 'Código do Trabalho')?.reference).toBe('Lei n.º 7/2009');
    expect(referenceOf('DRE-2009-7-602073', 'Lei n.º 7/2009 — Código do Trabalho')).toBe('Lei n.º 7/2009');
  });
});

describe('the European Union', () => {
  it('reads `Article N` with its title on the heading below it', () => {
    const body = '## CHAPTER I\n\n#### Article 17\n\n##### Right to erasure\n\nThe data subject shall have the right.\n\n#### Article 18\n\nText.';
    const arts = splitArticles(body, { country: 'eu' });
    expect(arts.map((a) => a.header)).toEqual(['Art. 17', 'Art. 18']);
    expect(arts[0]!.content).toBe('(Right to erasure)\n\nThe data subject shall have the right.');
  });

  it('reads the articles of a regulation stored as one line, never a mention in the text', () => {
    const line = `Official Journal L 046.${' Having regard to the Treaty, and in particular Article 80(2) thereof,'.repeat(4)}`
      + 'Article 1Subject1. This Regulation establishes minimum rights, see Article 3(1).'
      + 'Article 2DefinitionsFor the purposes of this Regulation, as Article 7 says.'
      + 'Article 3ScopeIt applies.';
    expect(inlineArticles(line).map((a) => a.header)).toEqual(['Preámbulo', 'Art. 1', 'Art. 2', 'Art. 3']);
    expect(inlineArticles(line)[2]!.content).toBe('DefinitionsFor the purposes of this Regulation, as Article 7 says.');
    expect(splitArticles(line, { country: 'eu' }).map((a) => a.header)).toContain('Art. 3');
    expect(splitArticles(line).map((a) => a.header)).toEqual(['Preámbulo']);
  });

  it('keeps the order 1, 2, 3: a glued mention out of order is text', () => {
    const line = `${'Having regard to the Treaty establishing the Community, '.repeat(4)}and to Article 5Whereas it says so.`
      + 'Article 1SubjectText one.Article 2ScopeText two.';
    expect(inlineArticles(line).map((a) => a.header)).toEqual(['Preámbulo', 'Art. 1', 'Art. 2']);
  });

  it('leaves `ARTICLE 22` a section heading outside the EU (a convention in a UK schedule)', () => {
    const body = '## SCHEDULE 1\n\n### ARTICLE 22\n\n##### 1\n\nThe premises of the mission shall be inviolable.';
    expect(splitArticles(body).map((a) => a.header)).toEqual(['Schedule 1, paragraph 1']);
    expect(splitArticles(body)[0]!.topic).toBe('SCHEDULE 1 › ARTICLE 22');
  });

  it('cites a regulation by the start of its title', () => {
    expect(referenceOf('32016R0679', 'Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection…')).toBe('Regulation (EU) 2016/679');
  });
});

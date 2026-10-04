import { describe, expect, it, vi } from 'vitest';
import { canadaActUrl, parseCanadaAct, readCanadaAct } from './justiceCanadaReader';

// Shapes copied from the Criminal Code of 2026-10-03 (doc 134 §16.12).
const ACT = `<?xml version="1.0" encoding="utf-8"?><Statute xmlns:lims="http://justice.gc.ca/lims"><Identification><ShortTitle>Criminal Code</ShortTitle></Identification><Body>
<Heading level="1"><TitleText>Interpretation</TitleText></Heading>
<Section lims:id="1"><MarginalNote>Short title</MarginalNote><Label>1</Label><Text>This Act may be cited as the <XRefExternal>Criminal Code</XRefExternal>.</Text><HistoricalNote><HistoricalNoteSubItem>R.S., c. C-34, s. 1</HistoricalNoteSubItem></HistoricalNote></Section>
<Heading level="1"><TitleText>Part VIII</TitleText></Heading><Heading level="2"><TitleText>Assaults</TitleText></Heading>
<Section><Label>36</Label><Text><Repealed>[Repealed, 2012, c. 9, s. 2]</Repealed></Text></Section>
<Section><MarginalNote>Assault</MarginalNote><Label>265</Label><Subsection><Label>(1)</Label><Text>A person commits an assault when</Text><Paragraph><Label>(a)</Label><Text>without the consent of another person, he applies force;</Text></Paragraph></Subsection><Subsection><MarginalNote>Application</MarginalNote><Label>(2)</Label><Text>This section applies to all forms of assault.</Text></Subsection><RelatedOrNotInForce><Text>Not in force yet.</Text></RelatedOrNotInForce></Section>
</Body><Schedule><Text>Form 1</Text></Schedule></Statute>`;

describe('parseCanadaAct', () => {
  it('reads each section with its marginal note, its parts and the headings above it', () => {
    const act = parseCanadaAct(ACT, 'eng');
    expect(act.title).toBe('Criminal Code');
    expect(act.articles.map((a) => a.header)).toEqual(['Section 1', 'Section 265']);
    expect(act.articles[1]).toMatchObject({
      topic: 'Part VIII › Assaults',
      content: '(Assault)\n\n(1) A person commits an assault when\n\n(a) without the consent of another person, he applies force;\n\n(2) This section applies to all forms of assault.',
    });
  });

  it('leaves out repealed sections, amendment history, text not in force and schedules', () => {
    const act = parseCanadaAct(ACT, 'eng');
    expect(act.repealed).toBe(1);
    const all = act.articles.map((a) => a.content).join(' ');
    for (const gone of ['R.S., c. C-34', 'Not in force yet', 'Form 1']) expect(all).not.toContain(gone);
  });

  it('labels a French section as an article, and reads the French repeal notice', () => {
    const fra = parseCanadaAct(ACT.replace('Criminal Code</ShortTitle>', 'Code criminel</ShortTitle>').replace('[Repealed, 2012', '[Abrogé, 2012'), 'fra');
    expect(fra.articles[0]!.header).toBe('Art. 1');
    // `\b` would miss it: in a JavaScript regex `é` is not a word character.
    expect(fra.repealed).toBe(1);
  });
});

describe('readCanadaAct', () => {
  it('reads the Act in the asked language from Justice Canada\'s repository', async () => {
    const fetchText = vi.fn(async () => ACT);
    const act = await readCanadaAct(fetchText, 'fra', 'C-46');
    expect(fetchText).toHaveBeenCalledWith('https://raw.githubusercontent.com/justicecanada/laws-lois-xml/main/fra/lois/C-46.xml', undefined);
    expect(act.articles).toHaveLength(2);
    expect(canadaActUrl('eng', 'I-2.5')).toBe('https://raw.githubusercontent.com/justicecanada/laws-lois-xml/main/eng/acts/I-2.5.xml');
  });

  it('refuses an Act with no section in force', async () => {
    const empty = ACT.replace(/<Section>[\s\S]*<\/Section>/, '').replace(/<Section lims:id="1">[\s\S]*?<\/Section>/, '');
    await expect(readCanadaAct(async () => empty, 'eng', 'X-1')).rejects.toThrow('CANADA_EMPTY_TEXT');
  });
});

describe('the Canadian list and chronicles', () => {
  it('lists every Act in both languages and names the country and the Act in each chronicle', async () => {
    const { loadCanadaLaws } = await import('./canadaCatalogue');
    const { articleChronicles } = await import('./articleText');
    const laws = await loadCanadaLaws();
    const fr = laws.find((p) => p.key === 'justice|ca|fra|C-46')!;
    expect(fr).toMatchObject({ label: 'Code criminel', folder: 'fra', state: 'ca' });
    expect(laws.find((p) => p.key === 'justice|ca|eng|C-46')?.label).toBe('Criminal Code');
    const [chronicle] = articleChronicles(fr, { header: 'Art. 265', content: 'Voies de fait.', isSubstantive: true, topic: null, function: null });
    expect(chronicle).toContain('# Code criminel (Canada, C-46) · Art. 265');
    expect(chronicle).toContain('Source: Justice Laws Website');
    expect(chronicle).toContain('check the text in force on laws-lois.justice.gc.ca');
  });
});

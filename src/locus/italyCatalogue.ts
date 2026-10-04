/**
 * italyCatalogue — the Italian codes MnemoLaw offers (doc 134 §16.9), read
 * from Normattiva's "Codici" collection and its constitution route.
 *
 * Picked by hand from the 40 acts of the collection, measured 2026-10-03:
 *  - left out, repealed as a whole: the public-contracts codes of 2006 and
 *    2016 (Normattiva still serves them, every article marked repealed);
 *  - left out, unreadable as articles: the tourism code (011G0123), whose
 *    whole text sits in one annex;
 *  - left out, implementing regulations and the postal consolidated text,
 *    beside the codes they serve. The implementing provisions of the three
 *    great codes stay: a judge applies them with the code.
 * The labels are written here: an act's own title names its decree
 * (`Approvazione del testo del Codice civile.`), not the code.
 */
import type { LocusPlace } from './locusReader';
import { CONSTITUTION_ID, referenceOfUrn } from './normattivaReader';

interface ItalyEntry { id: string; label: string; urn: string }

const ENTRIES: ItalyEntry[] = [
  { id: CONSTITUTION_ID, label: 'Costituzione della Repubblica Italiana', urn: 'urn:nir:stato:costituzione:1947-12-27;0' },
  { id: '042U0262', label: 'Codice civile', urn: 'urn:nir:stato:regio.decreto:1942-03-16;262' },
  { id: '030U1398', label: 'Codice penale', urn: 'urn:nir:stato:regio.decreto:1930-10-19;1398' },
  { id: '040U1443', label: 'Codice di procedura civile', urn: 'urn:nir:stato:regio.decreto:1940-10-28;1443' },
  { id: '088G0492', label: 'Codice di procedura penale', urn: 'urn:nir:stato:decreto.del.presidente.della.repubblica:1988-09-22;447' },
  { id: '042U0318', label: 'Disposizioni di attuazione del Codice civile', urn: 'urn:nir:stato:regio.decreto:1942-03-30;318' },
  { id: '041U1368', label: 'Disposizioni di attuazione del Codice di procedura civile', urn: 'urn:nir:stato:regio.decreto:1941-12-18;1368' },
  { id: '089G0340', label: 'Disposizioni di attuazione del Codice di procedura penale', urn: 'urn:nir:stato:decreto.legislativo:1989-07-28;271' },
  { id: '005G0232', label: 'Codice del consumo', urn: 'urn:nir:stato:decreto.legislativo:2005-09-06;206' },
  { id: '092G0306', label: 'Codice della strada', urn: 'urn:nir:stato:decreto.legislativo:1992-04-30;285' },
  { id: '003G0218', label: 'Codice in materia di protezione dei dati personali', urn: 'urn:nir:stato:decreto.legislativo:2003-06-30;196' },
  { id: '23G00044', label: 'Codice dei contratti pubblici', urn: 'urn:nir:stato:decreto.legislativo:2023-03-31;36' },
  { id: '19G00007', label: "Codice della crisi d'impresa e dell'insolvenza", urn: 'urn:nir:stato:decreto.legislativo:2019-01-12;14' },
  { id: '006G0171', label: "Codice dell'ambiente", urn: 'urn:nir:stato:decreto.legislativo:2006-04-03;152' },
  { id: '004G0066', label: 'Codice dei beni culturali e del paesaggio', urn: 'urn:nir:stato:decreto.legislativo:2004-01-22;42' },
  { id: '005G0233', label: 'Codice delle assicurazioni private', urn: 'urn:nir:stato:decreto.legislativo:2005-09-07;209' },
  { id: '005G0055', label: 'Codice della proprietà industriale', urn: 'urn:nir:stato:decreto.legislativo:2005-02-10;30' },
  { id: '005G0104', label: "Codice dell'amministrazione digitale", urn: 'urn:nir:stato:decreto.legislativo:2005-03-07;82' },
  { id: '010G0127', label: 'Codice del processo amministrativo', urn: 'urn:nir:stato:decreto.legislativo:2010-07-02;104' },
  { id: '093G0007', label: 'Disposizioni sul processo tributario', urn: 'urn:nir:stato:decreto.legislativo:1992-12-31;546' },
  { id: '16G00187', label: 'Codice di giustizia contabile', urn: 'urn:nir:stato:decreto.legislativo:2016-08-26;174' },
  { id: '006G0216', label: "Codice delle pari opportunità tra uomo e donna", urn: 'urn:nir:stato:decreto.legislativo:2006-04-11;198' },
  { id: '17G00128', label: 'Codice del Terzo settore', urn: 'urn:nir:stato:decreto.legislativo:2017-07-03;117' },
  { id: '18G00011', label: 'Codice della protezione civile', urn: 'urn:nir:stato:decreto.legislativo:2018-01-02;1' },
  { id: '011G0201', label: 'Codice antimafia', urn: 'urn:nir:stato:decreto.legislativo:2011-09-06;159' },
  { id: '003G0280', label: 'Codice delle comunicazioni elettroniche', urn: 'urn:nir:stato:decreto.legislativo:2003-08-01;259' },
  { id: '005G0200', label: 'Codice della nautica da diporto', urn: 'urn:nir:stato:decreto.legislativo:2005-07-18;171' },
  { id: '042U0327', label: 'Codice della navigazione', urn: 'urn:nir:stato:regio.decreto:1942-03-30;327' },
  { id: '010G0089', label: "Codice dell'ordinamento militare", urn: 'urn:nir:stato:decreto.legislativo:2010-03-15;66' },
  { id: '041U0303', label: 'Codici penali militari di pace e di guerra', urn: 'urn:nir:stato:regio.decreto:1941-02-20;303' },
  { id: '25G00192', label: 'Codice degli incentivi', urn: 'urn:nir:stato:decreto.legislativo:2025-11-27;184' },
];

/** The day this list was checked against the collection. */
export const ITALY_LIST_DATE = '2026-10-03';

/** Key prefix of a Normattiva unit: `normattiva|it|<codice redazionale>`. */
export const NORMATTIVA_KEY = 'normattiva|';

export function isNormattivaKey(key: string): boolean {
  return key.startsWith(NORMATTIVA_KEY);
}

/** The Italian codes, as units the import understands. */
export function italyLaws(): LocusPlace[] {
  return ENTRIES.map((e): LocusPlace => {
    const reference = e.id === CONSTITUTION_ID ? null : referenceOfUrn(e.urn);
    return {
      key: `${NORMATTIVA_KEY}it|${e.id}`,
      type: 'code',
      state: 'it',
      name: e.id,
      rows: null,
      label: e.label,
      ...(reference ? { reference } : {}),
    };
  });
}

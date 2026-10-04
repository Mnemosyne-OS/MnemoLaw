/**
 * locusSource — where LOCUS lives and what its licence demands (doc 134 §2).
 *
 * Pure constants, no import: every other module of the cartridge reads them
 * from here so the licence line, the attribution and the shard list cannot
 * drift apart between the screen, the written file and the vault.
 *
 * ⛔ Nothing here is LOCUS data. The cartridge ships zero rows (CC BY-NC-4.0,
 * doc 90 direction): the person's own machine fetches from the official
 * repository, on a gesture, after reading the licence.
 */

export const LOCUS_REPO = 'LocalLaws/LOCUS-v1';
export const LOCUS_VERSION = 'LOCUS-v1';
/** Month the corpus was published (Hugging Face card, paper of June 2026). */
export const LOCUS_PUBLISHED = '2026-06';
export const LOCUS_LICENSE = 'CC BY-NC-4.0';
export const LOCUS_LICENSE_URL = 'https://creativecommons.org/licenses/by-nc/4.0/';
export const LOCUS_REPO_URL = `https://huggingface.co/datasets/${LOCUS_REPO}`;

/** One line shown under every cited article and written into every chronicle. */
export const LOCUS_ATTRIBUTION =
  `${LOCUS_VERSION}, UC Berkeley (Peskoff, Barrow, Vu, Davenport), ${LOCUS_LICENSE}`;

/**
 * The 8 shards. Measured 2026-10-03: sorted by `state`, 5 row groups each,
 * row-group statistics carry min/max of `state` and `city` — which is what
 * lets a city be read without downloading the 1.77 GB (doc 134 §9).
 */
export const LOCUS_SHARD_COUNT = 8;

export function shardUrl(i: number): string {
  return `${LOCUS_REPO_URL}/resolve/main/data/train-0000${i}-of-0000${LOCUS_SHARD_COUNT}.parquet`;
}

/** The place columns: the only bytes read to build the place list (~4 MB). */
export const PLACE_COLUMNS = ['state', 'city', 'county', 'source_jurisdiction_type'] as const;

// ── LEGI, the French national codes (doc 134 lot 3) ─────────────────────────
// Licence Ouverte 2.0 ALLOWS commercial use, with attribution: no NC question.

export const LEGI_REPO = 'AgentPublic/legi';
export const LEGI_REPO_URL = `https://huggingface.co/datasets/${LEGI_REPO}`;
export const LEGI_LICENSE = 'Licence Ouverte 2.0 (Etalab)';
export const LEGI_LICENSE_URL = 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/';
export const LEGI_ATTRIBUTION = 'Légifrance (DILA), base LEGI published by DINUM (AgentPublic/legi), Licence Ouverte 2.0';


// ── Legalize, national laws country by country (doc 134 §16) ────────────────
// One repository per country (`legalize-dev/legalize-<cc>`), the texts taken
// from each State's official source. The licence line is the repository's
// LICENSE paragraph for that country, read 2026-10-03.

export interface LegalizeSource {
  /** Official source of the texts, named in every chronicle. */
  official: string;
  /** Where a person checks the text in force. */
  checkAt: string;
  /** Licence of the texts, as the repository's LICENSE states it. */
  licence: string;
  /** Page the licence button opens. */
  licenceUrl: string;
}

export const LEGALIZE_SOURCES: Record<string, LegalizeSource> = {
  co: {
    official: 'SUIN-Juriscol (Ministerio de Justicia y del Derecho de Colombia)',
    checkAt: 'suin-juriscol.gov.co',
    licence: 'Official texts reproducible under art. 41 of Ley 23 de 1982',
    licenceUrl: 'https://github.com/legalize-dev/legalize-co/blob/main/LICENSE',
  },
  es: {
    official: 'BOE, Agencia Estatal Boletín Oficial del Estado',
    checkAt: 'boe.es',
    licence: 'BOE reuse conditions, citing the source is mandatory',
    licenceUrl: 'https://github.com/legalize-dev/legalize-es/blob/main/LICENSE',
  },
  ar: {
    official: 'InfoLEG (Ministerio de Justicia de la República Argentina, SAIJ)',
    checkAt: 'infoleg.gob.ar',
    licence: 'CC BY 4.0, attribution to SAIJ required',
    licenceUrl: 'https://github.com/legalize-dev/legalize-ar/blob/main/LICENSE',
  },
  pt: {
    official: 'Diário da República Eletrónico (Imprensa Nacional-Casa da Moeda)',
    checkAt: 'diariodarepublica.pt',
    licence: 'Free access under art. 3 of Decreto-Lei 83/2016 and the open data regime of Lei 68/2021',
    licenceUrl: 'https://github.com/legalize-dev/legalize-pt/blob/main/LICENSE',
  },
  int: {
    official: 'Official treaty texts (United Nations, ICRC, Council of Europe, EU), copied by MnemoLaw',
    checkAt: 'the official page named in the treaty file',
    licence: 'official acts; each copy names its official page and where it was taken from',
    licenceUrl: 'https://github.com/Mnemosyne-OS',
  },
  eu: {
    official: 'EUR-Lex (Publications Office of the European Union)',
    checkAt: 'eur-lex.europa.eu',
    licence: 'CC BY 4.0; only the Official Journal of the European Union is authentic',
    licenceUrl: 'https://github.com/legalize-dev/legalize-eu/blob/main/LICENSE',
  },
  uk: {
    official: 'legislation.gov.uk (The National Archives)',
    checkAt: 'legislation.gov.uk',
    licence: 'Open Government Licence v3.0',
    licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  },
};

// ── Normattiva, Italy (doc 134 §16.9) ────────────────────────────────────
// The State's own portal. The licence line holds the two facts read on
// 2026-10-03: State acts carry no copyright in Italy, and the portal
// publishes them as open data. No licence name was found on the portal.
export const NORMATTIVA_SOURCE: LegalizeSource = {
  official: 'Normattiva (Presidenza del Consiglio dei Ministri, Istituto Poligrafico e Zecca dello Stato)',
  checkAt: 'normattiva.it',
  licence: 'State acts carry no copyright (art. 5, Legge 633/1941), published as open data on dati.normattiva.it',
  licenceUrl: 'https://dati.normattiva.it/',
};

// ── Justice Canada (doc 134 §16.12) ──────────────────────────────────────
export const JUSTICE_CANADA_SOURCE: LegalizeSource = {
  official: 'Justice Laws Website (Department of Justice Canada), consolidated Acts',
  checkAt: 'laws-lois.justice.gc.ca',
  licence: 'Open Government Licence – Canada',
  licenceUrl: 'https://open.canada.ca/en/open-government-licence-canada',
};

/** Attribution of Justice Canada, one line. */
export function justiceCanadaAttribution(): string {
  return `${JUSTICE_CANADA_SOURCE.official} (justicecanada/laws-lois-xml), ${JUSTICE_CANADA_SOURCE.licence}`;
}

/** Attribution of Normattiva, one line. */
export function normattivaAttribution(): string {
  return `${NORMATTIVA_SOURCE.official}, open data, ${NORMATTIVA_SOURCE.licence}`;
}

/** Attribution of a Legalize country, one line. */
export function legalizeAttribution(country: string): string {
  const s = LEGALIZE_SOURCES[country];
  const official = s ? s.official : country.toUpperCase();
  return `${official}, consolidated by Legalize (legalize-dev/legalize-${country})${s ? `, ${s.licence}` : ''}`;
}

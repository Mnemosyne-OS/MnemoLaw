/**
 * countries — the list a person picks their country from, to ask for it (doc 134 lot 5).
 *
 * ISO 3166-1 alpha-2 codes, hard-coded: `Intl` names a code but cannot list
 * them. Names come from `Intl.DisplayNames` in the app's language, so the list
 * reads in all seven languages without a translation table. The list is sorted
 * by the NAME the person reads, never by code.
 */

export const ISO_COUNTRIES = (
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK '
  + 'FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT '
  + 'JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML '
  + 'MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM '
  + 'PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG '
  + 'TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ');

/** The ISO 3166 code of a MnemoLaw country: Legalize names the United Kingdom `uk`, ISO `GB`. */
export function isoCode(country: string): string {
  return country === 'uk' ? 'GB' : country.toUpperCase();
}

/** Countries MnemoLaw already has a source for: never offered as a request. */
export const AVAILABLE_COUNTRIES = ['US', 'FR', 'CO', 'ES', 'AR', 'IT', 'PT', 'GB', 'CA'] as const;

/** The name of a country in the app's language; the code itself when names are unavailable. */
export function countryLabel(code: string, lang: string): string {
  // The treaties are not a country: Intl has no name for them.
  if (code === 'INT') return lang.startsWith('fr') ? 'International' : lang.startsWith('es') ? 'Internacional' : 'International';
  try {
    return new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(code) ?? code;
  } catch (err) {
    console.warn('[mnemo-law] region names unavailable:', err);
    return code;
  }
}

/** The countries a person can ask for, named and sorted in their language, filtered by a query. */
export function requestableCountries(lang: string, query = ''): { code: string; name: string }[] {
  const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const collator = new Intl.Collator(lang);
  return ISO_COUNTRIES
    .filter((c) => !(AVAILABLE_COUNTRIES as readonly string[]).includes(c))
    .map((code) => ({ code, name: countryLabel(code, lang) }))
    .filter((c) => !q || c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q) || c.code.toLowerCase() === q)
    .sort((a, b) => collator.compare(a.name, b.name));
}

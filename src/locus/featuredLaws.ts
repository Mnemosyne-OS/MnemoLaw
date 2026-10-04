/**
 * featuredLaws — the laws shown as tiles before anything is typed (Tony,
 * 2026-10-03: "on ne sait pas trop quoi taper"). A list of 1 942 Acts behind
 * an empty search box tells the person nothing; the tiles name the laws
 * people ask about most: crime, family, work, housing, consumers, data,
 * immigration, tax.
 *
 * Matched on the label the list already carries, so a title the source
 * renames simply drops out of the tiles: it never points at a wrong law.
 * A country without its own list shows the first entries of its list,
 * which the catalogues already order constitution first.
 */
import type { LocusPlace } from './locusReader';

const FEATURED: Record<string, string[]> = {
  ca: [
    'Criminal Code', 'Code criminel',
    'Divorce Act', 'Loi sur le divorce',
    'Canada Labour Code', 'Code canadien du travail',
    'Immigration and Refugee Protection Act', 'Loi sur l’immigration et la protection des réfugiés',
    'Personal Information Protection and Electronic Documents Act', 'Loi sur la protection des renseignements personnels et les documents électroniques',
    'Income Tax Act', 'Loi de l’impôt sur le revenu',
    'Canada Business Corporations Act', 'Loi canadienne sur les sociétés par actions',
    'Citizenship Act', 'Loi sur la citoyenneté',
    'Cannabis Act', 'Loi sur le cannabis',
    'Canadian Human Rights Act', 'Loi canadienne sur les droits de la personne',
    'Employment Insurance Act', 'Loi sur l’assurance-emploi',
    'Controlled Drugs and Substances Act', 'Loi réglementant certaines drogues et autres substances',
  ],
  uk: [
    'Theft Act 1968', 'Consumer Rights Act 2015', 'Employment Rights Act 1996', 'Equality Act 2010',
    'Data Protection Act 2018', 'Human Rights Act 1998', 'Road Traffic Act 1988', 'Housing Act 1988',
    'Landlord and Tenant Act 1985', 'Children Act 1989', 'Matrimonial Causes Act 1973',
    'Protection from Harassment Act 1997', 'Misuse of Drugs Act 1971', 'Immigration Act 1971',
  ],
  int: [
    'Universal Declaration of Human Rights', 'Charter of the United Nations',
    'International Covenant on Civil and Political Rights', 'Convention on the Rights of the Child',
    'Refugee Convention (1951)', 'Fourth Geneva Convention (civilians)', 'Third Geneva Convention (prisoners of war)',
    'EU Charter of Fundamental Rights', 'Istanbul Convention (violence against women)', 'Convention against Torture',
    'Convention on discrimination against women (CEDAW)', 'Vienna Convention on Diplomatic Relations',
  ],
  eu: [
    'GDPR — General Data Protection Regulation', 'AI Act — Artificial Intelligence Act',
    'Digital Services Act (DSA)', 'Air passenger rights (denied boarding, delays, cancellations)',
    'Rome I — law applicable to contracts', 'Brussels I bis — jurisdiction and judgments in civil and commercial matters',
    'Brussels II ter — divorce, parental responsibility, child abduction', 'Succession — wills and inheritance across borders',
    'Rail passenger rights', 'Roaming in the EU', 'Digital Markets Act (DMA)', 'Data Act',
  ],
  fr: [
    'Code civil', 'Code pénal', 'Code du travail', 'Code de la consommation', 'Code de la route',
    'Code de commerce', 'Code de procédure civile', 'Code de procédure pénale', 'Code général des impôts',
    'Code de la santé publique', 'Code de la propriété intellectuelle', "Code de l'éducation",
  ],
};

/** How many tiles at most. */
export const FEATURED_MAX = 12;

/**
 * The tiles of a country. Canada's follow the app's language: French titles
 * in a French app, English ones otherwise. The US list is places, not laws:
 * no tiles.
 */
export function featuredPlaces(places: readonly LocusPlace[], country: string, lang: string): LocusPlace[] {
  if (country === 'us') return [];
  const names = FEATURED[country];
  if (!names) return places.slice(0, FEATURED_MAX);
  const byLabel = new Map<string, LocusPlace>();
  for (const p of places) if (p.label) byLabel.set(p.label.toLowerCase(), p);
  const canadaLang = lang.startsWith('fr') ? 'fra' : 'eng';
  const out: LocusPlace[] = [];
  for (const name of names) {
    const p = byLabel.get(name.toLowerCase());
    if (!p) continue;
    if (country === 'ca' && p.folder !== canadaLang) continue;
    out.push(p);
    if (out.length >= FEATURED_MAX) break;
  }
  return out;
}

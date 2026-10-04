# MnemoLaw

The laws of your country, in your memory.

MnemoLaw is a cartridge for [Mnemosyne OS](https://github.com/Mnemosyne-OS).
You pick a law, MnemoLaw downloads its official text, cuts it into articles
and writes them into a vault of your memory. Then you ask the chat in your own
words: "can my landlord keep my deposit?", "what does the GDPR say about
deleting my data?". The chat quotes the articles word for word and names the
law, the article and the date of the text.

MnemoLaw quotes texts. It gives no legal advice.

## What is in it

| Where | What | Source |
|---|---|---|
| International | 22 treaties: UN Charter, ICJ Statute, Universal Declaration of Human Rights, the two Covenants, conventions on children, women, torture and refugees, the Vienna conventions, the four Geneva Conventions and Protocols I and III, the Istanbul Convention, the TEU, the TFEU, the EU Charter of Fundamental Rights | copies in `public/data/treaties/` |
| European Union | 5 898 regulations in force (GDPR, AI Act, DSA, air passenger rights, Rome I and II, Brussels I bis…), English | [Legalize](https://github.com/legalize-dev/legalize-eu), from EUR-Lex |
| United States | city and county ordinances of 2 287 places | [LOCUS](https://huggingface.co/datasets/LocalLaws/LOCUS-v1), UC Berkeley |
| Canada | 971 federal Acts, English and French | [Justice Canada](https://github.com/justicecanada/laws-lois-xml) |
| France | 104 national codes in force | [LEGI](https://huggingface.co/datasets/AgentPublic/legi), Légifrance |
| United Kingdom | 2 386 Acts of Parliament in force | [Legalize](https://github.com/legalize-dev/legalize-uk), from legislation.gov.uk |
| Colombia | constitution and 33 codes | Legalize, from SUIN-Juriscol |
| Spain | constitution and 40 codes and main laws | Legalize, from the BOE |
| Argentina | constitution and 22 codes and main laws | Legalize, from InfoLEG |
| Italy | constitution and 30 codes | [Normattiva](https://www.normattiva.it), open data |
| Portugal | constitution and 29 codes and laws | Legalize, from the Diário da República |

Each country also offers packs: every law in force of one kind (every
Colombian law, every Spanish royal decree…). A pack can weigh hundreds of
megabytes and take hours to enter memory. It resumes where it stopped.

## How a law enters memory

1. MnemoLaw reads the text in force at its source. A law the source marks
   repealed, or publishes without its amendments, is refused.
2. The text is cut into articles. Each article becomes one memory, titled
   with the law, its country and its reference:
   `Código Penal (Colombia, Ley 599 de 2000) · Artículo 1`.
3. A source line closes every memory: where the text comes from, how recent
   it is, and the official site where the text in force can be checked.
4. A copy of each law is written as JSON in the folder you picked once, filed
   by country.

The chat reads the MnemoLaw vault only when you choose it in the chat's scope.

## The treaties in `public/data/`

No open source serves the treaties in a form a cartridge can read. The
official sites refuse it, and Wikisource keeps the original text of amended
treaties: its UN Charter still gives the Security Council eleven members.

So the treaties are copied once, in force, into `public/data/treaties/`, and
ship with the cartridge. `scripts/build-treaties.ts` makes the copies:
treaties never amended come from Wikisource (the revision is recorded), the
others from their official page. Each run compares the number of articles
with the expected one. All 22 match.

`public/data/countries/` holds the laws of countries with no open source,
supplied by hand. Its README describes the format.

## Install

In Mnemosyne OS, open MnemoHub, choose to add an external cartridge, and paste
this repository's address:

```
https://github.com/Mnemosyne-OS/MnemoLaw
```

## Develop

```bash
pnpm install
pnpm dev        # serves the cartridge on port 5224
pnpm build      # writes dist/, which the published repository commits
npx vitest run
```

Rebuild a country's list from a clone of its Legalize repository:

```bash
git clone --depth 1 https://github.com/legalize-dev/legalize-es.git ../legalize-es
npx tsx scripts/build-catalogue.ts es ../legalize-es
```

Canada: `scripts/build-canada.ts`, from Justice Canada's index. Treaties:
`scripts/build-treaties.ts`.

## Sources and attribution

The texts are official acts. Each memory names its source, and the attribution
of every source is written into the `ATTRIBUTION.md` of the folder you pick.

- LOCUS v1, UC Berkeley, CC BY-NC 4.0.
- LEGI, Légifrance data published by DINUM, Licence Ouverte 2.0.
- Legalize (legalize-dev): MIT for the pipeline. Its data keeps the terms of
  each official source:
  - EUR-Lex and InfoLEG: CC BY 4.0.
  - legislation.gov.uk: Open Government Licence v3.0.
  - BOE: reuse with the source cited.
  - SUIN-Juriscol and the Diário da República: official texts, free reuse.
- Justice Canada, Open Government Licence – Canada.
- Normattiva, Italian State acts published as open data.
- Treaties: the official page and the copy's origin are named in each file.

## Licence

The cartridge's code is under the MIT licence. The law texts keep the terms of
their sources, listed above.

# MnemoLaw data

Law texts that no open source serves in a form MnemoLaw can read, kept with
the cartridge. The cartridge reads them from its own address (`data/…`), so
they work offline from any other site and travel with every install.

Every other law (national codes, US ordinances, EU regulations) is read from
its source at import time and is not stored here.

## Tree

```
data/
├── README.md              this file
├── treaties/              international treaties (doc 134 §16.15)
│   ├── index.json         the list the cartridge shows (built by scripts/build-treaties.ts)
│   ├── un/                United Nations: Charter, human rights covenants and conventions, Vienna conventions
│   ├── ihl/               international humanitarian law: Geneva Conventions and their Protocols
│   ├── coe/               Council of Europe: European Convention on Human Rights, Istanbul, Budapest
│   ├── eu/                EU primary law: TEU, TFEU, Charter of Fundamental Rights
│   └── hcch/              Hague Conference: child abduction, apostille
└── countries/             national laws with no open source, supplied by hand
    └── <cc>/              one folder per country (ISO 3166 code in lower case: ve, ae…)
        ├── index.json     the list of that country's laws
        └── <id>.md        one law per file
```

## File format

One law per Markdown file, the same shape as Legalize
(github.com/legalize-dev), so one reader serves both:

```markdown
---
title: "Universal Declaration of Human Rights"
identifier: "int-udhr"
country: "int"
rank: "treaty"
status: "in_force"
text_state: "current"
source: "https://www.un.org/en/about-us/universal-declaration-of-human-rights"
via: "https://en.wikisource.org/wiki/Universal_Declaration_of_Human_Rights (revision 13889723)"
adopted: "1948-12-10"
last_updated: "2026-10-04"
---
# Universal Declaration of Human Rights

Preamble text…

## PART I

#### Article 1

Text of the article.
```

Rules:

- `text_state: "current"` only when the text includes every amendment in
  force. A text as first adopted that was amended since is `as_enacted`,
  and MnemoLaw refuses it: citing it as the law of today would be false.
- `source` is the official page; `via` says where the copy was taken
  from when it is not the official page, with its revision.
- `last_updated` is the day the copy was made or checked.
- Article headings are `#### Article N` (`Artículo N`, `Art. N` also work);
  divisions (Part, Chapter, Title) are `##` or `###`.

## Refreshing

`npx tsx scripts/build-treaties.ts` fetches every treaty listed in the
script again, rewrites its file and `treaties/index.json`, and prints the
article count next to the expected one. A treaty amended since the last
copy must be checked by hand against its official page.

Texts of treaties and of national laws are official acts. The attribution
of each source is in its file and is shown under every article in memory.

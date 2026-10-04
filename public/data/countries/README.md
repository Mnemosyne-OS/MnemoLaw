# National laws supplied by hand

For a country no open source serves (Venezuela, the United Arab Emirates…),
its laws are dropped here, one folder per country, named by its ISO 3166
code in lower case:

```
countries/
└── ve/
    ├── index.json
    ├── constitucion-1999.md
    └── codigo-civil.md
```

## One law per file

The same Markdown as `../README.md` describes (front matter, then
`#### Artículo 1` / `#### Article 1` headings). What matters most:

- `text_state: "current"` only when every amendment in force is in the
  text. Otherwise `as_enacted`, and MnemoLaw refuses the file.
- `source`: the official page or gazette (for Venezuela, the Gaceta
  Oficial number and date).
- `last_updated`: the date of the latest amendment included.

## index.json

```json
{
  "country": "ve",
  "builtOn": "2026-10-04",
  "entries": [
    { "path": "countries/ve/constitucion-1999.md", "identifier": "ve-constitucion-1999",
      "label": "Constitución de la República Bolivariana de Venezuela", "reference": "Gaceta Oficial 5.908 (2009)",
      "lastUpdated": "2009-02-19" }
  ]
}
```

Once a country's folder is filled, it is wired in the cartridge like the
treaties (doc 134 §16.15).

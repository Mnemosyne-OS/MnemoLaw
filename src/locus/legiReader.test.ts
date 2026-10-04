import { describe, it, expect } from 'vitest';
import { articlesInForce, codeLabelFromFolder, listLegiCodes, snapshotDate } from './legiReader';

describe('snapshotDate', () => {
  it('reads a dated snapshot folder and refuses legi-latest', () => {
    expect(snapshotDate('data/legi-20260912')).toBe('2026-09-12');
    expect(snapshotDate('data/legi-latest')).toBeNull();
  });
});

describe('codeLabelFromFolder', () => {
  it('builds a readable name, elisions included, and invents no accent', () => {
    expect(codeLabelFromFolder('legi_code_civil')).toBe('Code civil');
    expect(codeLabelFromFolder('legi_code_de_l_urbanisme')).toBe("Code de l'urbanisme");
    expect(codeLabelFromFolder('legi_code_de_la_route')).toBe('Code de la route');
    // The folder has no accent; the real title replaces this once the code is read.
    expect(codeLabelFromFolder('legi_code_de_l_energie')).toBe("Code de l'energie");
  });
});

describe('listLegiCodes', () => {
  it('takes the NEWEST dated snapshot, never legi-latest, and only the codes', async () => {
    const fetchJson = async (url: string) => {
      if (url.endsWith('/tree/main/data')) {
        return [{ path: 'data/legi-20260829' }, { path: 'data/legi-latest' }, { path: 'data/legi-20260912' }];
      }
      if (url.endsWith('/tree/main/data/legi-20260912')) {
        return [
          { path: 'data/legi-20260912/legi_code_civil' },
          { path: 'data/legi-20260912/legi_arrete' },
          { path: 'data/legi-20260912/legi_code_de_la_route' },
        ];
      }
      throw new Error(`unexpected ${url}`);
    };
    const { snapshot, codes } = await listLegiCodes(fetchJson);
    expect(snapshot).toBe('2026-09-12');
    expect(codes.map((c) => c.label)).toEqual(['Code civil', 'Code de la route']);
    expect(codes[0]).toMatchObject({ key: 'legi|legi_code_civil', type: 'code', state: 'fr', rows: null, snapshot: '2026-09-12' });
  });

  it('fails loudly when no dated snapshot exists, instead of listing nothing', async () => {
    await expect(listLegiCodes(async () => [{ path: 'data/legi-latest' }])).rejects.toThrow('LEGI_NO_SNAPSHOT');
  });
});

describe('articlesInForce', () => {
  const c = (doc: string, idx: number, status: string, number: string, text: string, start = '2016-10-01') =>
    ({ doc_id: doc, chunk_index: idx, status, title: 'Code civil', number, start_date: start, text });

  it('keeps only the articles in force and COUNTS the old versions it leaves out', () => {
    // Field read 2026-10-03: article 1240 is in the file as its 1804-2016 text AND its current one.
    const { articles, skipped, title } = articlesInForce([
      c('A-old', 1, 'MODIFIE', '1240', 'Le paiement fait de bonne foi…', '1804-03-21'),
      c('A-new', 1, 'VIGUEUR', '1240', "Tout fait quelconque de l'homme…"),
      c('B', 1, 'ABROGE', '9', 'repealed'),
    ]);
    expect(title).toBe('Code civil');
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({ header: 'Article 1240', content: "Tout fait quelconque de l'homme…", inForceSince: '2016-10-01' });
    expect(skipped).toBe(2);
  });

  it('joins the parts of a long article in chunk order', () => {
    const { articles } = articlesInForce([c('L', 2, 'VIGUEUR', '1', 'second'), c('L', 1, 'VIGUEUR', '1', 'first')]);
    expect(articles[0]!.content).toBe('first\nsecond');
  });

  it('orders articles by their number as a reader does', () => {
    const { articles } = articlesInForce([c('x', 1, 'VIGUEUR', '10', 't'), c('y', 1, 'VIGUEUR', '2', 't'), c('z', 1, 'VIGUEUR', '1', 't')]);
    expect(articles.map((a) => a.header)).toEqual(['Article 1', 'Article 2', 'Article 10']);
  });
});

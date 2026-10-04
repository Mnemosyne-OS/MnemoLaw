import { describe, it, expect } from 'vitest';
import { buildIndex, search, tokenize } from './lawSearch';

describe('lawSearch', () => {
  const docs = [
    '§ 8-1-51 RESTRICTION ON SOUND LEVEL. 85 decibels after 10:00 p.m.',
    '§ 3-4-2 RESTRAINT REQUIREMENTS FOR DOGS. A dog must be restrained.',
    'ARTICLE 5 BIRDS AND FOWL. Poultry in residential areas.',
  ];
  const index = buildIndex(docs);

  it('keeps article numbers searchable', () => {
    expect(tokenize('See § 8-1-51.')).toContain('8-1-51');
    expect(search(index, '8-1-51')).toEqual([0]);
  });

  it('ranks the document holding the rare word first', () => {
    expect(search(index, 'dog restrained')[0]).toBe(1);
  });

  it('never returns a document that shares no word with the query', () => {
    // The screen then says "no article contains these words", which is true.
    expect(search(index, 'chickens')).toEqual([]);
    expect(search(index, 'the of and')).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { PART_CHARS, articleChronicles, articleRef, cleanHeader, placeLabel, splitText } from './articleText';
import { LOCUS_ATTRIBUTION, LOCUS_PUBLISHED } from './locusSource';

describe('placeLabel', () => {
  it('turns underscores into spaces and keeps a glued name glued', () => {
    expect(placeLabel({ state: 'co', name: 'fort_collins' })).toBe('Fort Collins, CO');
    // Inventing the spaces of `newyorkcity` would print a guess as a fact.
    expect(placeLabel({ state: 'ny', name: 'newyorkcity' })).toBe('Newyorkcity, NY');
  });
});

describe('articleChronicles', () => {
  const article = {
    header: '#### § 8-1-51 - RESTRICTION ON SOUND LEVEL.',
    content: '  (A) A person may not operate sound equipment above 85 decibels.  ',
    isSubstantive: true, topic: 'Nuisance', function: null,
  };

  it('quotes the text verbatim and carries place, attribution and corpus date', () => {
    const [c] = articleChronicles({ state: 'tx', name: 'austin' }, article);
    expect(articleChronicles({ state: 'tx', name: 'austin' }, article)).toHaveLength(1);
    expect(c.startsWith('# Austin, TX · § 8-1-51 - RESTRICTION ON SOUND LEVEL.')).toBe(true);
    expect(c).toContain('(A) A person may not operate sound equipment above 85 decibels.');
    expect(c).toContain(LOCUS_ATTRIBUTION);
    expect(c).toContain(LOCUS_PUBLISHED);
  });

  it('names an untitled article instead of leaving a blank title', () => {
    expect(articleChronicles({ state: 'tx', name: 'austin' }, { ...article, header: '' })[0]).toContain('(untitled article)');
  });

  it('builds a stable ref and strips header hashes', () => {
    expect(articleRef({ key: 'cities|tx|austin' }, 7)).toBe('locus:cities|tx|austin#7');
    expect(articleRef({ key: 'cities|tx|austin' }, 7, 2)).toBe('locus:cities|tx|austin#7.2');
    expect(cleanHeader('### § 1 - X.')).toBe('§ 1 - X.');
  });
});

describe('long articles', () => {
  it('splits a text above the host cap into parts that join back to the text', () => {
    // The host slices a chronicle at 50 000 characters without a word; Austin
    // holds an article of 570 660. Every character must land in some part.
    const para = 'Sec. 1. ' + 'word '.repeat(2000) + '\n\n';
    const text = para.repeat(20);
    const parts = splitText(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= PART_CHARS)).toBe(true);
    expect(parts.join('')).toBe(text);
  });

  it('cuts hard when the text has no break at all', () => {
    const parts = splitText('x'.repeat(PART_CHARS * 2 + 5));
    expect(parts.map((p) => p.length)).toEqual([PART_CHARS, PART_CHARS, 5]);
  });

  it('labels each part with its position and keeps the attribution on every part', () => {
    const long = { header: '## § 25-2 - ZONING.', content: 'a '.repeat(PART_CHARS), isSubstantive: true, topic: null, function: null };
    const bodies = articleChronicles({ state: 'tx', name: 'austin' }, long);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain('(part 1/2)');
    expect(bodies[1]).toContain('(part 2/2)');
    expect(bodies.every((b) => b.includes(LOCUS_ATTRIBUTION) && b.length < 50_000)).toBe(true);
  });
});

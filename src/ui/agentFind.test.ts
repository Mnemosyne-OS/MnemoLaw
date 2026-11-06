/**
 * A law or a place named the way a person says it (doc 149 §19): fillers, accents and plurals
 * off, the whole name before a partial one, several matches refused with their names.
 */
import { describe, expect, it } from 'vitest';
import { findNamed, nameWords, type Named } from './agentFind';

const law = (id: string, name: string, ...more: string[]): Named<string> => ({ item: id, id, names: [name, ...more], label: name });
const LAWS = [law('l1', 'Code civil'), law('l2', 'Code civil local'), law('l3', 'Code de la route'), law('l4', 'Criminal Code', 'C-46')];
const kind = { code: 'NO_LAW', noun: 'law' };

describe('a law named the way a person says it', () => {
  it('folds case, accents, fillers and a plural', () => {
    expect(nameWords('la loi sur les Élections')).toEqual(['sur', 'election']);
    // The plural « s » comes off both sides alike, so « Travis » still meets « Travis ».
    expect(nameWords('le comté de Travis')).toEqual(['travi']);
    expect(nameWords('Austin, TX')).toEqual(['austin', 'tx']);
  });

  it('an id, the whole name, every word of it, or a reference', () => {
    expect(findNamed(LAWS, 'l3', kind)).toBe('l3');
    // « Code civil » is a whole name: it wins over the law that holds its words.
    expect(findNamed(LAWS, 'le code civil', kind)).toBe('l1');
    expect(findNamed(LAWS, 'code de la route', kind)).toBe('l3');
    expect(findNamed(LAWS, 'route', kind)).toBe('l3');
    expect(findNamed(LAWS, 'C-46', kind)).toBe('l4');
  });

  it('several matches are refused with their names, never the first taken', () => {
    expect(() => findNamed(LAWS, 'civil', kind)).toThrow('AMBIGUOUS: "civil" names several laws: Code civil, Code civil local; say which');
  });

  it('no match is refused with the names that exist, capped', () => {
    expect(() => findNamed(LAWS, 'code pénal', kind)).toThrow('NO_LAW: no law named "code pénal"; laws: Code civil, Code civil local, Code de la route, Criminal Code');
    expect(() => findNamed(LAWS, '', kind)).toThrow(/^BAD_ARG/);
    expect(() => findNamed([], 'civil', kind)).toThrow('laws: none');
    const many = Array.from({ length: 20 }, (_, i) => law(`x${i}`, `Law ${i}`));
    expect(() => findNamed(many, 'nothing', kind)).toThrow(/Law 11 \(\+8\)$/);
    expect(() => findNamed(many, 'la', { code: 'NO_PLACE', noun: 'city or county', plural: 'cities and counties' })).toThrow(/^NO_PLACE: "la" names no city or county; cities and counties: /);
  });
});

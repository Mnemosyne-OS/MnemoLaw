/**
 * MnemoLaw's agent handlers (doc 149): each one goes through the app's own move, shows the
 * country first, never accepts the US licence for the person, and refuses by name.
 */
import { describe, it, expect, vi } from 'vitest';
import { lawAgentHandlers, readCountry, within, type LawAgentContext } from './lawAgent';
import { EMPTY_LIBRARY } from '../locus/library';
import type { LocusPlace } from '../locus/locusReader';

const austin: LocusPlace = { key: 'cities|tx|austin', type: 'cities', state: 'tx', name: 'austin', rows: 3120 };
const boston: LocusPlace = { key: 'cities|ma|boston', type: 'cities', state: 'ma', name: 'boston', rows: 900 };
const civil: LocusPlace = { key: 'legi|code_civil', type: 'code', state: 'fr', name: 'code_civil', rows: null, label: 'Code civil' };
const commerce: LocusPlace = { key: 'legi|code_de_commerce', type: 'code', state: 'fr', name: 'code_de_commerce', rows: null, label: 'Code de commerce' };
const austinMn: LocusPlace = { key: 'cities|mn|austin', type: 'cities', state: 'mn', name: 'austin', rows: 200 };
const nyc: LocusPlace = { key: 'cities|ny|newyorkcity', type: 'cities', state: 'ny', name: 'newyorkcity', rows: 738 };

function ctx(over: Partial<LawAgentContext> = {}): LawAgentContext {
  return {
    view: { kind: 'home' },
    vault: { kind: 'ready', vault: 'v', unlocked: true },
    lib: { ...EMPTY_LIBRARY, licenseAccepted: true },
    libLoaded: true,
    placesBy: { us: [austin, boston], fr: [civil] },
    placesError: null,
    job: null,
    notice: [],
    go: vi.fn(),
    loadPlaces: vi.fn(async () => undefined),
    runImport: vi.fn(async () => undefined),
    stop: vi.fn(),
    openInOS: vi.fn(async () => ({ success: true })),
    ...over,
  };
}
const H = (c: LawAgentContext) => lawAgentHandlers(() => c);

describe('readCountry and within', () => {
  it('refuses an unknown country with the list', () => {
    expect(readCountry('fr')).toBe('fr');
    expect(() => readCountry('de')).toThrow(/^NOT_FOUND: .*int, eu, us/);
  });
  it('answers running when the work outlasts the wait', async () => {
    vi.useFakeTimers();
    const slow = within(new Promise(() => undefined), 10);
    vi.advanceTimersByTime(11);
    await expect(slow).resolves.toEqual({ done: false });
    vi.useRealTimers();
  });
});

describe('the US licence is the person\'s', () => {
  it('loadPlaces and importPlace are refused until the person accepted it, and while it is unknown', async () => {
    const notYet = ctx({ lib: { ...EMPTY_LIBRARY, licenseAccepted: false }, placesBy: {} });
    await expect(H(notYet).loadPlaces({ country: 'us' })).rejects.toThrow(/^LICENSE_NOT_ACCEPTED/);
    expect(notYet.loadPlaces).not.toHaveBeenCalled();
    expect(notYet.go).not.toHaveBeenCalled();
    const unread = ctx({ libLoaded: false });
    expect(() => H(unread).importPlace({ country: 'us', key: austin.key })).toThrow(/^NOT_READY/);
    // Before the library is read, « not accepted » is a guess (the default), never said as a fact.
    const booting = ctx({ libLoaded: false, lib: EMPTY_LIBRARY, placesBy: {} });
    await expect(H(booting).loadPlaces({ country: 'us' })).rejects.toThrow(/^NOT_READY/);
    const refused = ctx({ lib: { ...EMPTY_LIBRARY, licenseAccepted: false } });
    expect(() => H(refused).importPlace({ country: 'us', key: austin.key })).toThrow(/^LICENSE_NOT_ACCEPTED/);
    expect(refused.runImport).not.toHaveBeenCalled();
  });
  it('a national list needs no licence', async () => {
    const c = ctx({ lib: { ...EMPTY_LIBRARY, licenseAccepted: false }, placesBy: {} });
    c.loadPlaces = vi.fn(async () => { c.placesBy = { fr: [civil] }; });
    await expect(H(c).loadPlaces({ country: 'fr' })).resolves.toEqual({ country: 'fr', entries: 1 });
    expect(c.go).toHaveBeenCalledWith({ kind: 'country', country: 'fr' });
  });
});

describe('the handlers', () => {
  it('loadPlaces answers a list already loaded, refuses a running job, says a failure and a stop', async () => {
    const loaded = ctx();
    await expect(H(loaded).loadPlaces({ country: 'us' })).resolves.toMatchObject({ alreadyLoaded: true, entries: 2 });
    expect(loaded.loadPlaces).not.toHaveBeenCalled();
    const busy = ctx({ placesBy: {}, job: { kind: 'places', startedAt: 0, bytes: 0 } });
    await expect(H(busy).loadPlaces({ country: 'fr' })).rejects.toThrow(/^BUSY/);
    const failing = ctx({ placesBy: {} });
    failing.loadPlaces = vi.fn(async () => { failing.placesError = 'HTTP 503'; });
    await expect(H(failing).loadPlaces({ country: 'fr' })).rejects.toThrow(/^LIST_FAILED: HTTP 503/);
    await expect(H(ctx({ placesBy: {} })).loadPlaces({ country: 'fr' })).rejects.toThrow(/^STOPPED/);
  });

  it('findPlaces filters as the screen does, with keys and what is in memory', () => {
    const c = ctx({ lib: { ...EMPTY_LIBRARY, licenseAccepted: true, places: [{ key: austin.key } as never] } });
    const out = H(c).findPlaces({ country: 'us', query: 'Austin, TX' });
    expect(out.found).toEqual([{ key: austin.key, name: 'Austin, TX', kind: 'city', articles: 3120, inMemory: true }]);
    expect(() => H(c).findPlaces({ country: 'it', query: 'x' })).toThrow(/^NO_LIST/);
    expect(() => H(c).findPlaces({ country: 'us', query: ' ' })).toThrow(/^BAD_ARG/);
    expect(() => H(c).findPlaces({ country: 'us', query: 'a', limit: 0 })).toThrow(/^BAD_ARG/);
    expect(() => H(c).findPlaces({ country: 'us', query: 'a', limit: 61 })).toThrow(/^BAD_ARG/);
  });

  it('importPlace shows the country and starts the app\'s own import', () => {
    const c = ctx();
    expect(H(c).importPlace({ country: 'fr', key: civil.key })).toMatchObject({ started: true, name: 'Code civil' });
    expect(c.go).toHaveBeenCalledWith({ kind: 'country', country: 'fr' });
    expect(c.runImport).toHaveBeenCalledWith(civil);
  });

  it('importPlace refuses an unknown key, no vault, and a running job', () => {
    expect(() => H(ctx()).importPlace({ country: 'fr', key: 'legi|nope' })).toThrow('NO_LAW: no law named "legi|nope"; laws: Code civil');
    expect(() => H(ctx({ vault: { kind: 'error', why: 'LOCKED' } })).importPlace({ country: 'fr', key: civil.key })).toThrow(/^NO_VAULT: .*LOCKED/);
    const busy = ctx({ job: { kind: 'places', startedAt: 0, bytes: 0 } });
    expect(() => H(busy).importPlace({ country: 'fr', key: civil.key })).toThrow(/^BUSY/);
    expect(busy.runImport).not.toHaveBeenCalled();
  });

  it('openCountry refuses during a job; stop stops only what runs', () => {
    const busy = ctx({ job: { kind: 'places', startedAt: 0, bytes: 0 } });
    expect(() => H(busy).openCountry({ country: 'fr' })).toThrow(/^BUSY/);
    expect(H(busy).stop()).toMatchObject({ stopped: true });
    const idle = ctx();
    expect(H(idle).stop()).toMatchObject({ stopped: false });
    expect(idle.stop).not.toHaveBeenCalled();
    expect(H(idle).openCountry({ country: 'fr' })).toEqual({ shown: 'fr' });
  });
});

describe('by voice: names, not keys', () => {
  it('importPlace takes a law or a city by the words a person says, and still a key', () => {
    const c = ctx({ placesBy: { us: [austin, boston, nyc], fr: [civil, commerce] } });
    expect(H(c).importPlace({ country: 'fr', key: 'le code civil' })).toMatchObject({ started: true, key: civil.key });
    expect(c.runImport).toHaveBeenLastCalledWith(civil);
    expect(H(c).importPlace({ country: 'us', key: 'Boston' })).toMatchObject({ key: boston.key });
    // LOCUS spells « newyorkcity »: the screen's own filter finds it.
    expect(H(c).importPlace({ country: 'us', key: 'New York' })).toMatchObject({ key: nyc.key });
    expect(H(c).importPlace({ country: 'us', key: austin.key })).toMatchObject({ key: austin.key });
  });

  it('several matches are refused with their names, and nothing starts', () => {
    const c = ctx({ placesBy: { us: [austin, austinMn, boston] } });
    expect(() => H(c).importPlace({ country: 'us', key: 'Austin' })).toThrow('AMBIGUOUS: "Austin" names several cities and counties: Austin, TX, Austin, MN; say which');
    expect(c.runImport).not.toHaveBeenCalled();
    expect(H(c).importPlace({ country: 'us', key: 'austin mn' })).toMatchObject({ key: austinMn.key });
    const fr = ctx({ placesBy: { fr: [civil, commerce] } });
    expect(() => H(fr).importPlace({ country: 'fr', key: 'code' })).toThrow('AMBIGUOUS: "code" names several laws: Code civil, Code de commerce; say which');
    expect(() => H(fr).importPlace({ country: 'fr', key: 'code pénal' })).toThrow('NO_LAW: no law named "code pénal"; laws: Code civil, Code de commerce');
    expect(() => H(fr).importPlace({ country: 'fr', key: ' ' })).toThrow(/^BAD_ARG/);
    expect(fr.runImport).not.toHaveBeenCalled();
  });

  it('showHome and showRequest move the screen as its own buttons do, never during a job', () => {
    const c = ctx({ view: { kind: 'country', country: 'fr' } });
    expect(H(c).showHome()).toEqual({ shown: 'home' });
    expect(c.go).toHaveBeenCalledWith({ kind: 'home' });
    expect(H(c).showRequest()).toMatchObject({ shown: 'request' });
    expect(c.go).toHaveBeenLastCalledWith({ kind: 'request' });
    const busy = ctx({ job: { kind: 'places', startedAt: 0, bytes: 0 } });
    expect(() => H(busy).showHome()).toThrow(/^BUSY/);
    expect(() => H(busy).showRequest()).toThrow(/^BUSY/);
    expect(busy.go).not.toHaveBeenCalled();
  });

  it('openFolder opens the folder, refuses with no folder, and says a refused open', async () => {
    const lib = { ...EMPTY_LIBRARY, licenseAccepted: true, folder: 'C:/k/mnemo-law' };
    const c = ctx({ lib });
    await expect(H(c).openFolder()).resolves.toEqual({ opened: 'C:/k/mnemo-law' });
    expect(c.openInOS).toHaveBeenCalledWith('C:/k/mnemo-law');
    await expect(H(ctx()).openFolder()).rejects.toThrow(/^NO_FOLDER/);
    const refused = ctx({ lib, openInOS: vi.fn(async () => ({ success: false, error: 'NOT_ALLOWED' })) });
    await expect(H(refused).openFolder()).rejects.toThrow('WRITE_FAILED: the folder did not open (NOT_ALLOWED)');
    const thrown = ctx({ lib, openInOS: vi.fn(async () => { throw new Error('IPC down'); }) });
    await expect(H(thrown).openFolder()).rejects.toThrow('WRITE_FAILED: the folder did not open (IPC down)');
    const silent = ctx({ lib, openInOS: vi.fn(async () => undefined) });
    await expect(H(silent).openFolder()).rejects.toThrow(/^WRITE_FAILED: .*no answer/);
  });
});

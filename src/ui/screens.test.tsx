import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Home } from './Home';
import { RequestCountry } from './RequestCountry';
import { translate, type Key } from '../i18n/strings';
import { EMPTY_LIBRARY, type ImportedPlace, type LibraryState } from '../locus/library';
import { requestableCountries } from '../countries';

const t = (key: Key, vars?: Record<string, string | number>) => translate('en', key, vars);
const place = (key: string, type: ImportedPlace['type']) =>
  ({ key, type, state: type === 'code' ? 'fr' : 'tx', name: key, kept: 10, inVault: 10 } as unknown as ImportedPlace);

describe('Home (doc 134 lot 5)', () => {
  it('shows the two countries with a source, what each holds, and how much is imported', () => {
    const lib: LibraryState = { ...EMPTY_LIBRARY, places: [place('austin', 'cities'), place('nola', 'cities'), place('civil', 'code')] };
    render(<Home t={t} lang="en" lib={lib} onOpen={vi.fn()} onRequest={vi.fn()} />);
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
    expect(screen.getByText('Places imported: 2')).toBeInTheDocument();
    expect(screen.getByText('Codes imported: 1')).toBeInTheDocument();
    expect(screen.getByText('Add my country')).toBeInTheDocument();
  });

  it('opens a country and the request screen', () => {
    const onOpen = vi.fn();
    const onRequest = vi.fn();
    render(<Home t={t} lang="en" lib={EMPTY_LIBRARY} onOpen={onOpen} onRequest={onRequest} />);
    fireEvent.click(screen.getByText('France'));
    expect(onOpen).toHaveBeenCalledWith('fr');
    fireEvent.click(screen.getByText('Add my country'));
    expect(onRequest).toHaveBeenCalled();
  });
});

describe('RequestCountry (doc 134 lot 5)', () => {
  it('never offers a country MnemoLaw already has', () => {
    const codes = requestableCountries('en').map((c) => c.code);
    expect(codes).not.toContain('US');
    expect(codes).not.toContain('FR');
    expect(codes).toContain('DE');
  });

  it('shows the exact words before sending, then what IS, never a promise', async () => {
    const onSend = vi.fn(async () => ({ kind: 'sent' as const }));
    render(<RequestCountry t={t} lang="en" lib={EMPTY_LIBRARY} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText('Find a country'), { target: { value: 'germ' } });
    fireEvent.click(screen.getByText('Germany'));
    expect(screen.getByText('[mnemo-law] country request: DE (Germany)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Send the request'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Request sent for Germany/));
    expect(onSend).toHaveBeenCalledWith('DE');
  });

  it('a country already asked shows its date instead of a second send', () => {
    const lib = { ...EMPTY_LIBRARY, requested: [{ code: 'DE', at: '2026-10-03T10:00:00.000Z' }] };
    render(<RequestCountry t={t} lang="en" lib={lib} onSend={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Find a country'), { target: { value: 'germ' } });
    fireEvent.click(screen.getByText('Germany'));
    expect(screen.queryByText('Send the request')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Already asked on/).length).toBeGreaterThan(0);
  });

  it('says how long to wait on a cooldown, and the reason on a failure', async () => {
    const onSend = vi.fn()
      .mockResolvedValueOnce({ kind: 'cooldown', retryAfterMs: 45_000 })
      .mockResolvedValueOnce({ kind: 'error', why: 'WALLET_LOCKED' });
    render(<RequestCountry t={t} lang="en" lib={EMPTY_LIBRARY} onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText('Find a country'), { target: { value: 'japan' } });
    fireEvent.click(screen.getByText('Japan'));
    fireEvent.click(screen.getByText('Send the request'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Try again in 45 s/));
    fireEvent.click(screen.getByText('Send the request'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/WALLET_LOCKED/));
  });
});

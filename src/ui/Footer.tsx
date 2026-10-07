/**
 * Footer — where the laws live: the vault's state and the folder, kept quiet
 * at the bottom so the countries come first.
 */
import { S } from './styles';
import type { T, VaultState } from './types';

export function Footer({ t, vault, folder, onRetryVault, onOpenFolder }: {
  t: T;
  vault: VaultState;
  folder: string | null;
  busy: boolean;
  onRetryVault: () => void;
  onOpenFolder: () => void;
}) {
  return (
    <footer style={S.footer}>
      {vault.kind === 'error' && (
        <div style={S.error}>
          {t('vault.failed', { why: vault.why })} <button style={S.link} onClick={onRetryVault}>{t('vault.retry')}</button>
        </div>
      )}
      <div style={{ ...S.small, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{folder ? t('footer.folder', { folder }) : t('footer.noFolder')}</span>
        {folder && <button style={S.link} onClick={onOpenFolder}>{t('lib.openFolder')}</button>}
      </div>
      <div style={S.small}>{t('app.advice')}</div>
    </footer>
  );
}

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { copyToClipboard } from '@/utils/clipboard';
import { useNotificationStore } from '@/stores';
import { hasProviderConnectivityAuth } from './providerConnectivity';
import type { ProviderKeyEntryDraft, ProviderKind } from './types';
import styles from '@/pages/AiProvidersPage.module.scss';

type ProviderKeyEntriesEditorProps = {
  provider: ProviderKind;
  entries: ProviderKeyEntryDraft[];
  disabled?: boolean;
  testing?: boolean;
  hasConfiguredModels?: boolean;
  globalHeaders?: Array<{ key: string; value: string }>;
  showStatusColumn?: boolean;
  showProxyColumn?: boolean;
  highlightIndexes?: number[];
  singleEntryMode?: boolean;
  onChange: (entries: ProviderKeyEntryDraft[]) => void;
  onTestOne?: (index: number) => Promise<void> | void;
  onAdd?: () => void;
};

function StatusLoadingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.statusIconSpin}>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M8 1A7 7 0 0 1 8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StatusSuccessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="var(--success-color, #22c55e)" />
      <path
        d="M4.5 8L7 10.5L11.5 6"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="var(--danger-color, #ef4444)" />
      <path
        d="M5 5L11 11M11 5L5 11"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusIdleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--text-tertiary, #9ca3af)" strokeWidth="2" />
    </svg>
  );
}

function StatusIcon({ status }: { status: ProviderKeyEntryDraft['testStatus'] }) {
  switch (status) {
    case 'loading':
      return <StatusLoadingIcon />;
    case 'success':
      return <StatusSuccessIcon />;
    case 'error':
      return <StatusErrorIcon />;
    default:
      return <StatusIdleIcon />;
  }
}

const buildEmptyEntry = (): ProviderKeyEntryDraft => ({
  apiKey: '',
  proxyUrl: '',
  headers: [],
  testStatus: 'idle',
  testMessage: '',
});

export function ProviderKeyEntriesEditor({
  provider,
  entries,
  disabled = false,
  testing = false,
  hasConfiguredModels = true,
  globalHeaders = [],
  showStatusColumn = true,
  showProxyColumn = true,
  highlightIndexes = [],
  singleEntryMode = false,
  onChange,
  onTestOne,
  onAdd,
}: ProviderKeyEntriesEditorProps) {
  const { t } = useTranslation();
  const testKey =
    provider === 'gemini'
      ? 'gemini'
      : provider === 'codex'
        ? 'codex'
        : provider === 'claude'
          ? 'claude'
          : 'openai';
  const { showNotification } = useNotificationStore();
  const list = entries.length ? entries : [buildEmptyEntry()];
  const keyPlaceholderKey =
    provider === 'openai'
      ? 'ai_providers.openai_key_placeholder'
      : `ai_providers.${provider}_add_modal_key_placeholder`;
  const proxyPlaceholderKey =
    provider === 'openai'
      ? 'ai_providers.openai_proxy_placeholder'
      : `ai_providers.${provider}_add_modal_proxy_placeholder`;

  const updateEntries = useCallback(
    (next: ProviderKeyEntryDraft[]) => {
      onChange(next.length ? next : [buildEmptyEntry()]);
    },
    [onChange]
  );

  const updateEntry = (index: number, patch: Partial<ProviderKeyEntryDraft>) => {
    updateEntries(list.map((entry, currentIndex) => (
      currentIndex === index
        ? { ...entry, ...patch, testStatus: patch.testStatus ?? 'idle', testMessage: patch.testMessage ?? '' }
        : entry
    )));
  };

  const addEntry = () => {
    if (singleEntryMode) {
      return;
    }
    if (onAdd) {
      onAdd();
      return;
    }
    updateEntries([...list, buildEmptyEntry()]);
  };

  const removeEntry = (index: number) => {
    if (singleEntryMode) {
      return;
    }
    updateEntries(list.filter((_, currentIndex) => currentIndex !== index));
  };

  const copyApiKey = async (value: string) => {
    const copied = await copyToClipboard(value);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  return (
    <div className={styles.keyEntriesList}>
      <div className={styles.keyEntriesToolbar}>
        <span className={styles.keyEntriesCount}>
          {t('ai_providers.openai_keys_count', { defaultValue: '密钥数量' })}: {list.length}
        </span>
        <div className={styles.modelTestPanelActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={addEntry}
            disabled={disabled || testing || singleEntryMode}
            className={styles.addKeyButton}
          >
            {t('ai_providers.openai_keys_add_btn', { defaultValue: '添加密钥' })}
          </Button>
        </div>
      </div>
      <div className={styles.keyTableShell}>
        <div
          className={styles.keyTableHeader}
          style={{
            gridTemplateColumns: `${showStatusColumn ? '46px 56px' : '46px'} minmax(220px, 1.4fr) ${showProxyColumn ? 'minmax(200px, 1.1fr)' : ''} 180px`,
            minWidth: showProxyColumn ? 760 : 560,
          }}
        >
          <div className={styles.keyTableColIndex}>#</div>
          {showStatusColumn ? <div className={styles.keyTableColStatus}>{t('common.status')}</div> : null}
          <div className={styles.keyTableColKey}>{t('common.api_key')}</div>
          {showProxyColumn ? <div className={styles.keyTableColProxy}>{t('common.proxy_url')}</div> : null}
          <div className={styles.keyTableColAction}>{t('common.action')}</div>
        </div>
        {list.map((entry, index) => {
          const canTestKey =
            hasConfiguredModels &&
            hasProviderConnectivityAuth(provider, {
              headers: globalHeaders,
              keyHeaders: entry.headers,
              apiKey: entry.apiKey,
            });
          return (
            <div
              key={index}
              className={`${styles.keyTableRow} ${highlightIndexes.includes(index) ? styles.keyTableRowDuplicate : ''}`}
              style={{
                gridTemplateColumns: `${showStatusColumn ? '46px 56px' : '46px'} minmax(220px, 1.4fr) ${showProxyColumn ? 'minmax(200px, 1.1fr)' : ''} 180px`,
                minWidth: showProxyColumn ? 760 : 560,
              }}
            >
              <div className={styles.keyTableColIndex}>{index + 1}</div>
              {showStatusColumn ? (
                <div className={styles.keyTableColStatus} title={entry.testMessage || ''}>
                  <StatusIcon status={entry.testStatus} />
                </div>
              ) : null}
              <div className={styles.keyTableColKey}>
                <input
                  type="text"
                  value={entry.apiKey}
                  onChange={(event) => updateEntry(index, { apiKey: event.target.value })}
                  onKeyDown={(event) => {
                    if (singleEntryMode) return;
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    updateEntries([
                      ...list.slice(0, index + 1),
                      buildEmptyEntry(),
                      ...list.slice(index + 1),
                    ]);
                  }}
                  onPaste={(event) => {
                    if (singleEntryMode) return;
                    const pasted = event.clipboardData.getData('text');
                    if (!/[\r\n]+/.test(pasted)) return;
                    event.preventDefault();
                    const values = pasted
                      .split(/\r?\n+/)
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .map((apiKey) => ({ ...buildEmptyEntry(), apiKey }));
                    if (!values.length) return;
                    updateEntries([
                      ...list.slice(0, index),
                      ...values,
                      ...list.slice(index + 1),
                    ]);
                  }}
                  disabled={disabled || testing}
                  className={`input ${styles.keyTableInput} ${highlightIndexes.includes(index) ? styles.keyTableInputDuplicate : ''}`}
                  placeholder={t(keyPlaceholderKey, { defaultValue: t('common.api_key') })}
                />
              </div>
              {showProxyColumn ? (
                <div className={styles.keyTableColProxy}>
                  <input
                    type="text"
                    value={entry.proxyUrl}
                    onChange={(event) => updateEntry(index, { proxyUrl: event.target.value })}
                    disabled={disabled || testing}
                    className={`input ${styles.keyTableInput} ${highlightIndexes.includes(index) ? styles.keyTableInputDuplicate : ''}`}
                    placeholder={t(proxyPlaceholderKey, { defaultValue: t('common.proxy_url') })}
                  />
                </div>
              ) : null}
              <div className={styles.keyTableColAction}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void copyApiKey(entry.apiKey)}
                  disabled={disabled || testing || !entry.apiKey.trim()}
                  className={styles.providerActionButtonCompact}
                >
                  {t('common.copy')}
                </Button>
                {onTestOne ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void onTestOne(index)}
                    disabled={disabled || testing || !canTestKey}
                    loading={entry.testStatus === 'loading'}
                    className={`${styles.modelTestSecondaryButton} ${styles.providerActionButtonCompact}`}
                  >
                    {t(`ai_providers.${testKey}_test_single_action`, { defaultValue: '测试' })}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeEntry(index)}
                  disabled={disabled || testing || singleEntryMode || list.length <= 1}
                  className={styles.providerActionButtonCompact}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

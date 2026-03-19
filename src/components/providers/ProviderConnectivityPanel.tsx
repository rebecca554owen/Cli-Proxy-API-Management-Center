import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import styles from '@/pages/AiProvidersPage.module.scss';
import type { ProviderKeyEntryDraft, ProviderKind } from './types';

type ProviderConnectivityPanelProps = {
  provider: ProviderKind;
  modelEntries: Array<{ name: string; alias: string }>;
  testModel: string;
  disabled?: boolean;
  testing?: boolean;
  entries: ProviderKeyEntryDraft[];
  summaryStatus: 'idle' | 'loading' | 'success' | 'error';
  summaryMessage: string;
  titleKey: string;
  hintKey: string;
  onChangeTestModel: (value: string) => void;
  onTestAll: () => Promise<void> | void;
};

export function ProviderConnectivityPanel({
  provider,
  modelEntries,
  testModel,
  disabled = false,
  testing = false,
  entries,
  summaryStatus,
  summaryMessage,
  titleKey,
  hintKey,
  onChangeTestModel,
  onTestAll,
}: ProviderConnectivityPanelProps) {
  const { t } = useTranslation();
  const testKey = provider === 'gemini' ? 'gemini' : provider === 'codex' ? 'codex' : 'openai';
  const options = useMemo(() => {
    const seen = new Set<string>();
    return modelEntries.reduce<Array<{ value: string; label: string }>>((acc, entry) => {
      const name = entry.name.trim();
      if (!name || seen.has(name)) return acc;
      seen.add(name);
      const alias = entry.alias.trim();
      acc.push({ value: name, label: alias && alias !== name ? `${name} (${alias})` : name });
      return acc;
    }, []);
  }, [modelEntries]);
  const hasTestableKeys = entries.some((entry) => entry.apiKey.trim());

  return (
    <>
      <div className={styles.modelTestPanel}>
        <div className={styles.modelTestMeta}>
          <label className={styles.modelTestLabel}>{t(titleKey)}</label>
          <span className={styles.modelTestHint}>{t(hintKey)}</span>
        </div>
        <div className={styles.modelTestControls}>
          <Select
            value={testModel}
            options={options}
            onChange={onChangeTestModel}
            placeholder={
              options.length
                ? t(`ai_providers.${testKey}_test_select_placeholder`)
                : t(`ai_providers.${testKey}_test_select_empty`)
            }
            className={styles.openaiTestSelect}
            ariaLabel={t(titleKey)}
            disabled={disabled || testing || options.length === 0}
          />
          <div className={styles.modelTestPanelActions}>
            <Button
              variant={summaryStatus === 'error' ? 'danger' : 'secondary'}
              size="sm"
              onClick={() => void onTestAll()}
              loading={summaryStatus === 'loading'}
              disabled={disabled || testing || !options.length || !hasTestableKeys}
              className={`${styles.modelTestAllButton} ${
                summaryStatus === 'error' ? styles.modelTestDangerButton : styles.modelTestSecondaryButton
              }`}
            >
              {t(`ai_providers.${testKey}_test_all_action`, { defaultValue: '测试全部' })}
            </Button>
          </div>
        </div>
      </div>
      {summaryMessage ? (
        <div className={styles.modelTestMessage}>
          <div
            className={`status-badge ${
              summaryStatus === 'error'
                ? 'error'
                : summaryStatus === 'success'
                  ? 'success'
                  : 'muted'
            }`}
          >
            {summaryMessage}
          </div>
        </div>
      ) : null}
    </>
  );
}

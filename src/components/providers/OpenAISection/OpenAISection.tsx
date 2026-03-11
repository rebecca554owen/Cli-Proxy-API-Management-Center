import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import type { OpenAIProviderConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import {
  buildCandidateUsageSourceIds,
  lookupStatusBar,
  type KeyStats,
  type StatusBarData,
} from '@/utils/usage';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { getOpenAIProviderStats } from '../utils';

interface OpenAISectionProps {
  configs: OpenAIProviderConfig[];
  keyStats: KeyStats;
  statusBarBySource: Map<string, StatusBarData>;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  resolvedTheme: string;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

export function OpenAISection({
  configs,
  keyStats,
  statusBarBySource,
  loading,
  disableControls,
  isSwitching,
  resolvedTheme,
  onAdd,
  onDuplicate,
  onEdit,
  onDelete,
}: OpenAISectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img
              src={resolvedTheme === 'dark' ? iconOpenaiDark : iconOpenaiLight}
              alt=""
              className={styles.cardTitleIcon}
            />
            {t('ai_providers.openai_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.openai_add_button')}
          </Button>
        }
      >
        <ProviderList<OpenAIProviderConfig>
          items={configs}
          loading={loading}
          keyField={(_, index) => `openai-provider-${index}`}
          listClassName={styles.providerTableList}
          rowClassName={styles.providerTableRow}
          metaClassName={styles.providerTableMeta}
          actionsClassName={styles.providerTableActions}
          actionButtonClassName={styles.providerActionButton}
          header={
            <div className={styles.providerTableHeader}>
              <div className={styles.providerTableHeaderCell}>渠道与接口</div>
              <div className={styles.providerTableHeaderCell}>模型别名--&gt;实际模型</div>
              <div className={styles.providerTableHeaderCell}>{t('common.status')}</div>
              <div className={styles.providerTableHeaderCell}>操作</div>
            </div>
          }
          emptyTitle={t('ai_providers.openai_empty_title')}
          emptyDescription={t('ai_providers.openai_empty_desc')}
          onEdit={onEdit}
          onDelete={onDelete}
          actionsDisabled={actionsDisabled}
          extraActionButtons={(_, index) => (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDuplicate(index)}
              disabled={actionsDisabled}
              className={styles.providerActionButton}
            >
              {t('common.copy')}
            </Button>
          )}
          renderContent={(item) => {
            const stats = getOpenAIProviderStats(item.apiKeyEntries, keyStats, item.prefix);
            const headerEntries = Object.entries(item.headers || {});
            const userAgent = headerEntries.find(([key]) => key.toLowerCase() === 'user-agent')?.[1];
            const extraHeaders = headerEntries.filter(([key]) => key.toLowerCase() !== 'user-agent');
            const apiKeyEntries = item.apiKeyEntries || [];
            const allCandidates: string[] = [];
            buildCandidateUsageSourceIds({ prefix: item.prefix }).forEach((id) => allCandidates.push(id));
            (item.apiKeyEntries || []).forEach((entry) => {
              buildCandidateUsageSourceIds({ apiKey: entry.apiKey }).forEach((id) => allCandidates.push(id));
            });
            const statusData = lookupStatusBar(statusBarBySource, allCandidates);

            return (
              <Fragment>
                <div className={`${styles.providerTableCell} ${styles.providerMainCell}`}>
                  <div className={styles.providerMainTitle}>{item.name}</div>
                  <div className={`${styles.providerMetaLine} ${styles.providerMetaInline}`}>
                    <span>{t('common.priority')}:</span>
                    <span className={styles.providerPriorityBadge}>{item.priority ?? 0}</span>
                  </div>
                  <div className={styles.providerMetaLine}>{item.baseUrl}</div>
                  <div className={styles.providerMetaLine}>
                    {t('ai_providers.openai_keys_count')}: {apiKeyEntries.length}
                  </div>
                  {apiKeyEntries.length > 0 && (
                    <div className={styles.apiKeyEntryList}>
                      {apiKeyEntries.map((entry, entryIndex) => (
                        <div key={entryIndex} className={styles.apiKeyEntryCard}>
                          <span className={styles.apiKeyEntryIndex}>{entryIndex + 1}</span>
                          <span className={styles.apiKeyEntryKey}>{maskApiKey(entry.apiKey)}</span>
                          {entry.proxyUrl && (
                            <span className={styles.apiKeyEntryProxy}>{entry.proxyUrl}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.prefix && (
                    <div className={styles.providerMetaLine}>
                      {t('common.prefix')}: {item.prefix}
                    </div>
                  )}
                  {item.testModel && (
                    <div className={styles.providerMetaLine}>Test Model: {item.testModel}</div>
                  )}
                  {userAgent && <div className={styles.providerMetaLine}>UA: {userAgent}</div>}
                  {extraHeaders.length > 0 && (
                    <div className={styles.headerBadgeList}>
                      {extraHeaders.map(([key, value]) => (
                        <span key={key} className={styles.headerBadge}>
                          <strong>{key}:</strong> {value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={`${styles.providerTableCell} ${styles.providerModelCell}`}>
                  <div className={styles.providerModelList}>
                    {(item.models ?? []).map((model) => (
                      <div key={model.name} className={styles.providerModelItem}>
                        <span className={styles.providerModelSource}>{model.alias || model.name}</span>
                        <span className={styles.providerModelArrow}>-&gt;</span>
                        <span className={styles.providerModelTarget}>{model.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`${styles.providerTableCell} ${styles.providerStatusCell}`}>
                  <div className={styles.providerStatusStats}>
                    <span className={`${styles.statPill} ${styles.statSuccess}`}>
                      {t('stats.success')}: {stats.success}
                    </span>
                    <span className={`${styles.statPill} ${styles.statFailure}`}>
                      {t('stats.failure')}: {stats.failure}
                    </span>
                  </div>
                  <ProviderStatusBar statusData={statusData} />
                </div>
              </Fragment>
            );
          }}
        />
      </Card>
    </>
  );
}

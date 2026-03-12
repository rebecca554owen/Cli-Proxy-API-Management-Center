import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import type { OpenAIProviderConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import {
  buildCandidateUsageSourceIds,
  calculateStatusBarData,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { formatProviderEndpoint, getOpenAIProviderStats, getTotalRequests, summarizeMappings } from '../utils';

interface OpenAISectionProps {
  configs: OpenAIProviderConfig[];
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
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
  usageDetails,
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
  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();
    configs.forEach((provider, index) => {
      const sourceIds = new Set<string>();
      buildCandidateUsageSourceIds({ prefix: provider.prefix }).forEach((id) => sourceIds.add(id));
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({ apiKey: entry.apiKey }).forEach((id) => sourceIds.add(id));
      });
      const filteredDetails = sourceIds.size
        ? usageDetails.filter((detail) => sourceIds.has(detail.source))
        : [];
      cache.set(provider.name || `openai-provider-${index}`, calculateStatusBarData(filteredDetails));
    });
    return cache;
  }, [configs, usageDetails]);

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
          renderContent={(item, index) => {
            const stats = getOpenAIProviderStats(item.apiKeyEntries, keyStats, item.prefix);
            const totalRequests = getTotalRequests(stats);
            const apiKeyEntries = item.apiKeyEntries || [];
            const statusData =
              statusBarCache.get(item.name || `openai-provider-${index}`) || calculateStatusBarData([]);
            const mappingSummary = summarizeMappings(
              (item.models ?? []).map((model) => ({
                source: model.alias || model.name,
                target: model.name,
              })),
              6
            );
            const mappingCount = mappingSummary.visible.length + mappingSummary.hiddenCount;
            const endpoint = formatProviderEndpoint(item.baseUrl);
            const groupName = item.prefix?.trim() || item.name || endpoint;
            const firstKey = apiKeyEntries[0]?.apiKey;

            return (
              <Fragment>
                <div className={styles.providerCardHeader}>
                  <div className={styles.providerCardLead}>
                    <div className={styles.providerMainTitle}>{item.name}</div>
                    <div className={styles.providerKeyGroup}>{groupName}</div>
                    <div className={`${styles.providerMetaLine} ${styles.providerMetaInline}`}>
                      <span>P</span>
                      <span className={styles.providerPriorityBadge}>{item.priority ?? 0}</span>
                    </div>
                  </div>
                  <div className={styles.providerMetricGrid}>
                    <div className={styles.providerStatusStats}>
                      <span className={`${styles.statPill} ${styles.statSuccess}`}>
                        {t('stats.success')}: {stats.success}
                      </span>
                      <span className={`${styles.statPill} ${styles.statFailure}`}>
                        {t('stats.failure')}: {stats.failure}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.providerCardBody}>
                  <div className={styles.providerStatusRow}>
                    <div className={styles.providerRequestMeta}>
                      <span className={styles.providerRequestCount}>
                        Req <strong>{totalRequests}</strong>
                      </span>
                    </div>
                    <ProviderStatusBar statusData={statusData} />
                  </div>
                  <div className={styles.providerModelsColumn}>
                    <div className={styles.providerModelHeader}>
                      <div className={styles.providerColumnTitle}>模型映射</div>
                      <span className={styles.providerRequestCount}>
                        映射 <strong>{mappingCount}</strong>
                      </span>
                    </div>
                    <div className={styles.providerModelList}>
                      {mappingSummary.visible.map((model, summaryIndex) => (
                        <div key={`${model.source}-${model.target}-${summaryIndex}`} className={styles.providerModelItem}>
                          <span className={styles.providerModelSource}>{model.source}</span>
                          <span className={styles.providerModelArrow}>-&gt;</span>
                          <span className={styles.providerModelTarget}>{model.target}</span>
                        </div>
                      ))}
                      {mappingSummary.hiddenCount > 0 && (
                        <div className={styles.providerModelMore}>+{mappingSummary.hiddenCount}</div>
                      )}
                    </div>
                  </div>
                  <div className={styles.providerInfoSummary}>
                    <div className={styles.providerInfoCluster}>
                      {endpoint && <div className={styles.providerMetaLine}>{endpoint}</div>}
                      {firstKey && (
                        <div className={`${styles.providerMetaLine} ${styles.providerMetaKey}`}>
                          {maskApiKey(firstKey)}
                          {apiKeyEntries.length > 1 ? ` +${apiKeyEntries.length - 1}` : ''}
                        </div>
                      )}
                    </div>
                    <div className={styles.providerInfoCluster}>
                      <div className={styles.providerMetaLine}>
                        {t('ai_providers.openai_keys_count')}: {apiKeyEntries.length}
                      </div>
                      {item.prefix && (
                        <div className={styles.providerMetaLine}>
                          {t('common.prefix')}: {item.prefix}
                        </div>
                      )}
                      {item.testModel && (
                        <div className={styles.providerMetaLine}>Test: {item.testModel}</div>
                      )}
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          }}
        />
      </Card>
    </>
  );
}

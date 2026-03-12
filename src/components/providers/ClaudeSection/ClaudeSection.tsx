import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import iconClaude from '@/assets/icons/claude.svg';
import type { ProviderKeyConfig } from '@/types';
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
import { formatProviderEndpoint, getStatsBySource, hasDisableAllModelsRule, summarizeMappings } from '../utils';

interface ClaudeSectionProps {
  configs: ProviderKeyConfig[];
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
}

export function ClaudeSection({
  configs,
  keyStats,
  usageDetails,
  loading,
  disableControls,
  isSwitching,
  onAdd,
  onDuplicate,
  onEdit,
  onDelete,
  onToggle,
}: ClaudeSectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;
  const toggleDisabled = disableControls || loading || isSwitching;
  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();
    configs.forEach((config) => {
      const candidates = buildCandidateUsageSourceIds({ apiKey: config.apiKey, prefix: config.prefix });
      if (!candidates.length) return;
      const candidateSet = new Set(candidates);
      const filteredDetails = usageDetails.filter((detail) => candidateSet.has(detail.source));
      cache.set(config.apiKey, calculateStatusBarData(filteredDetails));
    });
    return cache;
  }, [configs, usageDetails]);
  const resolveCloakModeLabel = (item: ProviderKeyConfig) => {
    const raw = (item.cloak?.mode ?? '').trim().toLowerCase();
    const key = raw === 'always' || raw === 'never' ? raw : 'auto';
    return t(`ai_providers.claude_cloak_mode_${key}`);
  };

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img src={iconClaude} alt="" className={styles.cardTitleIcon} />
            {t('ai_providers.claude_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.claude_add_button')}
          </Button>
        }
      >
        <ProviderList<ProviderKeyConfig>
          items={configs}
          loading={loading}
          keyField={(item, index) => `${item.apiKey}-${index}`}
          listClassName={styles.providerTableList}
          rowClassName={styles.providerTableRow}
          metaClassName={styles.providerTableMeta}
          actionsClassName={styles.providerTableActions}
          actionButtonClassName={styles.providerActionButton}
          emptyTitle={t('ai_providers.claude_empty_title')}
          emptyDescription={t('ai_providers.claude_empty_desc')}
          onEdit={onEdit}
          onDelete={onDelete}
          actionsDisabled={actionsDisabled}
          getRowDisabled={(item) => hasDisableAllModelsRule(item.excludedModels)}
          renderExtraActions={(item, index) => (
            <Button
              variant="secondary"
              size="sm"
              className={`${styles.providerActionButton} ${
                hasDisableAllModelsRule(item.excludedModels)
                  ? styles.providerEnableButton
                  : styles.providerDisableButton
              }`}
              disabled={toggleDisabled}
              onClick={() => void onToggle(index, hasDisableAllModelsRule(item.excludedModels))}
            >
              {hasDisableAllModelsRule(item.excludedModels) ? '启用' : '禁用'}
            </Button>
          )}
          deleteLabel={t('common.delete')}
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
            const stats = getStatsBySource(item.apiKey, keyStats, item.prefix);
            const configDisabled = hasDisableAllModelsRule(item.excludedModels);
            const excludedModels = item.excludedModels ?? [];
            const statusData = statusBarCache.get(item.apiKey) || calculateStatusBarData([]);
            const mappingSummary = summarizeMappings([
              ...(item.models ?? []).map((model) => ({
                source: model.alias || model.name,
                target: model.name,
              })),
              ...excludedModels.map((model) => ({
                source: model,
                target: '已排除',
                muted: true,
              })),
            ], 6);
            const endpoint = formatProviderEndpoint(item.baseUrl);
            const headerUrl = endpoint || item.prefix?.trim() || t('ai_providers.claude_item_title');
            const prefixLabel = item.prefix?.trim() || '-';
            const modeLabel = item.cloak ? resolveCloakModeLabel(item) : '-';

            return (
              <Fragment>
                <div className={styles.providerCardHeader}>
                  <div className={styles.providerCardLead}>
                    <div className={`${styles.providerMetaLine} ${styles.providerMetaInline}`}>
                      <span>{t('common.priority')}:</span>
                      <span className={styles.providerPriorityBadge}>{item.priority ?? 0}</span>
                    </div>
                    <div className={styles.providerMainTitle}>{headerUrl}</div>
                    <div className={`${styles.providerMetaLine} ${styles.providerMetaKey}`}>
                      {maskApiKey(item.apiKey)}
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
                    <div className={styles.providerStatusMeta}>
                      {t('common.prefix')}: {prefixLabel}
                    </div>
                    <div className={styles.providerStatusMeta}>
                      模式: {modeLabel}
                    </div>
                  </div>
                </div>
                <div className={styles.providerCardBody}>
                  <div className={styles.providerStatusRow}>
                    <ProviderStatusBar statusData={statusData} />
                  </div>
                  <div className={styles.providerModelsColumn}>
                    <div className={styles.providerModelList}>
                      {mappingSummary.visible.map((model, index) => (
                        <div
                          key={`${model.source}-${model.target}-${index}`}
                          className={`${styles.providerModelItem} ${model.muted ? styles.providerModelMuted : ''}`}
                        >
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
                      {item.proxyUrl && (
                        <div className={styles.providerMetaLine}>
                          {t('common.proxy_url')}: {formatProviderEndpoint(item.proxyUrl)}
                        </div>
                      )}
                    </div>
                    {configDisabled && (
                      <div className={styles.providerMetaLine}>
                        {t('ai_providers.config_disabled_badge')}
                      </div>
                    )}
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

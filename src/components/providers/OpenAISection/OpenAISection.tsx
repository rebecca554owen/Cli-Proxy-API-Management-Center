import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import type { OpenAIProviderConfig } from '@/types';
import type { KeyStats, StatusBarData } from '@/utils/usage';
import { maskApiKey } from '@/utils/format';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { buildOpenAIProviderCard } from '../groupedProviderUtils';
import {
  buildProviderIdentityPresentation,
  formatProviderEndpoint,
  hasDisableAllModelsRule,
} from '../utils';

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
  onToggle: (index: number, enabled: boolean) => void;
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
  onToggle,
}: OpenAISectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;
  const toggleDisabled = disableControls || loading || isSwitching;

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
          getRowDisabled={(item) => hasDisableAllModelsRule(item.excludedModels)}
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
          renderContent={(item, index) => {
            const card = buildOpenAIProviderCard(item, index, keyStats, statusBarBySource);
            const apiKeyEntries = item.apiKeyEntries || [];
            const configDisabled = hasDisableAllModelsRule(item.excludedModels);
            const endpoint = formatProviderEndpoint(item.baseUrl);
            const identity = buildProviderIdentityPresentation({
              primary: item.name?.trim() || item.prefix?.trim(),
              endpoint,
              fallback: t('ai_providers.openai_item_title', { defaultValue: 'OpenAI Provider' }),
            });
            const firstKey = apiKeyEntries[0]?.apiKey;

            return (
              <Fragment>
                <div className={styles.providerCardHeader}>
                  <div className={styles.providerCardLead}>
                    <div className={`${styles.providerMetaLine} ${styles.providerMetaInline}`}>
                      <span>{t('common.priority')}:</span>
                      <span className={styles.providerPriorityBadge}>{item.priority ?? 0}</span>
                    </div>
                    <div
                      className={`${styles.providerMainTitle} ${
                        identity.titleTone === 'endpoint' ? styles.providerEndpointTitle : ''
                      }`}
                    >
                      {identity.title}
                    </div>
                    {identity.subtitle && (
                      <div className={styles.providerKeyGroup}>{identity.subtitle}</div>
                    )}
                  </div>
                  <div className={styles.providerMetricGrid}>
                    <div className={styles.providerStatusStats}>
                      <span className={`${styles.statPill} ${styles.statSuccess}`}>
                        {t('stats.success')}: {card.success}
                      </span>
                      <span className={`${styles.statPill} ${styles.statFailure}`}>
                        {t('stats.failure')}: {card.failure}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.providerCardBody}>
                  <div className={styles.providerStatusRow}>
                    <ProviderStatusBar statusData={card.statusData} />
                  </div>
                  <div className={styles.providerInfoSummary}>
                    <div className={styles.providerInfoCluster}>
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
                      {item.testModel && (
                        <div className={styles.providerMetaLine}>Test: {item.testModel}</div>
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

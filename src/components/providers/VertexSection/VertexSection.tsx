import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import iconVertex from '@/assets/icons/vertex.svg';
import type { ProviderKeyConfig } from '@/types';
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
import { getStatsBySource } from '../utils';

interface VertexSectionProps {
  configs: ProviderKeyConfig[];
  keyStats: KeyStats;
  statusBarBySource: Map<string, StatusBarData>;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

export function VertexSection({
  configs,
  keyStats,
  statusBarBySource,
  loading,
  disableControls,
  isSwitching,
  onAdd,
  onEdit,
  onDelete,
}: VertexSectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img src={iconVertex} alt="" className={styles.cardTitleIcon} />
            {t('ai_providers.vertex_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.vertex_add_button')}
          </Button>
        }
      >
        <ProviderList<ProviderKeyConfig>
          items={configs}
          loading={loading}
          keyField={(item) => item.apiKey}
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
          emptyTitle={t('ai_providers.vertex_empty_title')}
          emptyDescription={t('ai_providers.vertex_empty_desc')}
          onEdit={onEdit}
          onDelete={onDelete}
          actionsDisabled={actionsDisabled}
          renderContent={(item, index) => {
            const stats = getStatsBySource(item.apiKey, keyStats, item.prefix);
            const headerEntries = Object.entries(item.headers || {});
            const userAgent = headerEntries.find(([key]) => key.toLowerCase() === 'user-agent')?.[1];
            const extraHeaders = headerEntries.filter(([key]) => key.toLowerCase() !== 'user-agent');
            const statusData = lookupStatusBar(
              statusBarBySource,
              buildCandidateUsageSourceIds({ apiKey: item.apiKey, prefix: item.prefix })
            );

            return (
              <Fragment>
                <div className={`${styles.providerTableCell} ${styles.providerMainCell}`}>
                  <div className={styles.providerMainTitle}>
                    {t('ai_providers.vertex_item_title')} #{index + 1}
                  </div>
                  <div className={`${styles.providerMetaLine} ${styles.providerMetaInline}`}>
                    <span>{t('common.priority')}:</span>
                    <span className={styles.providerPriorityBadge}>{item.priority ?? 0}</span>
                  </div>
                  {item.baseUrl && <div className={styles.providerMetaLine}>{item.baseUrl}</div>}
                  <div className={`${styles.providerMetaLine} ${styles.providerMetaKey}`}>
                    {maskApiKey(item.apiKey)}
                  </div>
                  {item.prefix && (
                    <div className={styles.providerMetaLine}>
                      {t('common.prefix')}: {item.prefix}
                    </div>
                  )}
                  {item.proxyUrl && (
                    <div className={styles.providerMetaLine}>
                      {t('common.proxy_url')}: {item.proxyUrl}
                    </div>
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
                      <div key={`${model.name}-${model.alias || 'default'}`} className={styles.providerModelItem}>
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

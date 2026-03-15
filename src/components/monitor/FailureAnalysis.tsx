import { useMemo, useState, useCallback, Fragment, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { MonitorFailureStatsItem } from '@/services/api';
import { useMonitorChannelActions } from '@/hooks';
import { useMonitorStore } from '@/stores';
import { serializeMonitorParams } from '@/stores/useMonitorStore';
import { TimeRangeSelector, type TimeRange } from './TimeRangeSelector';
import {
  formatTimestamp,
  getRateClassName,
  getProviderDisplayParts,
  buildMonitorTimeRangeParams,
  monitorSourceRefToMeta,
  resolveMonitorSourceAction,
  type DateRange,
  type MonitorSourceMeta,
} from '@/utils/monitor';
import styles from '@/pages/MonitorPage.module.scss';

interface FailureAnalysisProps {
  refreshKey: number;
  loading: boolean;
  providerMap: Record<string, string>;
  sourceAuthMap: Record<string, string>;
  sourceMetaMap: Record<string, MonitorSourceMeta>;
  onSourceChanged: () => Promise<void>;
}

interface ModelFailureStat {
  success: number;
  failure: number;
  total: number;
  successRate: number;
  recentRequests: { failed: boolean; timestamp: number }[];
  lastTimestamp: number;
}

interface FailureStat {
  source: string;
  displayName: string;
  providerName: string | null;
  maskedKey: string;
  failedCount: number;
  lastFailTime: number;
  models: Record<string, ModelFailureStat>;
  sourceRef?: MonitorFailureStatsItem['source_ref'];
}

export function FailureAnalysis({
  refreshKey,
  loading,
  providerMap,
  sourceAuthMap,
  sourceMetaMap,
  onSourceChanged,
}: FailureAnalysisProps) {
  const { t } = useTranslation();
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState('');
  const [filterModel, setFilterModel] = useState('');

  const [timeRange, setTimeRange] = useState<TimeRange>(1);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const ensureFailureAnalysis = useMonitorStore((state) => state.ensureFailureAnalysis);

  const handleTimeRangeChange = useCallback((range: TimeRange, custom?: DateRange) => {
    setTimeRange(range);
    setCustomRange(custom);
  }, []);

  const formatChannelLabel = useCallback((source: string): string => {
    const normalizedSource = source || 'unknown';
    const { provider, masked } = getProviderDisplayParts(normalizedSource, providerMap);
    return provider ? `${provider} (${masked})` : masked;
  }, [providerMap]);

  const mapFailureStat = useCallback((item: MonitorFailureStatsItem): FailureStat => {
    const source = item.source || 'unknown';
    const fallbackDisplay = getProviderDisplayParts(source, providerMap);
    const provider = item.source_ref?.display_name || fallbackDisplay.provider;
    const masked = item.source_ref?.display_secret || fallbackDisplay.masked;
    const displayName = provider ? `${provider} (${masked})` : masked;

    const models: Record<string, ModelFailureStat> = {};
    (item.models || []).forEach((model) => {
      models[model.model] = {
        success: model.success || 0,
        failure: model.failed || 0,
        total: model.requests || 0,
        successRate: model.success_rate || 0,
        recentRequests: (model.recent_requests || []).map((req) => ({
          failed: !!req.failed,
          timestamp: req.timestamp ? new Date(req.timestamp).getTime() : 0,
        })),
        lastTimestamp: model.last_request_at ? new Date(model.last_request_at).getTime() : 0,
      };
    });

    return {
      source,
      displayName,
      providerName: provider,
      maskedKey: masked,
      failedCount: item.failed_count || 0,
      lastFailTime: item.last_failed_at ? new Date(item.last_failed_at).getTime() : 0,
      models,
      sourceRef: item.source_ref,
    };
  }, [providerMap]);

  const params = useMemo(
    () => ({
      limit: 10,
      source: filterChannel || undefined,
      model: filterModel || undefined,
      ...buildMonitorTimeRangeParams(timeRange, customRange),
    }),
    [filterChannel, filterModel, timeRange, customRange]
  );
  const cacheKey = useMemo(() => serializeMonitorParams(params), [params]);
  const entry = useMonitorStore((state) => state.failureAnalysisCache[cacheKey]);
  const actionSourceMetaMap = useMemo(() => {
    const nextMap = { ...sourceMetaMap };
    (entry?.data?.items || []).forEach((item) => {
      const meta = monitorSourceRefToMeta(item.source_ref);
      if (meta?.source) {
        nextMap[meta.source] = meta;
      }
    });
    return nextMap;
  }, [entry?.data?.items, sourceMetaMap]);
  const { pendingSource, copySourceValue, openEditor, toggleSource, isSourceDisabled } =
    useMonitorChannelActions({
      sourceMetaMap: actionSourceMetaMap,
      onChanged: onSourceChanged,
    });

  useEffect(() => {
    void ensureFailureAnalysis(params, refreshKey > 0);
  }, [ensureFailureAnalysis, params, refreshKey]);

  const failureStats = useMemo(
    () => (entry?.data?.items || []).map(mapFailureStat),
    [entry?.data?.items, mapFailureStat]
  );

  const filters = useMemo(() => {
    const response = entry?.data;
    const sourceSet = new Set<string>(
      response?.filters?.sources && response.filters.sources.length > 0
        ? response.filters.sources
        : failureStats.map((stat) => stat.source)
    );
    const channels = Array.from(sourceSet)
      .filter((source) => !!source)
      .map((source) => ({ source, label: formatChannelLabel(source) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));

    const modelSet = new Set<string>(
      response?.filters?.models && response.filters.models.length > 0
        ? response.filters.models
        : failureStats.flatMap((stat) => Object.keys(stat.models))
    );

    return { channels, models: Array.from(modelSet).sort() };
  }, [entry?.data, failureStats, formatChannelLabel]);

  const analysisLoading = !entry?.data && (entry?.loading ?? true);

  const filteredStats = useMemo(() => {
    return failureStats.filter((stat) => {
      if (filterChannel && stat.source !== filterChannel) return false;
      return true;
    });
  }, [failureStats, filterChannel]);

  useEffect(() => {
    if (expandedChannel && !filteredStats.some((stat) => stat.source === expandedChannel)) {
      setExpandedChannel(null);
    }
  }, [expandedChannel, filteredStats]);

  const toggleExpand = (source: string) => {
    setExpandedChannel(expandedChannel === source ? null : source);
  };

  const getTopFailedModels = (source: string, modelsMap: Record<string, ModelFailureStat>) => {
    return Object.entries(modelsMap)
      .filter(([, stat]) => stat.failure > 0)
      .sort((a, b) => {
        const aDisabled = isSourceDisabled(source);
        const bDisabled = isSourceDisabled(source);
        if (aDisabled !== bDisabled) {
          return aDisabled ? 1 : -1;
        }
        return b[1].failure - a[1].failure;
      })
      .slice(0, 2);
  };

  return (
    <>
      <Card
        title={t('monitor.failure.title')}
        subtitle={t('monitor.failure.click_hint')}
        extra={
          <TimeRangeSelector
            value={timeRange}
            onChange={handleTimeRangeChange}
            customRange={customRange}
          />
        }
      >
        <div className={styles.logFilters}>
          <select
            className={styles.logSelect}
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
          >
            <option value="">{t('monitor.channel.all_channels')}</option>
            {filters.channels.map((channel) => (
              <option key={channel.source} value={channel.source}>{channel.label}</option>
            ))}
          </select>
          <select
            className={styles.logSelect}
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
          >
            <option value="">{t('monitor.channel.all_models')}</option>
            {filters.models.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>

        <div className={styles.tableWrapper}>
          {(analysisLoading || loading) ? (
            <div className={styles.emptyState}>{t('common.loading')}</div>
          ) : filteredStats.length === 0 ? (
            <div className={styles.emptyState}>{t('monitor.failure.no_failures')}</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('monitor.failure.header_name')}</th>
                  <th>{t('monitor.failure.header_count')}</th>
                  <th>{t('monitor.failure.header_time')}</th>
                  <th>{t('monitor.failure.header_models')}</th>
                  <th>{t('monitor.logs.header_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((stat) => {
                  const directMeta = monitorSourceRefToMeta(stat.sourceRef);
                  const resolvedAction = resolveMonitorSourceAction(
                    stat.source,
                    actionSourceMetaMap,
                    undefined,
                    undefined,
                    sourceAuthMap,
                    providerMap
                  );
                  const fallbackAction =
                    resolvedAction.meta || !directMeta
                      ? resolvedAction
                      : { actionSourceKey: directMeta.source, meta: directMeta };
                  const actionSourceKey = fallbackAction.actionSourceKey;
                  const sourceMeta = fallbackAction.meta;
                  const hasActions = Boolean(actionSourceKey && sourceMeta);
                  const disabled = actionSourceKey ? isSourceDisabled(actionSourceKey) : false;
                  const topModels = getTopFailedModels(stat.source, stat.models);
                  const totalFailedModels = Object.values(stat.models).filter((m) => m.failure > 0).length;

                  return (
                    <Fragment key={stat.source}>
                      <tr
                        className={styles.expandable}
                        onClick={() => toggleExpand(stat.source)}
                      >
                        <td>
                          <div className={styles.channelCell}>
                            <div>
                              {stat.providerName ? (
                                <>
                                  <span className={styles.channelName}>{stat.providerName}</span>
                                  <span className={styles.channelSecret}> ({stat.maskedKey})</span>
                                </>
                              ) : (
                                stat.maskedKey
                              )}
                            </div>
                            {sourceMeta?.summary && (
                              <div className={styles.channelMeta}>{sourceMeta.summary}</div>
                            )}
                          </div>
                        </td>
                        <td className={styles.kpiFailure}>{stat.failedCount.toLocaleString()}</td>
                        <td>{formatTimestamp(stat.lastFailTime)}</td>
                        <td>
                          {topModels.map(([model, modelStat]) => {
                            const percent = stat.failedCount > 0 ? ((modelStat.failure / stat.failedCount) * 100).toFixed(0) : '0';
                            const shortModel = model.length > 16 ? `${model.slice(0, 13)}...` : model;
                            return (
                              <span
                                key={model}
                                className={`${styles.failureModelTag} ${disabled ? styles.modelDisabled : ''}`}
                                title={`${model}: ${modelStat.failure} (${percent}%)${disabled ? ` - ${t('monitor.logs.removed')}` : ''}`}
                              >
                                {shortModel}
                              </span>
                            );
                          })}
                          {totalFailedModels > 2 && (
                            <span className={styles.moreModelsHint}>+{totalFailedModels - 2}</span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className={styles.tableActions}>
                            {hasActions && sourceMeta?.copyValue && (
                              <button
                                className={styles.actionBtn}
                                onClick={() => void copySourceValue(actionSourceKey)}
                              >
                                {t('common.copy')}
                              </button>
                            )}
                            {hasActions && sourceMeta?.editPath && (
                              <button
                                className={styles.actionBtn}
                                onClick={() => openEditor(actionSourceKey)}
                              >
                                {t('common.edit')}
                              </button>
                            )}
                            {hasActions && sourceMeta?.canToggle && (
                              <button
                                className={disabled ? styles.enableBtn : styles.disableBtn}
                                onClick={() => void toggleSource(actionSourceKey)}
                                disabled={pendingSource === actionSourceKey}
                              >
                                {pendingSource === actionSourceKey
                                  ? t('common.loading')
                                  : disabled
                                    ? '启用'
                                    : '禁用'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedChannel === stat.source && (
                        <tr key={`${stat.source}-detail`}>
                          <td colSpan={5} className={styles.expandDetail}>
                            <div className={styles.expandTableWrapper}>
                              <table className={styles.table}>
                                <thead>
                                  <tr>
                                    <th>{t('monitor.channel.model')}</th>
                                    <th>{t('monitor.channel.header_count')}</th>
                                    <th>{t('monitor.channel.header_rate')}</th>
                                    <th>{t('monitor.channel.success')}/{t('monitor.channel.failed')}</th>
                                    <th>{t('monitor.channel.header_recent')}</th>
                                    <th>{t('monitor.channel.header_time')}</th>
                                    <th>{t('monitor.logs.header_actions')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(stat.models)
                                    .filter(([, m]) => m.failure > 0)
                                    .sort((a, b) => {
                                      const aDisabled = disabled;
                                      const bDisabled = disabled;
                                      if (aDisabled !== bDisabled) {
                                        return aDisabled ? 1 : -1;
                                      }
                                      return b[1].failure - a[1].failure;
                                    })
                                    .map(([modelName, modelStat]) => {
                                      return (
                                        <tr key={modelName} className={disabled ? styles.modelDisabled : ''}>
                                          <td>{modelName}</td>
                                          <td>{modelStat.total.toLocaleString()}</td>
                                          <td className={getRateClassName(modelStat.successRate, styles)}>
                                            {modelStat.successRate.toFixed(1)}%
                                          </td>
                                          <td>
                                            <span className={styles.kpiSuccess}>{modelStat.success}</span>
                                            {' / '}
                                            <span className={styles.kpiFailure}>{modelStat.failure}</span>
                                          </td>
                                          <td>
                                            <div className={styles.statusBars}>
                                              {modelStat.recentRequests.map((req, i) => (
                                                <div
                                                  key={i}
                                                  className={`${styles.statusBar} ${req.failed ? styles.failure : styles.success}`}
                                                />
                                              ))}
                                            </div>
                                          </td>
                                          <td>{formatTimestamp(modelStat.lastTimestamp)}</td>
                                          <td>-</td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  );
}

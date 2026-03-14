import { useMemo, useState, useCallback, Fragment, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { MonitorChannelStatsItem } from '@/services/api';
import { useMonitorChannelActions } from '@/hooks';
import { useMonitorStore } from '@/stores';
import { serializeMonitorParams } from '@/stores/useMonitorStore';
import { TimeRangeSelector, type TimeRange } from './TimeRangeSelector';
import {
  formatTimestamp,
  getRateClassName,
  getProviderDisplayParts,
  buildMonitorTimeRangeParams,
  resolveMonitorSourceAction,
  type DateRange,
  type MonitorSourceMeta,
} from '@/utils/monitor';
import styles from '@/pages/MonitorPage.module.scss';

interface ChannelStatsProps {
  refreshKey: number;
  loading: boolean;
  providerMap: Record<string, string>;
  sourceAuthMap: Record<string, string>;
  sourceMetaMap: Record<string, MonitorSourceMeta>;
  onSourceChanged: () => Promise<void>;
}

interface ModelStat {
  requests: number;
  success: number;
  failed: number;
  successRate: number;
  recentRequests: { failed: boolean; timestamp: number }[];
  lastTimestamp: number;
}

interface ChannelStat {
  source: string;
  displayName: string;
  providerName: string | null;
  maskedKey: string;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  successRate: number;
  lastRequestTime: number;
  recentRequests: { failed: boolean; timestamp: number }[];
  models: Record<string, ModelStat>;
}

export function ChannelStats({
  refreshKey,
  loading,
  providerMap,
  sourceAuthMap,
  sourceMetaMap,
  onSourceChanged,
}: ChannelStatsProps) {
  const { t } = useTranslation();
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'success' | 'failed'>('');

  const [timeRange, setTimeRange] = useState<TimeRange>(1);
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const ensureChannelStats = useMonitorStore((state) => state.ensureChannelStats);

  const { pendingSource, copySourceValue, openEditor, toggleSource, isSourceDisabled } =
    useMonitorChannelActions({
      sourceMetaMap,
      onChanged: onSourceChanged,
    });

  const handleTimeRangeChange = useCallback((range: TimeRange, custom?: DateRange) => {
    setTimeRange(range);
    setCustomRange(custom);
  }, []);

  const formatChannelLabel = useCallback((source: string): string => {
    const normalizedSource = source || 'unknown';
    const { provider, masked } = getProviderDisplayParts(normalizedSource, providerMap);
    return provider ? `${provider} (${masked})` : masked;
  }, [providerMap]);

  const mapChannelStat = useCallback((item: MonitorChannelStatsItem): ChannelStat => {
    const source = item.source || 'unknown';
    const { provider, masked } = getProviderDisplayParts(source, providerMap);
    const displayName = provider ? `${provider} (${masked})` : masked;

    const models: Record<string, ModelStat> = {};
    (item.models || []).forEach((model) => {
      models[model.model] = {
        requests: model.requests || 0,
        success: model.success || 0,
        failed: model.failed || 0,
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
      totalRequests: item.total_requests || 0,
      successRequests: item.success_requests || 0,
      failedRequests: item.failed_requests || 0,
      successRate: item.success_rate || 0,
      lastRequestTime: item.last_request_at ? new Date(item.last_request_at).getTime() : 0,
      recentRequests: (item.recent_requests || []).map((req) => ({
        failed: !!req.failed,
        timestamp: req.timestamp ? new Date(req.timestamp).getTime() : 0,
      })),
      models,
    };
  }, [providerMap]);

  const params = useMemo(
    () => ({
      limit: 10,
      source: filterChannel || undefined,
      status: filterStatus || undefined,
      model: filterModel || undefined,
      ...buildMonitorTimeRangeParams(timeRange, customRange),
    }),
    [filterChannel, filterStatus, filterModel, timeRange, customRange]
  );
  const cacheKey = useMemo(() => serializeMonitorParams(params), [params]);
  const entry = useMonitorStore((state) => state.channelStatsCache[cacheKey]);

  useEffect(() => {
    void ensureChannelStats(params, refreshKey > 0);
  }, [ensureChannelStats, params, refreshKey]);

  const channelStats = useMemo(
    () => (entry?.data?.items || []).map(mapChannelStat),
    [entry?.data?.items, mapChannelStat]
  );

  const filters = useMemo(() => {
    const response = entry?.data;
    const sourceSet = new Set<string>(
      response?.filters?.sources && response.filters.sources.length > 0
        ? response.filters.sources
        : channelStats.map((stat) => stat.source)
    );
    const channels = Array.from(sourceSet)
      .filter((source) => !!source)
      .map((source) => ({ source, label: formatChannelLabel(source) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));

    const modelSet = new Set<string>(
      response?.filters?.models && response.filters.models.length > 0
        ? response.filters.models
        : channelStats.flatMap((stat) => Object.keys(stat.models))
    );

    return { channels, models: Array.from(modelSet).sort() };
  }, [entry?.data, channelStats, formatChannelLabel]);

  const statsLoading = !entry?.data && (entry?.loading ?? true);

  const filteredStats = useMemo(() => {
    return channelStats.filter((stat) => {
      if (filterChannel && stat.source !== filterChannel) return false;
      return true;
    });
  }, [channelStats, filterChannel]);

  useEffect(() => {
    if (expandedChannel && !filteredStats.some((stat) => stat.source === expandedChannel)) {
      setExpandedChannel(null);
    }
  }, [expandedChannel, filteredStats]);

  const toggleExpand = (source: string) => {
    setExpandedChannel(expandedChannel === source ? null : source);
  };

  return (
    <>
      <Card
        title={t('monitor.channel.title')}
        subtitle={t('monitor.channel.click_hint')}
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
          <select
            className={styles.logSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as '' | 'success' | 'failed')}
          >
            <option value="">{t('monitor.channel.all_status')}</option>
            <option value="success">{t('monitor.channel.only_success')}</option>
            <option value="failed">{t('monitor.channel.only_failed')}</option>
          </select>
        </div>

        <div className={styles.tableWrapper}>
          {(statsLoading || loading) ? (
            <div className={styles.emptyState}>{t('common.loading')}</div>
          ) : filteredStats.length === 0 ? (
            <div className={styles.emptyState}>{t('monitor.no_data')}</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('monitor.channel.header_name')}</th>
                  <th>{t('monitor.channel.header_count')}</th>
                  <th>{t('monitor.channel.header_rate')}</th>
                  <th>{t('monitor.channel.header_recent')}</th>
                  <th>{t('monitor.channel.header_time')}</th>
                  <th>{t('monitor.logs.header_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((stat) => {
                  const resolvedAction = resolveMonitorSourceAction(
                    stat.source,
                    sourceMetaMap,
                    undefined,
                    undefined,
                    sourceAuthMap
                  );
                  const actionSourceKey = resolvedAction.actionSourceKey;
                  const sourceMeta = resolvedAction.meta;
                  const disabled = actionSourceKey ? isSourceDisabled(actionSourceKey) : false;

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
                      <td>{stat.totalRequests.toLocaleString()}</td>
                      <td className={getRateClassName(stat.successRate, styles)}>
                        {stat.successRate.toFixed(1)}%
                      </td>
                      <td>
                        <div className={styles.statusBars}>
                          {stat.recentRequests.map((req, i) => (
                            <div
                              key={i}
                              className={`${styles.statusBar} ${req.failed ? styles.failure : styles.success}`}
                            />
                          ))}
                        </div>
                      </td>
                      <td>{formatTimestamp(stat.lastRequestTime)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className={styles.tableActions}>
                          <button
                            className={styles.actionBtn}
                            onClick={() => void copySourceValue(actionSourceKey || stat.source)}
                          >
                            {t('common.copy')}
                          </button>
                          {sourceMeta?.editPath && (
                            <button
                              className={styles.actionBtn}
                              onClick={() => openEditor(actionSourceKey || stat.source)}
                            >
                              {t('common.edit')}
                            </button>
                          )}
                          {sourceMeta?.canToggle && actionSourceKey && (
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
                        <td colSpan={6} className={styles.expandDetail}>
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
                                  <th>{t('common.status')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(stat.models)
                                  .sort((a, b) => {
                                    const aDisabled = disabled;
                                    const bDisabled = disabled;
                                    if (aDisabled !== bDisabled) {
                                      return aDisabled ? 1 : -1;
                                    }
                                    return b[1].requests - a[1].requests;
                                  })
                                  .map(([modelName, modelStat]) => {
                                    return (
                                      <tr key={modelName} className={disabled ? styles.modelDisabled : ''}>
                                        <td>{modelName}</td>
                                        <td>{modelStat.requests.toLocaleString()}</td>
                                        <td className={getRateClassName(modelStat.successRate, styles)}>
                                          {modelStat.successRate.toFixed(1)}%
                                        </td>
                                        <td>
                                          <span className={styles.kpiSuccess}>{modelStat.success}</span>
                                          {' / '}
                                          <span className={styles.kpiFailure}>{modelStat.failed}</span>
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
                )})}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  );
}

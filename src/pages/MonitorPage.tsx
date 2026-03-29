import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useMonitorStore, useThemeStore } from '@/stores';
import { KpiCards } from '@/components/monitor/KpiCards';
import { ModelDistributionChart } from '@/components/monitor/ModelDistributionChart';
import { DailyTrendChart } from '@/components/monitor/DailyTrendChart';
import { HourlyModelChart } from '@/components/monitor/HourlyModelChart';
import { HourlyTokenChart } from '@/components/monitor/HourlyTokenChart';
import { ChannelStats } from '@/components/monitor/ChannelStats';
import { FailureAnalysis } from '@/components/monitor/FailureAnalysis';
import { RequestLogs } from '@/components/monitor/RequestLogs';
import { ServiceHealthCard } from '@/components/monitor/ServiceHealthCard';
import styles from './MonitorPage.module.scss';

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  LineController,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// 时间范围选项
export type TimeRange = 'yesterday' | 'dayBeforeYesterday' | 1 | 7 | 14 | 30;

interface DeferredSectionProps {
  minHeight?: number;
  children: ReactNode;
}

function DeferredSection({ minHeight = 320, children }: DeferredSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px 0px' }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [visible]);

  return (
    <div ref={containerRef} style={!visible ? { minHeight } : undefined}>
      {visible ? children : null}
    </div>
  );
}

export function MonitorPage() {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const providerMetaEntry = useMonitorStore((state) => state.providerMeta);
  const ensureProviderMeta = useMonitorStore((state) => state.ensureProviderMeta);
  const isDark = resolvedTheme === 'dark';
  const loading = providerMetaEntry.loading && !providerMetaEntry.updatedAt;

  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiFilterDraft, setApiFilterDraft] = useState('');
  const [apiFilter, setApiFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const loadProviderMeta = useCallback(
    async (force = false) => {
      try {
        await ensureProviderMeta(force);
      } catch (err) {
        console.error('Monitor: Error loading provider meta:', err);
      }
    },
    [ensureProviderMeta]
  );

  const handleRefreshAll = useCallback(async () => {
    await loadProviderMeta(true);
    setRefreshKey((k) => k + 1);
  }, [loadProviderMeta]);

  useEffect(() => {
    void loadProviderMeta(false);
  }, [loadProviderMeta]);

  useHeaderRefresh(handleRefreshAll);

  // 处理时间范围变化
  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
  };

  // 处理 API 过滤应用（触发数据刷新）
  const handleApiFilterApply = () => {
    setApiFilter(apiFilterDraft.trim());
  };

  return (
    <div className={styles.container}>
      {loading && refreshKey === 0 && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      {/* 页面标题 */}
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('monitor.title')}</h1>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshAll}
            disabled={loading}
          >
            {loading ? t('common.loading') : t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {providerMetaEntry.error && <div className={styles.errorBox}>{providerMetaEntry.error}</div>}

      {/* 时间范围和 API 过滤 */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('monitor.time_range')}</span>
          <div className={styles.timeButtons}>
            <button
              className={`${styles.timeButton} ${timeRange === 'dayBeforeYesterday' ? styles.active : ''}`}
              onClick={() => handleTimeRangeChange('dayBeforeYesterday')}
            >
              {t('monitor.day_before_yesterday')}
            </button>
            <button
              className={`${styles.timeButton} ${timeRange === 'yesterday' ? styles.active : ''}`}
              onClick={() => handleTimeRangeChange('yesterday')}
            >
              {t('monitor.yesterday')}
            </button>
            {([1, 7, 14, 30] as TimeRange[]).map((range) => (
              <button
                key={range}
                className={`${styles.timeButton} ${timeRange === range ? styles.active : ''}`}
                onClick={() => handleTimeRangeChange(range)}
              >
                {range === 1 ? t('monitor.today') : t('monitor.last_n_days', { n: range })}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t('monitor.api_filter')}</span>
          <input
            type="text"
            className={styles.filterInput}
            placeholder={t('monitor.api_filter_placeholder')}
            value={apiFilterDraft}
            onChange={(e) => setApiFilterDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleApiFilterApply();
              }
            }}
          />
          <Button variant="secondary" size="sm" onClick={handleApiFilterApply}>
            {t('monitor.apply')}
          </Button>
        </div>
      </div>

      {/* KPI 卡片 */}
      <KpiCards timeRange={timeRange} apiFilter={apiFilter} refreshKey={refreshKey} />

      {/* 图表区域 */}
      <div className={styles.chartsGrid}>
        <ModelDistributionChart timeRange={timeRange} apiFilter={apiFilter} isDark={isDark} refreshKey={refreshKey} />
        <DailyTrendChart timeRange={timeRange} apiFilter={apiFilter} isDark={isDark} refreshKey={refreshKey} />
      </div>

      {/* 小时级图表 */}
      <HourlyModelChart timeRange={timeRange} apiFilter={apiFilter} isDark={isDark} refreshKey={refreshKey} />
      <HourlyTokenChart timeRange={timeRange} apiFilter={apiFilter} isDark={isDark} refreshKey={refreshKey} />

      {/* 服务健康热力图 */}
      <ServiceHealthCard refreshKey={refreshKey} />

      {/* 统计表格 */}
      <DeferredSection minHeight={520}>
        <div className={styles.statsGrid}>
          <ChannelStats
            refreshKey={refreshKey}
            loading={providerMetaEntry.loading}
            providerMap={providerMetaEntry.data?.providerMap || {}}
            sourceAuthMap={providerMetaEntry.data?.sourceAuthMap || {}}
            sourceMetaMap={providerMetaEntry.data?.sourceMetaMap || {}}
            onSourceChanged={handleRefreshAll}
          />
          <FailureAnalysis
            refreshKey={refreshKey}
            loading={providerMetaEntry.loading}
            providerMap={providerMetaEntry.data?.providerMap || {}}
            sourceAuthMap={providerMetaEntry.data?.sourceAuthMap || {}}
            sourceMetaMap={providerMetaEntry.data?.sourceMetaMap || {}}
            onSourceChanged={handleRefreshAll}
          />
        </div>
      </DeferredSection>

      <DeferredSection minHeight={640}>
        <RequestLogs
          refreshKey={refreshKey}
          loading={providerMetaEntry.loading}
          providerMap={providerMetaEntry.data?.providerMap || {}}
          providerTypeMap={providerMetaEntry.data?.providerTypeMap || {}}
          apiFilter={apiFilter}
          authIndexMap={providerMetaEntry.data?.authIndexMap || {}}
          sourceAuthMap={providerMetaEntry.data?.sourceAuthMap || {}}
          sourceMetaMap={providerMetaEntry.data?.sourceMetaMap || {}}
          onSourceChanged={handleRefreshAll}
        />
      </DeferredSection>
    </div>
  );
}

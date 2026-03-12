import { useState, useEffect, useCallback } from 'react';
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
import { useThemeStore } from '@/stores';
import { providersApi, authFilesApi, monitorApi } from '@/services/api';
import { KpiCards } from '@/components/monitor/KpiCards';
import { ModelDistributionChart } from '@/components/monitor/ModelDistributionChart';
import { DailyTrendChart } from '@/components/monitor/DailyTrendChart';
import { HourlyModelChart } from '@/components/monitor/HourlyModelChart';
import { HourlyTokenChart } from '@/components/monitor/HourlyTokenChart';
import { ChannelStats } from '@/components/monitor/ChannelStats';
import { FailureAnalysis } from '@/components/monitor/FailureAnalysis';
import { RequestLogs } from '@/components/monitor/RequestLogs';
import { ServiceHealthCard } from '@/components/monitor/ServiceHealthCard';
import { hasDisableAllModelsRule } from '@/components/providers/utils';
import {
  formatGeminiSource,
  formatMonitorAlias,
  getProviderDisplayParts,
  type MonitorSourceMeta,
} from '@/utils/monitor';
import { buildCandidateUsageSourceIds } from '@/utils/usage';
import { maskApiKey } from '@/utils/format';
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

const getHostLabel = (value?: string) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(normalized).host;
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }
};

const buildSourceSummary = (prefix?: string, baseUrl?: string, fallback?: string) =>
  [String(prefix ?? '').trim(), getHostLabel(baseUrl), String(fallback ?? '').trim()]
    .filter(Boolean)
    .join(' · ');

const collectSourceAliases = (input: {
  apiKey?: string;
  prefix?: string;
  extra?: Array<string | undefined>;
}) => {
  const aliases = new Set<string>();
  const apiKey = String(input.apiKey ?? '').trim();
  const prefix = String(input.prefix ?? '').trim();

  if (apiKey) {
    aliases.add(apiKey);
    aliases.add(maskApiKey(apiKey));
  }

  if (prefix) {
    aliases.add(prefix);
  }

  buildCandidateUsageSourceIds({ apiKey: apiKey || undefined, prefix: prefix || undefined }).forEach(
    (id) => aliases.add(id)
  );

  (input.extra || []).forEach((value) => {
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      aliases.add(trimmed);
    }
  });

  return Array.from(aliases);
};

const collectAuthFileAliases = (name?: string, authIndex?: string) => {
  const aliases = new Set<string>();
  const normalizedName = String(name ?? '').trim();
  const normalizedAuthIndex = String(authIndex ?? '').trim();
  const nameWithoutExt = normalizedName.replace(/\.[^/.]+$/, '').trim();
  const emailLocalPartBase = (() => {
    if (!nameWithoutExt.includes('@')) return '';
    let localPart = nameWithoutExt.split('@')[0]?.trim() || '';
    const knownPrefixes = [
      'codex-',
      'gemini-',
      'gemini-cli-',
      'claude-',
      'vertex-',
      'antigravity-',
      'iflow-',
      'aistudio-',
      'qwen-',
      'kiro-',
      'kimi-',
    ];
    const lowerLocalPart = localPart.toLowerCase();
    const matchedPrefix = knownPrefixes.find((prefix) => lowerLocalPart.startsWith(prefix));
    if (matchedPrefix) {
      localPart = localPart.slice(matchedPrefix.length).trim();
    }
    return localPart;
  })();

  if (normalizedName) {
    aliases.add(normalizedName);
    aliases.add(maskApiKey(normalizedName));
    aliases.add(getProviderDisplayParts(normalizedName, {}).masked);
  }

  if (nameWithoutExt) {
    aliases.add(nameWithoutExt);
    aliases.add(maskApiKey(nameWithoutExt));
    aliases.add(formatMonitorAlias(nameWithoutExt));
    aliases.add(formatGeminiSource(nameWithoutExt));
    aliases.add(getProviderDisplayParts(nameWithoutExt, {}).masked);
  }

  if (emailLocalPartBase) {
    aliases.add(emailLocalPartBase);
    aliases.add(maskApiKey(emailLocalPartBase));
    aliases.add(formatMonitorAlias(emailLocalPartBase));
  }

  if (normalizedAuthIndex) {
    aliases.add(normalizedAuthIndex);
  }

  return Array.from(aliases);
};

export function MonitorPage() {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  // 状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiFilter, setApiFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [providerMap, setProviderMap] = useState<Record<string, string>>({});
  const [providerTypeMap, setProviderTypeMap] = useState<Record<string, string>>({});
  const [authIndexMap, setAuthIndexMap] = useState<Record<string, string>>({});
  const [sourceAuthMap, setSourceAuthMap] = useState<Record<string, string>>({});
  const [sourceMetaMap, setSourceMetaMap] = useState<Record<string, MonitorSourceMeta>>({});

  // 加载渠道名称映射（支持所有提供商类型）
  const loadProviderMap = useCallback(async () => {
    try {
      const map: Record<string, string> = {};
      const typeMap: Record<string, string> = {};
      const sourceMeta: Record<string, MonitorSourceMeta> = {};
      const registerSourceMeta = (
        aliases: string[],
        providerName: string,
        providerType: string,
        meta: MonitorSourceMeta
      ) => {
        aliases.forEach((alias) => {
          const key = String(alias || '').trim();
          if (!key) return;
          if (!(key in map)) {
            map[key] = providerName;
          }
          if (!(key in typeMap)) {
            typeMap[key] = providerType;
          }
          if (!(key in sourceMeta)) {
            sourceMeta[key] = {
              ...meta,
              source: key,
              canonicalSource: meta.canonicalSource || meta.source,
            };
          }
        });
      };

      // 并行加载所有提供商配置
      const [openaiProviders, geminiKeys, claudeConfigs, codexConfigs, vertexConfigs, authFilesRes, requestLogsRes] = await Promise.all([
        providersApi.getOpenAIProviders().catch(() => []),
        providersApi.getGeminiKeys().catch(() => []),
        providersApi.getClaudeConfigs().catch(() => []),
        providersApi.getCodexConfigs().catch(() => []),
        providersApi.getVertexConfigs().catch(() => []),
        authFilesApi.list().catch(() => ({ files: [] })),
        monitorApi.getRequestLogs({ page: 1, page_size: 500 }).catch(() => ({ items: [] })),
      ]);

      // 处理 OpenAI 兼容提供商
      openaiProviders.forEach((provider, providerIndex) => {
        const providerName = provider.headers?.['X-Provider'] || provider.name || 'unknown';
        const apiKeyEntries = provider.apiKeyEntries || [];
        const providerAliases = collectSourceAliases({
          prefix: provider.prefix,
          extra: [provider.name],
        });
        registerSourceMeta(providerAliases, providerName, 'OpenAI', {
          source: provider.prefix?.trim() || provider.name || providerName,
          canonicalSource: provider.prefix?.trim() || provider.name || providerName,
          kind: 'openai',
          providerType: 'OpenAI',
          disabled: hasDisableAllModelsRule(provider.excludedModels),
          canToggle: true,
          copyValue: provider.name || provider.prefix || providerName,
          editPath: `/ai-providers/openai/${providerIndex}`,
          summary: buildSourceSummary(provider.prefix, provider.baseUrl, provider.name),
        });
        apiKeyEntries.forEach((entry) => {
          const apiKey = entry.apiKey;
          if (apiKey) {
            registerSourceMeta(collectSourceAliases({ apiKey }), providerName, 'OpenAI', {
              source: apiKey,
              canonicalSource: provider.prefix?.trim() || provider.name || apiKey,
              kind: 'openai',
              providerType: 'OpenAI',
              disabled: hasDisableAllModelsRule(provider.excludedModels),
              canToggle: true,
              copyValue: apiKey,
              editPath: `/ai-providers/openai/${providerIndex}`,
              summary: buildSourceSummary(provider.prefix, provider.baseUrl, provider.name),
            });
          }
        });
      });

      // 处理 Gemini 提供商
      geminiKeys.forEach((config, index) => {
        const apiKey = config.apiKey;
        if (apiKey) {
          const providerName = config.prefix?.trim() || 'Gemini';
          registerSourceMeta(collectSourceAliases({ apiKey, prefix: config.prefix }), providerName, 'Gemini', {
            source: apiKey,
            canonicalSource: apiKey,
            kind: 'gemini',
            providerType: 'Gemini',
            disabled: hasDisableAllModelsRule(config.excludedModels),
            canToggle: true,
            copyValue: apiKey,
            editPath: `/ai-providers/gemini/${index}`,
            configIndex: index,
            summary: buildSourceSummary(config.prefix, config.baseUrl),
          });
        }
      });

      claudeConfigs.forEach((config, index) => {
        const apiKey = config.apiKey;
        if (apiKey) {
          const providerName = config.prefix?.trim() || 'Claude';
          registerSourceMeta(collectSourceAliases({ apiKey, prefix: config.prefix }), providerName, 'Claude', {
            source: apiKey,
            canonicalSource: apiKey,
            kind: 'claude',
            providerType: 'Claude',
            disabled: hasDisableAllModelsRule(config.excludedModels),
            canToggle: true,
            copyValue: apiKey,
            editPath: `/ai-providers/claude/${index}`,
            configIndex: index,
            summary: buildSourceSummary(config.prefix, config.baseUrl),
          });
        }
      });

      codexConfigs.forEach((config, index) => {
        const apiKey = config.apiKey;
        if (apiKey) {
          const providerName = config.prefix?.trim() || 'Codex';
          registerSourceMeta(collectSourceAliases({ apiKey, prefix: config.prefix }), providerName, 'Codex', {
            source: apiKey,
            canonicalSource: apiKey,
            kind: 'codex',
            providerType: 'Codex',
            disabled: hasDisableAllModelsRule(config.excludedModels),
            canToggle: true,
            copyValue: apiKey,
            editPath: `/ai-providers/codex/${index}`,
            configIndex: index,
            summary: buildSourceSummary(config.prefix, config.baseUrl),
          });
        }
      });

      vertexConfigs.forEach((config, index) => {
        const apiKey = config.apiKey;
        if (apiKey) {
          const providerName = config.prefix?.trim() || 'Vertex';
          registerSourceMeta(collectSourceAliases({ apiKey, prefix: config.prefix }), providerName, 'Vertex', {
            source: apiKey,
            canonicalSource: apiKey,
            kind: 'vertex',
            providerType: 'Vertex',
            disabled: hasDisableAllModelsRule(config.excludedModels),
            canToggle: true,
            copyValue: apiKey,
            editPath: `/ai-providers/vertex/${index}`,
            configIndex: index,
            summary: buildSourceSummary(config.prefix, config.baseUrl),
          });
        }
      });

      // 处理 OAuth 认证文件
      const authTypeToProvider: Record<string, string> = {
        claude: 'Claude',
        gemini: 'Gemini',
        'gemini-cli': 'Gemini',
        codex: 'Codex',
        vertex: 'Vertex',
        aistudio: 'AI Studio',
        qwen: 'Qwen',
        antigravity: 'Antigravity',
        iflow: 'iFlow',
      };
      const authFiles = authFilesRes?.files || [];
      const authIdxMap: Record<string, string> = {};
      const nextSourceAuthMap: Record<string, string> = {};
      authFiles.forEach((file) => {
        const name = file.name;
        if (!name) return;
        const fileType = file.type || 'unknown';
        const providerName = authTypeToProvider[fileType] || fileType;
        const rawAuthIndex = (file as Record<string, unknown>)['auth_index'] ?? file.authIndex;
        const authIndexKey =
          rawAuthIndex !== undefined && rawAuthIndex !== null
            ? String(rawAuthIndex).trim()
            : '';
        registerSourceMeta(collectAuthFileAliases(name, authIndexKey), providerName, providerName, {
          source: name,
          canonicalSource: name,
          kind: 'auth-file',
          providerType: providerName,
          disabled: Boolean(file.disabled),
          canToggle: true,
          copyValue: name,
          editPath: '/auth-files',
          authFileName: name,
          summary: name,
        });
        if (rawAuthIndex !== undefined && rawAuthIndex !== null) {
          if (authIndexKey) {
            authIdxMap[authIndexKey] = name;
          }
        }
      });

      (requestLogsRes?.items || []).forEach((item) => {
        const source = String(item?.source || '').trim();
        const authIndexKey = String(item?.auth_index || '').trim();
        const authFileName = authIdxMap[authIndexKey] || '';
        if (!source || !authFileName) return;
        if (!(source in nextSourceAuthMap)) {
          nextSourceAuthMap[source] = authFileName;
        }
      });

      setProviderMap(map);
      setProviderTypeMap(typeMap);
      setAuthIndexMap(authIdxMap);
      setSourceAuthMap(nextSourceAuthMap);
      setSourceMetaMap(sourceMeta);
    } catch (err) {
      console.warn('Monitor: Failed to load provider map:', err);
    }
  }, []);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadProviderMap();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      console.error('Monitor: Error loading data:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t, loadProviderMap]);

  // 初始加载
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 响应头部刷新
  useHeaderRefresh(loadData);

  // 处理时间范围变化
  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
  };

  // 处理 API 过滤应用（触发数据刷新）
  const handleApiFilterApply = () => {
    setRefreshKey((k) => k + 1);
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
            onClick={loadData}
            disabled={loading}
          >
            {loading ? t('common.loading') : t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && <div className={styles.errorBox}>{error}</div>}

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
            value={apiFilter}
            onChange={(e) => setApiFilter(e.target.value)}
          />
          <Button variant="secondary" size="sm" onClick={handleApiFilterApply}>
            {t('monitor.apply')}
          </Button>
        </div>
      </div>

      {/* KPI 卡片 */}
      <KpiCards timeRange={timeRange} apiFilter={apiFilter} />

      {/* 图表区域 */}
      <div className={styles.chartsGrid}>
        <ModelDistributionChart timeRange={timeRange} apiFilter={apiFilter} isDark={isDark} />
        <DailyTrendChart timeRange={timeRange} apiFilter={apiFilter} isDark={isDark} />
      </div>

      {/* 小时级图表 */}
      <HourlyModelChart timeRange={timeRange} apiFilter={apiFilter} isDark={isDark} />
      <HourlyTokenChart timeRange={timeRange} apiFilter={apiFilter} isDark={isDark} />

      {/* 服务健康热力图 */}
      <ServiceHealthCard />

      {/* 统计表格 */}
      <div className={styles.statsGrid}>
        <ChannelStats
          refreshKey={refreshKey}
          loading={loading}
          providerMap={providerMap}
          sourceAuthMap={sourceAuthMap}
          sourceMetaMap={sourceMetaMap}
          onSourceChanged={loadData}
        />
        <FailureAnalysis
          refreshKey={refreshKey}
          loading={loading}
          providerMap={providerMap}
          sourceAuthMap={sourceAuthMap}
          sourceMetaMap={sourceMetaMap}
          onSourceChanged={loadData}
        />
      </div>

      {/* 请求日志 */}
      <RequestLogs
        refreshKey={refreshKey}
        loading={loading}
        providerMap={providerMap}
        providerTypeMap={providerTypeMap}
        apiFilter={apiFilter}
        authIndexMap={authIndexMap}
        sourceAuthMap={sourceAuthMap}
        sourceMetaMap={sourceMetaMap}
        onSourceChanged={loadData}
      />
    </div>
  );
}

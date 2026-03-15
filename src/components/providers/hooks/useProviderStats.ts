import { useCallback, useRef, useState } from 'react';
import { useInterval } from '@/hooks/useInterval';
import {
  monitorApi,
  type MonitorKeyStatsResponse,
  type MonitorRequestLogItem,
} from '@/services/api/monitor';
import {
  blocksToStatusBarData,
  normalizeUsageSourceId,
  type KeyStats,
  type StatusBarData,
  type UsageDetail,
} from '@/utils/usage';

const STALE_TIME_MS = 240_000;
const REQUEST_LOG_PAGE_SIZE = 2000;

const EMPTY_KEY_STATS: KeyStats = { bySource: {}, byAuthIndex: {} };
const EMPTY_USAGE_DETAILS: UsageDetail[] = [];

function processKeyStatsResponse(response: MonitorKeyStatsResponse) {
  const { by_source, by_auth_index, block_config } = response;

  const bySource: Record<string, { success: number; failure: number }> = {};
  const byAuthIndex: Record<string, { success: number; failure: number }> = {};
  const statusBarBySource = new Map<string, StatusBarData>();
  const registerSource = (sourceKey: string, entry: (typeof by_source)[string]) => {
    const statusBar = blocksToStatusBarData(
      entry.blocks,
      block_config.window_start_ms,
      block_config.duration_ms
    );
    const normalizedKey = normalizeUsageSourceId(sourceKey);
    const aliases = normalizedKey && normalizedKey !== sourceKey ? [sourceKey, normalizedKey] : [sourceKey];

    aliases.forEach((alias) => {
      if (!alias) return;
      if (!(alias in bySource)) {
        bySource[alias] = { success: entry.success, failure: entry.failure };
      }
      if (!statusBarBySource.has(alias)) {
        statusBarBySource.set(alias, statusBar);
      }
    });
  };

  for (const [key, entry] of Object.entries(by_source)) {
    registerSource(key, entry);
  }
  for (const [key, entry] of Object.entries(by_auth_index)) {
    byAuthIndex[key] = { success: entry.success, failure: entry.failure };
  }

  return {
    keyStats: { bySource, byAuthIndex } as KeyStats,
    statusBarBySource,
  };
}

function mapRequestLogsToUsageDetails(items: MonitorRequestLogItem[]): UsageDetail[] {
  return items.reduce<UsageDetail[]>((acc, item) => {
    const source = normalizeUsageSourceId(item.source);
    if (!source) return acc;
    const timestampMs = Date.parse(item.timestamp);
    acc.push({
      timestamp: item.timestamp,
      source,
      auth_index: item.auth_index,
      failed: item.failed,
      __timestampMs: Number.isNaN(timestampMs) ? undefined : timestampMs,
    });
    return acc;
  }, []);
}

export const useProviderStats = () => {
  const [keyStats, setKeyStats] = useState<KeyStats>(EMPTY_KEY_STATS);
  const [usageDetails, setUsageDetails] = useState<UsageDetail[]>(EMPTY_USAGE_DETAILS);
  const [statusBarBySource, setStatusBarBySource] = useState<Map<string, StatusBarData>>(
    () => new Map()
  );
  const [isLoading, setIsLoading] = useState(false);
  const lastRefreshedAt = useRef<number | null>(null);

  const loadKeyStats = useCallback(async () => {
    if (lastRefreshedAt.current && Date.now() - lastRefreshedAt.current < STALE_TIME_MS) {
      return;
    }
    setIsLoading(true);
    try {
      const [keyStatsResponse, requestLogsResponse] = await Promise.all([
        monitorApi.getKeyStats(),
        monitorApi.getRequestLogs({ page: 1, page_size: REQUEST_LOG_PAGE_SIZE }),
      ]);
      const result = processKeyStatsResponse(keyStatsResponse);
      setKeyStats(result.keyStats);
      setStatusBarBySource(result.statusBarBySource);
      setUsageDetails(mapRequestLogsToUsageDetails(requestLogsResponse.items || []));
      lastRefreshedAt.current = Date.now();
    } catch {
      // silent — MainLayout 已做 404 提示
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshKeyStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const [keyStatsResponse, requestLogsResponse] = await Promise.all([
        monitorApi.getKeyStats(),
        monitorApi.getRequestLogs({ page: 1, page_size: REQUEST_LOG_PAGE_SIZE }),
      ]);
      const result = processKeyStatsResponse(keyStatsResponse);
      setKeyStats(result.keyStats);
      setStatusBarBySource(result.statusBarBySource);
      setUsageDetails(mapRequestLogsToUsageDetails(requestLogsResponse.items || []));
      lastRefreshedAt.current = Date.now();
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useInterval(() => {
    void refreshKeyStats();
  }, 240_000);

  return { keyStats, usageDetails, statusBarBySource, loadKeyStats, refreshKeyStats, isLoading };
};

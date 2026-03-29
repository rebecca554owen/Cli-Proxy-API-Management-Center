/**
 * 配置状态管理
 * 从原项目 src/core/config-service.js 迁移
 */

import { create } from 'zustand';
import type { Config } from '@/types';
import type { ConfigSectionValueMap, RawConfigSection } from '@/types/config';
import { configApi } from '@/services/api/config';
import { CACHE_EXPIRY_MS } from '@/utils/constants';

type ConfigSectionValue =
  | NonNullable<Config['raw']>[RawConfigSection]
  | Exclude<ReturnType<typeof extractSectionValue>, undefined>;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

type FullConfigCache = CacheEntry<Config>;
type SectionConfigCache = CacheEntry<ConfigSectionValue>;
type ConfigCache = FullConfigCache | SectionConfigCache;

type SectionValueMap = ConfigSectionValueMap;

interface ConfigState {
  config: Config | null;
  cache: Map<string, ConfigCache>;
  loading: boolean;
  error: string | null;

  // 操作
  fetchConfig: {
    (section?: undefined, forceRefresh?: boolean): Promise<Config>;
    <K extends RawConfigSection>(
      section: K,
      forceRefresh?: boolean
    ): Promise<SectionValueMap[K] | undefined>;
  };
  updateConfigValue: <K extends RawConfigSection>(section: K, value: SectionValueMap[K]) => void;
  clearCache: (section?: RawConfigSection) => void;
  isCacheValid: (section?: RawConfigSection) => boolean;
}

let configRequestToken = 0;
let inFlightConfigRequest: { id: number; promise: Promise<Config> } | null = null;

type ConfigPropertyKey = Exclude<keyof Config, 'raw'>;

const SECTION_CONFIG_KEYS: Record<RawConfigSection, ConfigPropertyKey> = {
  debug: 'debug',
  'proxy-url': 'proxyUrl',
  'request-retry': 'requestRetry',
  'quota-exceeded': 'quotaExceeded',
  'usage-statistics-enabled': 'usageStatisticsEnabled',
  'request-log': 'requestLog',
  'logging-to-file': 'loggingToFile',
  'logs-max-total-size-mb': 'logsMaxTotalSizeMb',
  'usage-retention-days': 'usageRetentionDays',
  'ws-auth': 'wsAuth',
  'force-model-prefix': 'forceModelPrefix',
  'routing/strategy': 'routingStrategy',
  'api-keys': 'apiKeys',
  ampcode: 'ampcode',
  'gemini-api-key': 'geminiApiKeys',
  'codex-api-key': 'codexApiKeys',
  'claude-api-key': 'claudeApiKeys',
  'vertex-api-key': 'vertexApiKeys',
  'openai-compatibility': 'openaiCompatibility',
  'oauth-excluded-models': 'oauthExcludedModels',
};

const SECTION_KEYS = Object.keys(SECTION_CONFIG_KEYS) as RawConfigSection[];

const MAX_CACHE_ENTRIES = SECTION_KEYS.length + 1;

const pruneExpiredCache = (cache: Map<string, ConfigCache>, now: number) => {
  const nextCache = new Map<string, ConfigCache>();

  cache.forEach((entry, key) => {
    if (now - entry.timestamp < CACHE_EXPIRY_MS) {
      nextCache.set(key, entry);
    }
  });

  if (nextCache.size <= MAX_CACHE_ENTRIES) {
    return nextCache;
  }

  return new Map(
    Array.from(nextCache.entries())
      .sort(([, left], [, right]) => right.timestamp - left.timestamp)
      .slice(0, MAX_CACHE_ENTRIES)
  );
};

const setConfigSectionValue = <K extends RawConfigSection>(
  config: Config,
  section: K,
  value: SectionValueMap[K]
) => {
  const configKey = SECTION_CONFIG_KEYS[section];
  (config[configKey] as SectionValueMap[K] | undefined) = value;
};

const extractSectionValue = <K extends RawConfigSection>(config: Config | null, section?: K) => {
  if (!config) return undefined;
  if (!section) return undefined;

  const configKey = SECTION_CONFIG_KEYS[section];
  const sectionValue = config[configKey];
  if (sectionValue !== undefined) {
    return sectionValue as SectionValueMap[K];
  }

  return config.raw?.[section] as SectionValueMap[K] | undefined;
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  cache: new Map(),
  loading: false,
  error: null,

  fetchConfig: (async (section?: RawConfigSection, forceRefresh: boolean = false) => {
    const { cache, isCacheValid } = get();
    const now = Date.now();
    const prunedCache = pruneExpiredCache(cache, now);

    if (prunedCache.size !== cache.size) {
      set({ cache: prunedCache });
    }

    // 检查缓存
    const cacheKey = section || '__full__';
    if (!forceRefresh && isCacheValid(section)) {
      const cached = prunedCache.get(cacheKey);
      if (cached) {
        return cached.data;
      }
    }

    // section 缓存未命中但 full 缓存可用时，直接复用已获取到的配置，避免重复 /config 请求
    if (!forceRefresh && section && isCacheValid()) {
      const fullCached = prunedCache.get('__full__');
      if (fullCached?.data) {
        return extractSectionValue(fullCached.data as Config, section);
      }
    }

    // 同一时刻合并多个 /config 请求（如 StrictMode 或多个页面同时触发）
    if (inFlightConfigRequest) {
      const data = await inFlightConfigRequest.promise;
      return section ? extractSectionValue(data, section) : data;
    }

    // 获取新数据
    set({ loading: true, error: null });

    const requestId = (configRequestToken += 1);
    try {
      const requestPromise = configApi.getConfig();
      inFlightConfigRequest = { id: requestId, promise: requestPromise };
      const data = await requestPromise;
      // 如果在请求过程中连接已被切换/登出，则忽略旧请求的结果，避免覆盖新会话的状态
      if (requestId !== configRequestToken) {
        return section ? extractSectionValue(data, section) : data;
      }

      // 更新缓存
      const newCache = pruneExpiredCache(new Map(prunedCache), now);
      newCache.set('__full__', { data, timestamp: now });
      SECTION_KEYS.forEach((key) => {
        const value = extractSectionValue(data, key);
        if (value !== undefined) {
          newCache.set(key, { data: value, timestamp: now });
        }
      });

      set({
        config: data,
        cache: newCache,
        loading: false,
      });

      return section ? extractSectionValue(data, section) : data;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Failed to fetch config';
      if (requestId === configRequestToken) {
        set({
          error: message || 'Failed to fetch config',
          loading: false,
        });
      }
      throw error;
    } finally {
      if (inFlightConfigRequest?.id === requestId) {
        inFlightConfigRequest = null;
      }
    }
  }) as ConfigState['fetchConfig'],

  updateConfigValue: (section, value) => {
    set((state) => {
      const raw = { ...(state.config?.raw || {}) };
      raw[section] = value;
      const nextConfig: Config = { ...(state.config || {}), raw };

      setConfigSectionValue(nextConfig, section, value);

      return { config: nextConfig };
    });

    // 清除该 section 的缓存
    get().clearCache(section);
  },

  clearCache: (section) => {
    const { cache } = get();
    const newCache = new Map(cache);

    if (section) {
      newCache.delete(section);
      // 同时清除完整配置缓存
      newCache.delete('__full__');

      set({ cache: newCache });
      return;
    } else {
      newCache.clear();
    }

    // 清除全部缓存一般代表“切换连接/登出/全量刷新”，需要让 in-flight 的旧请求失效
    configRequestToken += 1;
    inFlightConfigRequest = null;

    set({ config: null, cache: newCache, loading: false, error: null });
  },

  isCacheValid: (section) => {
    const { cache } = get();
    const cacheKey = section || '__full__';
    const now = Date.now();
    const prunedCache = pruneExpiredCache(cache, now);

    if (prunedCache.size !== cache.size) {
      set({ cache: prunedCache });
    }

    const cached = prunedCache.get(cacheKey);

    if (!cached) return false;

    return now - cached.timestamp < CACHE_EXPIRY_MS;
  },
}));

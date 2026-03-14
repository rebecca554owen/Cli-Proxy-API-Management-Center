import { create } from 'zustand';
import { authFilesApi, monitorApi, providersApi } from '@/services/api';
import type {
  MonitorChannelStatsResponse,
  MonitorFailureAnalysisResponse,
  MonitorHourlyModelsData,
  MonitorHourlyTokensData,
  MonitorKpiData,
  MonitorModelDistributionItem,
  MonitorRequestLogsResponse,
  MonitorServiceHealthData,
  MonitorTimeRangeQuery,
  MonitorDailyTrendItem,
} from '@/services/api/monitor';
import { hasDisableAllModelsRule } from '@/components/providers/utils';
import type { MonitorSourceMeta } from '@/utils/monitor';
import { formatGeminiSource, formatMonitorAlias, getProviderDisplayParts } from '@/utils/monitor';
import { buildCandidateUsageSourceIds } from '@/utils/usage';
import { maskApiKey } from '@/utils/format';
import { maskSecret } from '@/utils/monitor';

interface MonitorProviderMeta {
  providerMap: Record<string, string>;
  providerTypeMap: Record<string, string>;
  authIndexMap: Record<string, string>;
  sourceAuthMap: Record<string, string>;
  sourceMetaMap: Record<string, MonitorSourceMeta>;
}

interface MonitorResourceEntry<T> {
  data?: T;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
  promise?: Promise<T> | null;
}

interface MonitorStoreState {
  providerMeta: MonitorResourceEntry<MonitorProviderMeta>;
  kpiCache: Record<string, MonitorResourceEntry<MonitorKpiData>>;
  modelDistributionCache: Record<string, MonitorResourceEntry<{ items: MonitorModelDistributionItem[] }>>;
  dailyTrendCache: Record<string, MonitorResourceEntry<{ items: MonitorDailyTrendItem[] }>>;
  hourlyModelsCache: Record<string, MonitorResourceEntry<MonitorHourlyModelsData>>;
  hourlyTokensCache: Record<string, MonitorResourceEntry<MonitorHourlyTokensData>>;
  serviceHealth: MonitorResourceEntry<MonitorServiceHealthData>;
  channelStatsCache: Record<string, MonitorResourceEntry<MonitorChannelStatsResponse>>;
  failureAnalysisCache: Record<string, MonitorResourceEntry<MonitorFailureAnalysisResponse>>;
  requestLogsCache: Record<string, MonitorResourceEntry<MonitorRequestLogsResponse>>;
  ensureProviderMeta: (force?: boolean) => Promise<MonitorProviderMeta>;
  ensureKpi: (params?: MonitorTimeRangeQuery, force?: boolean) => Promise<MonitorKpiData>;
  ensureModelDistribution: (
    params?: MonitorTimeRangeQuery & { sort?: 'requests' | 'tokens'; limit?: number },
    force?: boolean
  ) => Promise<{ items: MonitorModelDistributionItem[] }>;
  ensureDailyTrend: (params?: MonitorTimeRangeQuery, force?: boolean) => Promise<{ items: MonitorDailyTrendItem[] }>;
  ensureHourlyModels: (
    params?: MonitorTimeRangeQuery & { hours?: number; limit?: number },
    force?: boolean
  ) => Promise<MonitorHourlyModelsData>;
  ensureHourlyTokens: (
    params?: MonitorTimeRangeQuery & { hours?: number },
    force?: boolean
  ) => Promise<MonitorHourlyTokensData>;
  ensureServiceHealth: (force?: boolean) => Promise<MonitorServiceHealthData>;
  ensureChannelStats: (
    params?: MonitorTimeRangeQuery & {
      limit?: number;
      api?: string;
      api_key?: string;
      api_filter?: string;
      model?: string;
      source?: string;
      channel?: string;
      status?: '' | 'success' | 'failed';
    },
    force?: boolean
  ) => Promise<MonitorChannelStatsResponse>;
  ensureFailureAnalysis: (
    params?: MonitorTimeRangeQuery & {
      limit?: number;
      api?: string;
      api_key?: string;
      api_filter?: string;
      model?: string;
      source?: string;
      channel?: string;
      status?: '' | 'success' | 'failed';
    },
    force?: boolean
  ) => Promise<MonitorFailureAnalysisResponse>;
  ensureRequestLogs: (
    params?: MonitorTimeRangeQuery & {
      page?: number;
      page_size?: number;
      api?: string;
      api_key?: string;
      api_filter?: string;
      model?: string;
      source?: string;
      channel?: string;
      status?: '' | 'success' | 'failed';
    },
    force?: boolean
  ) => Promise<MonitorRequestLogsResponse>;
  invalidateAll: () => void;
}

const MONITOR_CACHE_TTL = {
  providerMeta: 5 * 60 * 1000,
  kpi: 30 * 1000,
  modelDistribution: 30 * 1000,
  dailyTrend: 30 * 1000,
  hourlyModels: 30 * 1000,
  hourlyTokens: 30 * 1000,
  serviceHealth: 30 * 1000,
  channelStats: 30 * 1000,
  failureAnalysis: 30 * 1000,
  requestLogs: 10 * 1000,
} as const;

const EMPTY_PROVIDER_META: MonitorProviderMeta = {
  providerMap: {},
  providerTypeMap: {},
  authIndexMap: {},
  sourceAuthMap: {},
  sourceMetaMap: {},
};

const isFreshEntry = <T,>(entry: MonitorResourceEntry<T> | undefined, ttl: number) =>
  Boolean(entry?.updatedAt && Date.now() - entry.updatedAt < ttl);

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';

const normalizeParams = <T extends object>(params?: T) =>
  Object.fromEntries(
    Object.entries((params || {}) as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
  ) as T;

export const serializeMonitorParams = (params?: object) =>
  JSON.stringify(normalizeParams(params));

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
  const emailAliasParts = (() => {
    if (!nameWithoutExt.includes('@')) return { localPart: '', email: '' };
    const [rawLocalPart = '', rawDomain = ''] = nameWithoutExt.split('@');
    let localPart = rawLocalPart.trim();
    const domain = rawDomain.trim();
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
    const email = localPart && domain ? `${localPart}@${domain}` : '';
    return { localPart, email };
  })();

  if (normalizedName) {
    aliases.add(normalizedName);
    aliases.add(maskApiKey(normalizedName));
    aliases.add(maskSecret(normalizedName));
    aliases.add(getProviderDisplayParts(normalizedName, {}).masked);
  }

  if (nameWithoutExt) {
    aliases.add(nameWithoutExt);
    aliases.add(maskApiKey(nameWithoutExt));
    aliases.add(maskSecret(nameWithoutExt));
    aliases.add(formatMonitorAlias(nameWithoutExt));
    aliases.add(formatGeminiSource(nameWithoutExt));
    aliases.add(getProviderDisplayParts(nameWithoutExt, {}).masked);
  }

  if (emailAliasParts.localPart) {
    aliases.add(emailAliasParts.localPart);
    aliases.add(maskApiKey(emailAliasParts.localPart));
    aliases.add(maskSecret(emailAliasParts.localPart));
    aliases.add(formatMonitorAlias(emailAliasParts.localPart));
  }

  if (emailAliasParts.email) {
    aliases.add(emailAliasParts.email);
    aliases.add(maskApiKey(emailAliasParts.email));
    aliases.add(maskSecret(emailAliasParts.email));
    aliases.add(formatMonitorAlias(emailAliasParts.email));
    aliases.add(formatGeminiSource(emailAliasParts.email));
    aliases.add(getProviderDisplayParts(emailAliasParts.email, {}).masked);
  }

  if (normalizedAuthIndex) {
    aliases.add(normalizedAuthIndex);
  }

  return Array.from(aliases);
};

const buildProviderMeta = async (): Promise<MonitorProviderMeta> => {
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

  const [openaiProviders, geminiKeys, claudeConfigs, codexConfigs, vertexConfigs, authFilesRes] =
    await Promise.all([
      providersApi.getOpenAIProviders().catch(() => []),
      providersApi.getGeminiKeys().catch(() => []),
      providersApi.getClaudeConfigs().catch(() => []),
      providersApi.getCodexConfigs().catch(() => []),
      providersApi.getVertexConfigs().catch(() => []),
      authFilesApi.list().catch(() => ({ files: [] })),
    ]);

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
    const aliases = collectAuthFileAliases(name, authIndexKey);
    registerSourceMeta(aliases, providerName, providerName, {
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
    aliases.forEach((alias) => {
      const key = String(alias || '').trim();
      if (key && !(key in nextSourceAuthMap)) {
        nextSourceAuthMap[key] = name;
      }
    });
    if (authIndexKey) {
      authIdxMap[authIndexKey] = name;
    }
  });

  return {
    providerMap: map,
    providerTypeMap: typeMap,
    authIndexMap: authIdxMap,
    sourceAuthMap: nextSourceAuthMap,
    sourceMetaMap: sourceMeta,
  };
};

const updateRecordEntry = <T,>(
  record: Record<string, MonitorResourceEntry<T>>,
  key: string,
  entry: MonitorResourceEntry<T>
) => ({
  ...record,
  [key]: entry,
});

export const useMonitorStore = create<MonitorStoreState>((set, get) => {
  const ensureRecord = async <T,>(
    recordKey: keyof Pick<
      MonitorStoreState,
      | 'kpiCache'
      | 'modelDistributionCache'
      | 'dailyTrendCache'
      | 'hourlyModelsCache'
      | 'hourlyTokensCache'
      | 'channelStatsCache'
      | 'failureAnalysisCache'
      | 'requestLogsCache'
    >,
    key: string,
    ttl: number,
    fetcher: () => Promise<T>,
    force = false
  ) => {
    const currentRecord = get()[recordKey] as Record<string, MonitorResourceEntry<T>>;
    const currentEntry = currentRecord[key];
    if (!force && currentEntry?.data !== undefined) {
      if (isFreshEntry(currentEntry, ttl)) {
        return currentEntry.data;
      }
      if (!currentEntry.promise) {
        void ensureRecord(recordKey, key, ttl, fetcher, true);
      }
      return currentEntry.data;
    }
    if (currentEntry?.promise) {
      return currentEntry.promise;
    }

    const promise = fetcher()
      .then((data) => {
        set((state) => ({
          [recordKey]: updateRecordEntry(state[recordKey] as Record<string, MonitorResourceEntry<T>>, key, {
            data,
            error: null,
            loading: false,
            updatedAt: Date.now(),
            promise: null,
          }),
        }));
        return data;
      })
      .catch((error) => {
        const message = getErrorMessage(error);
        set((state) => ({
          [recordKey]: updateRecordEntry(state[recordKey] as Record<string, MonitorResourceEntry<T>>, key, {
            data: currentEntry?.data,
            error: message,
            loading: false,
            updatedAt: currentEntry?.updatedAt ?? null,
            promise: null,
          }),
        }));
        throw error;
      });

    set((state) => ({
      [recordKey]: updateRecordEntry(state[recordKey] as Record<string, MonitorResourceEntry<T>>, key, {
        data: currentEntry?.data,
        error: null,
        loading: true,
        updatedAt: currentEntry?.updatedAt ?? null,
        promise,
      }),
    }));

    return promise;
  };

  const ensureSingle = async <T,>(
    stateKey: 'providerMeta' | 'serviceHealth',
    ttl: number,
    fetcher: () => Promise<T>,
    force = false
  ) => {
    const currentEntry = get()[stateKey] as MonitorResourceEntry<T>;
    if (!force && currentEntry?.data !== undefined) {
      if (isFreshEntry(currentEntry, ttl)) {
        return currentEntry.data;
      }
      if (!currentEntry.promise) {
        void ensureSingle(stateKey, ttl, fetcher, true);
      }
      return currentEntry.data;
    }
    if (currentEntry?.promise) {
      return currentEntry.promise;
    }

    const promise = fetcher()
      .then((data) => {
        set({
          [stateKey]: {
            data,
            error: null,
            loading: false,
            updatedAt: Date.now(),
            promise: null,
          },
        } as Partial<MonitorStoreState>);
        return data;
      })
      .catch((error) => {
        const message = getErrorMessage(error);
        set({
          [stateKey]: {
            data: currentEntry?.data,
            error: message,
            loading: false,
            updatedAt: currentEntry?.updatedAt ?? null,
            promise: null,
          },
        } as Partial<MonitorStoreState>);
        throw error;
      });

    set({
      [stateKey]: {
        data: currentEntry?.data,
        error: null,
        loading: true,
        updatedAt: currentEntry?.updatedAt ?? null,
        promise,
      },
    } as Partial<MonitorStoreState>);

    return promise;
  };

  return {
    providerMeta: {
      data: EMPTY_PROVIDER_META,
      error: null,
      loading: false,
      updatedAt: null,
      promise: null,
    },
    kpiCache: {},
    modelDistributionCache: {},
    dailyTrendCache: {},
    hourlyModelsCache: {},
    hourlyTokensCache: {},
    serviceHealth: {
      error: null,
      loading: false,
      updatedAt: null,
      promise: null,
    },
    channelStatsCache: {},
    failureAnalysisCache: {},
    requestLogsCache: {},
    ensureProviderMeta: (force = false) =>
      ensureSingle('providerMeta', MONITOR_CACHE_TTL.providerMeta, buildProviderMeta, force),
    ensureKpi: (params = {}, force = false) => {
      const normalized = normalizeParams(params);
      return ensureRecord('kpiCache', serializeMonitorParams(normalized), MONITOR_CACHE_TTL.kpi, () => monitorApi.getKpi(normalized), force);
    },
    ensureModelDistribution: (params = {}, force = false) => {
      const normalized = normalizeParams(params);
      return ensureRecord(
        'modelDistributionCache',
        serializeMonitorParams(normalized),
        MONITOR_CACHE_TTL.modelDistribution,
        () => monitorApi.getModelDistribution(normalized),
        force
      );
    },
    ensureDailyTrend: (params = {}, force = false) => {
      const normalized = normalizeParams(params);
      return ensureRecord(
        'dailyTrendCache',
        serializeMonitorParams(normalized),
        MONITOR_CACHE_TTL.dailyTrend,
        () => monitorApi.getDailyTrend(normalized),
        force
      );
    },
    ensureHourlyModels: (params = {}, force = false) => {
      const normalized = normalizeParams(params);
      return ensureRecord(
        'hourlyModelsCache',
        serializeMonitorParams(normalized),
        MONITOR_CACHE_TTL.hourlyModels,
        () => monitorApi.getHourlyModels(normalized),
        force
      );
    },
    ensureHourlyTokens: (params = {}, force = false) => {
      const normalized = normalizeParams(params);
      return ensureRecord(
        'hourlyTokensCache',
        serializeMonitorParams(normalized),
        MONITOR_CACHE_TTL.hourlyTokens,
        () => monitorApi.getHourlyTokens(normalized),
        force
      );
    },
    ensureServiceHealth: (force = false) =>
      ensureSingle('serviceHealth', MONITOR_CACHE_TTL.serviceHealth, () => monitorApi.getServiceHealth(), force),
    ensureChannelStats: (params = {}, force = false) => {
      const normalized = normalizeParams(params);
      return ensureRecord(
        'channelStatsCache',
        serializeMonitorParams(normalized),
        MONITOR_CACHE_TTL.channelStats,
        () => monitorApi.getChannelStats(normalized),
        force
      );
    },
    ensureFailureAnalysis: (params = {}, force = false) => {
      const normalized = normalizeParams(params);
      return ensureRecord(
        'failureAnalysisCache',
        serializeMonitorParams(normalized),
        MONITOR_CACHE_TTL.failureAnalysis,
        () => monitorApi.getFailureAnalysis(normalized),
        force
      );
    },
    ensureRequestLogs: (params = {}, force = false) => {
      const normalized = normalizeParams(params);
      return ensureRecord(
        'requestLogsCache',
        serializeMonitorParams(normalized),
        MONITOR_CACHE_TTL.requestLogs,
        () => monitorApi.getRequestLogs(normalized),
        force
      );
    },
    invalidateAll: () =>
      set({
        providerMeta: {
          data: EMPTY_PROVIDER_META,
          error: null,
          loading: false,
          updatedAt: null,
          promise: null,
        },
        kpiCache: {},
        modelDistributionCache: {},
        dailyTrendCache: {},
        hourlyModelsCache: {},
        hourlyTokensCache: {},
        serviceHealth: {
          error: null,
          loading: false,
          updatedAt: null,
          promise: null,
        },
        channelStatsCache: {},
        failureAnalysisCache: {},
        requestLogsCache: {},
      }),
  };
});

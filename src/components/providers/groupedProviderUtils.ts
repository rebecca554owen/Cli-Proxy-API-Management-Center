import type { CloakConfig, GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import { modelsToEntries } from '@/components/ui/modelInputListUtils';
import { buildHeaderObject, headersToEntries } from '@/utils/headers';
import {
  excludedModelsToText,
  formatProviderEndpoint,
  getOpenAIProviderStats,
  getStatsBySource,
  hasDisableAllModelsRule,
  parseExcludedModels,
} from './utils';
import type {
  OpenAIFormState,
  ProviderConfigGroup,
  ProviderGroupFormState,
  ProviderKeyEntryDraft,
  ProviderKind,
  ProviderFormState,
} from './types';
import type { KeyStats, StatusBarData, UsageDetail } from '@/utils/usage';
import {
  buildCandidateUsageSourceIds,
  calculateStatusBarData,
  lookupStatusBar,
} from '@/utils/usage';

const normalizeGroupBaseUrl = (value: string | undefined) => String(value ?? '').trim().replace(/\/+$/g, '');
const normalizeGroupPrefix = (value: string | undefined) => String(value ?? '').trim();

const buildGroupKey = (provider: Exclude<ProviderKind, 'openai'>, baseUrl?: string, prefix?: string) =>
  `${provider}::${normalizeGroupBaseUrl(baseUrl)}::${normalizeGroupPrefix(prefix)}`;

const toKeyEntryDraft = (
  apiKey: string | undefined,
  proxyUrl: string | undefined,
  headers?: Record<string, string>
): ProviderKeyEntryDraft => ({
  apiKey: String(apiKey ?? ''),
  proxyUrl: String(proxyUrl ?? ''),
  headers: headersToEntries(headers),
  testStatus: 'idle',
  testMessage: '',
});

const cloneCloak = (cloak: CloakConfig | undefined) =>
  cloak
    ? {
        mode: cloak.mode,
        strictMode: cloak.strictMode,
        sensitiveWords: cloak.sensitiveWords ? [...cloak.sensitiveWords] : undefined,
      }
    : undefined;

export const groupProviderConfigs = (
  provider: Exclude<ProviderKind, 'openai'>,
  configs: ProviderKeyConfig[] | GeminiKeyConfig[]
): ProviderConfigGroup<ProviderKeyConfig | GeminiKeyConfig>[] => {
  const groups = new Map<string, ProviderConfigGroup<ProviderKeyConfig | GeminiKeyConfig>>();

  configs.forEach((item, index) => {
    const key = buildGroupKey(provider, item.baseUrl, item.prefix);
    const existing = groups.get(key);
    if (existing) {
      existing.configs.push(item);
      existing.indexes.push(index);
      existing.proxyUrls = Array.from(
        new Set([...existing.proxyUrls, String(item.proxyUrl ?? '').trim()].filter(Boolean))
      );
      return;
    }

    const endpoint = formatProviderEndpoint(item.baseUrl);
    const prefix = normalizeGroupPrefix(item.prefix);
    const providerConfig = item as ProviderKeyConfig;
    const hasWebsocketsField = Object.prototype.hasOwnProperty.call(item, 'websockets');
    const hasCloakField = Object.prototype.hasOwnProperty.call(item, 'cloak');
    groups.set(key, {
      id: key,
      provider,
      title:
        prefix ||
        endpoint ||
        `${provider.toUpperCase()} #${index + 1}`,
      baseUrl: String(item.baseUrl ?? ''),
      prefix: String(item.prefix ?? ''),
      priority: item.priority,
      headers: item.headers ?? {},
      models: item.models ?? [],
      excludedModels: item.excludedModels ?? [],
      configs: [item],
      indexes: [index],
      primaryIndex: index,
      enabled: !hasDisableAllModelsRule(item.excludedModels),
      proxyUrls: String(item.proxyUrl ?? '').trim() ? [String(item.proxyUrl ?? '').trim()] : [],
      websockets: hasWebsocketsField ? Boolean(providerConfig.websockets) : undefined,
      cloak: hasCloakField ? cloneCloak(providerConfig.cloak) : undefined,
    });
  });

  return Array.from(groups.values()).sort((left, right) => left.primaryIndex - right.primaryIndex);
};

export const buildProviderGroupFormState = (
  group: ProviderConfigGroup<ProviderKeyConfig | GeminiKeyConfig>
): ProviderGroupFormState => ({
  baseUrl: group.baseUrl ?? '',
  prefix: group.prefix ?? '',
  priority: group.priority,
  headers: headersToEntries(group.headers),
  modelEntries: modelsToEntries(group.models),
  excludedText: excludedModelsToText(group.excludedModels),
  testModel: group.models[0]?.name ?? '',
  keyEntries: group.configs.map((item) => toKeyEntryDraft(item.apiKey, item.proxyUrl, undefined)),
  websockets: group.websockets,
  cloak: cloneCloak(group.cloak),
});

export const buildOpenAIGroupFormState = (config?: OpenAIProviderConfig): ProviderGroupFormState => ({
  name: config?.name ?? '',
  baseUrl: config?.baseUrl ?? '',
  prefix: config?.prefix ?? '',
  priority: config?.priority,
  headers: headersToEntries(config?.headers),
  modelEntries: modelsToEntries(config?.models),
  excludedText: excludedModelsToText(config?.excludedModels),
  testModel: config?.testModel ?? config?.models?.[0]?.name ?? '',
  keyEntries:
    config?.apiKeyEntries?.length
      ? config.apiKeyEntries.map((entry) => toKeyEntryDraft(entry.apiKey, entry.proxyUrl, entry.headers))
      : [toKeyEntryDraft('', '', undefined)],
});

const normalizeGroupKeyEntries = (entries: ProviderKeyEntryDraft[]) => {
  const seen = new Set<string>();
  return entries.reduce<
    Array<{ apiKey: string; proxyUrl?: string; headers?: Record<string, string> }>
  >((acc, entry) => {
    const apiKey = String(entry.apiKey ?? '').trim();
    const proxyUrl = String(entry.proxyUrl ?? '').trim();
    const headersObject = buildHeaderObject(entry.headers);
    const signature = [apiKey, proxyUrl, JSON.stringify(headersObject)].join('||');
    if (!apiKey || seen.has(signature)) return acc;
    seen.add(signature);
    acc.push({
      apiKey,
      proxyUrl: proxyUrl || undefined,
      headers: Object.keys(headersObject).length ? headersObject : undefined,
    });
    return acc;
  }, []);
};

export const buildProviderConfigsFromGroupForm = (
  form: ProviderGroupFormState
): ProviderKeyConfig[] => {
  const keyEntries = normalizeGroupKeyEntries(form.keyEntries);
  const headersObject = buildHeaderObject(form.headers);
  const models = form.modelEntries
    .map((entry) => {
      const name = entry.name.trim();
      if (!name) return null;
      const alias = entry.alias.trim();
      return alias ? { name, alias } : { name };
    })
    .filter(Boolean) as ProviderKeyConfig['models'];
  const excludedModels = parseExcludedModels(form.excludedText);

  return keyEntries.map((entry) => ({
    apiKey: entry.apiKey,
    priority: form.priority !== undefined ? Math.trunc(form.priority) : undefined,
    prefix: form.prefix.trim() || undefined,
    baseUrl: form.baseUrl.trim() || undefined,
    proxyUrl: entry.proxyUrl,
    headers: Object.keys(headersObject).length ? headersObject : undefined,
    models,
    excludedModels,
    websockets: form.websockets,
    cloak: cloneCloak(form.cloak),
  }));
};

export const buildGeminiConfigsFromGroupForm = (
  form: ProviderGroupFormState
): GeminiKeyConfig[] =>
  buildProviderConfigsFromGroupForm(form).map((item) => ({
    apiKey: item.apiKey,
    priority: item.priority,
    prefix: item.prefix,
    baseUrl: item.baseUrl,
    proxyUrl: item.proxyUrl,
    headers: item.headers,
    models: item.models,
    excludedModels: item.excludedModels,
  }));

export const buildOpenAIProviderFromGroupForm = (
  form: ProviderGroupFormState
): OpenAIProviderConfig => {
  const headersObject = buildHeaderObject(form.headers);
  const models = form.modelEntries
    .map((entry) => {
      const name = entry.name.trim();
      if (!name) return null;
      const alias = entry.alias.trim();
      return alias ? { name, alias } : { name };
    })
    .filter(Boolean) as OpenAIProviderConfig['models'];
  const apiKeyEntries = normalizeGroupKeyEntries(form.keyEntries).map((entry) => ({
    apiKey: entry.apiKey,
    proxyUrl: entry.proxyUrl,
    headers: entry.headers,
  }));

  return {
    name: String(form.name ?? '').trim(),
    baseUrl: form.baseUrl.trim(),
    prefix: form.prefix.trim() || undefined,
    priority: form.priority !== undefined ? Math.trunc(form.priority) : undefined,
    headers: Object.keys(headersObject).length ? headersObject : undefined,
    apiKeyEntries,
    models,
    excludedModels: parseExcludedModels(form.excludedText),
    testModel: form.testModel.trim() || undefined,
  };
};

export const buildProviderGroupEditSignature = (form: ProviderGroupFormState) =>
  JSON.stringify({
    name: String(form.name ?? '').trim(),
    baseUrl: String(form.baseUrl ?? '').trim(),
    prefix: String(form.prefix ?? '').trim(),
    priority:
      form.priority !== undefined && Number.isFinite(form.priority) ? Math.trunc(form.priority) : null,
    headers: headersToEntries(buildHeaderObject(form.headers)),
    modelEntries: form.modelEntries
      .map((entry) => ({ name: entry.name.trim(), alias: entry.alias.trim() }))
      .filter((entry) => entry.name || entry.alias),
    excludedText: String(form.excludedText ?? '').trim(),
    testModel: String(form.testModel ?? '').trim(),
    keyEntries: form.keyEntries
      .map((entry) => ({
        apiKey: entry.apiKey.trim(),
        proxyUrl: entry.proxyUrl.trim(),
        headers: headersToEntries(buildHeaderObject(entry.headers)),
      }))
      .filter((entry) => entry.apiKey || entry.proxyUrl || entry.headers.length > 0),
    websockets: Boolean(form.websockets),
    cloak: form.cloak
      ? {
          mode: String(form.cloak.mode ?? '').trim(),
          strictMode: Boolean(form.cloak.strictMode),
          sensitiveWords: (form.cloak.sensitiveWords ?? []).map((item) => String(item).trim()).filter(Boolean),
        }
      : null,
  });

export const replaceGroupedConfigs = <T,>(
  list: T[],
  indexes: number[],
  replacements: T[],
  insertIndex?: number
) => {
  const indexSet = new Set(indexes);
  const next = list.filter((_, index) => !indexSet.has(index));
  const targetIndex =
    typeof insertIndex === 'number'
      ? insertIndex
      : indexes.length
        ? Math.min(...indexes)
        : next.length;
  next.splice(targetIndex, 0, ...replacements);
  return next;
};

export const buildProviderGroupCard = (
  group: ProviderConfigGroup<ProviderKeyConfig | GeminiKeyConfig>,
  keyStats: KeyStats,
  statusBarBySource: Map<string, StatusBarData>
) => {
  const stats = group.configs.reduce(
    (acc, item) => {
      const current = getStatsBySource(item.apiKey, keyStats, item.prefix);
      acc.success += current.success;
      acc.failure += current.failure;
      return acc;
    },
    { success: 0, failure: 0 }
  );
  const candidates = group.configs.flatMap((item) =>
    buildCandidateUsageSourceIds({ apiKey: item.apiKey, prefix: item.prefix })
  );

  return {
    primaryIndex: group.primaryIndex,
    title: group.title,
    baseUrl: formatProviderEndpoint(group.baseUrl),
    keyCount: group.configs.length,
    modelCount: group.models.length,
    statusData: lookupStatusBar(statusBarBySource, candidates),
    success: stats.success,
    failure: stats.failure,
    enabled: group.enabled,
  };
};

export const buildOpenAIProviderCard = (
  config: OpenAIProviderConfig,
  index: number,
  keyStats: KeyStats,
  usageDetails: UsageDetail[]
) => {
  const sourceIds = new Set<string>();
  buildCandidateUsageSourceIds({ prefix: config.prefix }).forEach((id) => sourceIds.add(id));
  (config.apiKeyEntries || []).forEach((entry) => {
    buildCandidateUsageSourceIds({ apiKey: entry.apiKey }).forEach((id) => sourceIds.add(id));
  });

  return {
    primaryIndex: index,
    title: config.name || config.prefix || formatProviderEndpoint(config.baseUrl) || `OpenAI #${index + 1}`,
    baseUrl: formatProviderEndpoint(config.baseUrl),
    keyCount: config.apiKeyEntries?.length ?? 0,
    modelCount: config.models?.length ?? 0,
    statusData: calculateStatusBarData(
      usageDetails.filter((detail) => sourceIds.has(detail.source))
    ),
    success: getOpenAIProviderStats(config.apiKeyEntries, keyStats, config.prefix).success,
    failure: getOpenAIProviderStats(config.apiKeyEntries, keyStats, config.prefix).failure,
    enabled: !hasDisableAllModelsRule(config.excludedModels),
  };
};

export const buildLegacyProviderFormState = (
  groupForm: ProviderGroupFormState
): ProviderFormState => ({
  apiKey: groupForm.keyEntries[0]?.apiKey ?? '',
  apiKeys: groupForm.keyEntries.map((entry) => entry.apiKey),
  priority: groupForm.priority,
  prefix: groupForm.prefix,
  baseUrl: groupForm.baseUrl,
  proxyUrl: groupForm.keyEntries[0]?.proxyUrl ?? '',
  headers: groupForm.headers,
  models: [],
  excludedModels: [],
  modelEntries: groupForm.modelEntries,
  excludedText: groupForm.excludedText,
  websockets: groupForm.websockets,
  cloak: cloneCloak(groupForm.cloak),
});

export const buildLegacyOpenAIFormState = (
  groupForm: ProviderGroupFormState
): OpenAIFormState => ({
  name: groupForm.name ?? '',
  priority: groupForm.priority,
  prefix: groupForm.prefix,
  baseUrl: groupForm.baseUrl,
  headers: groupForm.headers,
  modelEntries: groupForm.modelEntries,
  apiKeyEntries: groupForm.keyEntries.map((entry) => ({
    apiKey: entry.apiKey,
    proxyUrl: entry.proxyUrl || undefined,
    headers: buildHeaderObject(entry.headers),
  })),
  testModel: groupForm.testModel || undefined,
});

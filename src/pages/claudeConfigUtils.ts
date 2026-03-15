import type { ProviderKeyConfig } from '@/types';
import type { ProviderFormState } from '@/components/providers/types';
import { excludedModelsToText, normalizeClaudeBaseUrl, parseExcludedModels } from '@/components/providers/utils';
import { buildHeaderObject, headersToEntries, normalizeHeaderEntries } from '@/utils/headers';
import { modelsToEntries } from '@/components/ui/modelInputListUtils';

export const buildEmptyClaudeForm = (): ProviderFormState => ({
  apiKey: '',
  apiKeys: [''],
  priority: undefined,
  prefix: '',
  baseUrl: '',
  proxyUrl: '',
  headers: [],
  models: [],
  excludedModels: [],
  modelEntries: [{ name: '', alias: '' }],
  excludedText: '',
});

const cloneCloak = (cloak: ProviderKeyConfig['cloak']) =>
  cloak
    ? {
        mode: cloak.mode,
        strictMode: cloak.strictMode,
        sensitiveWords: cloak.sensitiveWords ? [...cloak.sensitiveWords] : undefined,
      }
    : undefined;

export const buildClaudeFormState = (config: ProviderKeyConfig): ProviderFormState => ({
  ...config,
  apiKeys: [config.apiKey],
  headers: headersToEntries(config.headers),
  modelEntries: modelsToEntries(config.models),
  excludedText: excludedModelsToText(config.excludedModels),
  cloak: cloneCloak(config.cloak),
});

export const buildClaudeCopyFormState = (config: ProviderKeyConfig): ProviderFormState => ({
  ...buildClaudeFormState(config),
  apiKey: '',
  apiKeys: [''],
});

export const normalizeClaudeApiKeys = (apiKeys: string[] | undefined, fallbackApiKey?: string) => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  (apiKeys ?? []).forEach((value) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  if (!normalized.length) {
    const fallback = String(fallbackApiKey ?? '').trim();
    if (fallback) {
      normalized.push(fallback);
    }
  }

  return normalized;
};

const normalizeModelsForCompare = (form: ProviderFormState) =>
  (form.modelEntries ?? []).reduce<Array<{ name: string; alias: string }>>((acc, entry) => {
    const name = String(entry?.name ?? '').trim();
    let alias = String(entry?.alias ?? '').trim();
    if (name) {
      alias = alias || name;
    }
    if (!name && !alias) return acc;
    acc.push({ name, alias });
    return acc;
  }, []);

const normalizeCloakForCompare = (cloak: ProviderFormState['cloak']) => {
  if (!cloak) return null;
  const mode = String(cloak.mode ?? '').trim().toLowerCase() || 'auto';
  const strictMode = Boolean(cloak.strictMode);
  const sensitiveWords = Array.isArray(cloak.sensitiveWords)
    ? cloak.sensitiveWords.map((word) => String(word ?? '').trim()).filter(Boolean)
    : [];
  return {
    mode,
    strictMode,
    sensitiveWords: sensitiveWords.length ? sensitiveWords : null,
  };
};

const buildSharedSignature = (form: ProviderFormState) =>
  JSON.stringify({
    apiKeys: normalizeClaudeApiKeys(form.apiKeys, form.apiKey),
    priority:
      form.priority !== undefined && Number.isFinite(form.priority) ? Math.trunc(form.priority) : null,
    proxyUrl: String(form.proxyUrl ?? '').trim(),
    headers: normalizeHeaderEntries(form.headers),
    models: normalizeModelsForCompare(form),
    excludedModels: parseExcludedModels(form.excludedText ?? ''),
    cloak: normalizeCloakForCompare(form.cloak),
  });

export const hasClaudeSharedFieldChanges = (
  previousForm: ProviderFormState,
  nextForm: ProviderFormState
) => buildSharedSignature(previousForm) !== buildSharedSignature(nextForm);

export const normalizeClaudeSyncBaseUrl = (baseUrl: string | undefined): string => {
  const trimmed = String(baseUrl ?? '').trim();
  if (!trimmed) return '';
  return normalizeClaudeBaseUrl(trimmed);
};

export const normalizeClaudeSyncPrefix = (prefix: string | undefined): string =>
  String(prefix ?? '').trim();

export const canSyncClaudeConfigGroup = (
  left: Pick<ProviderKeyConfig, 'baseUrl' | 'prefix'> | null | undefined,
  right: Pick<ProviderKeyConfig, 'baseUrl' | 'prefix'> | null | undefined
) =>
  normalizeClaudeSyncBaseUrl(left?.baseUrl) !== '' &&
  normalizeClaudeSyncBaseUrl(left?.baseUrl) === normalizeClaudeSyncBaseUrl(right?.baseUrl) &&
  normalizeClaudeSyncPrefix(left?.prefix) === normalizeClaudeSyncPrefix(right?.prefix);

export const applyClaudeSharedFields = (
  target: ProviderKeyConfig,
  source: ProviderKeyConfig
): ProviderKeyConfig => ({
  ...target,
  priority: source.priority,
  proxyUrl: source.proxyUrl,
  headers: source.headers ? { ...source.headers } : undefined,
  models: source.models
    ? source.models.map((model) => ({
        name: model.name,
        alias: model.alias,
        priority: model.priority,
        testModel: model.testModel,
      }))
    : undefined,
  excludedModels: source.excludedModels ? [...source.excludedModels] : undefined,
  cloak: cloneCloak(source.cloak),
});

export const buildClaudeConfigsFromForm = (form: ProviderFormState): ProviderKeyConfig[] => {
  const apiKeys = normalizeClaudeApiKeys(form.apiKeys, form.apiKey);
  const headersObject = buildHeaderObject(form.headers);
  const headers = Object.keys(headersObject).length ? headersObject : undefined;
  const models = form.modelEntries
    .map((entry) => {
      const name = entry.name.trim();
      if (!name) return null;
      const alias = entry.alias.trim();
      return { name, alias: alias || name };
    })
    .filter(Boolean) as ProviderKeyConfig['models'];
  const excludedModels = parseExcludedModels(form.excludedText);

  return apiKeys.map((apiKey) => ({
    apiKey,
    priority: form.priority !== undefined ? Math.trunc(form.priority) : undefined,
    prefix: form.prefix?.trim() || undefined,
    baseUrl: String(form.baseUrl ?? '').trim() || undefined,
    proxyUrl: form.proxyUrl?.trim() || undefined,
    headers,
    models,
    excludedModels,
    cloak: cloneCloak(form.cloak),
  }));
};

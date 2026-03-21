import type { ProviderKeyConfig } from '@/types';
import type { ProviderFormState } from '@/components/providers/types';
import { excludedModelsToText, parseExcludedModels } from '@/components/providers/utils';
import { headersToEntries, normalizeHeaderEntries } from '@/utils/headers';
import { modelsToEntries } from '@/components/ui/modelInputListUtils';

export const buildCodexFormState = (config: ProviderKeyConfig): ProviderFormState => ({
  ...config,
  apiKeys: [config.apiKey],
  headers: headersToEntries(config.headers),
  modelEntries: modelsToEntries(config.models),
  excludedText: excludedModelsToText(config.excludedModels),
});

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

const buildSharedSignature = (form: ProviderFormState) =>
  JSON.stringify({
    priority:
      form.priority !== undefined && Number.isFinite(form.priority) ? Math.trunc(form.priority) : null,
    proxyUrl: String(form.proxyUrl ?? '').trim(),
    headers: normalizeHeaderEntries(form.headers),
    models: normalizeModelsForCompare(form),
    excludedModels: parseExcludedModels(form.excludedText ?? ''),
    websockets: Boolean(form.websockets),
  });

export const hasCodexSharedFieldChanges = (
  previousForm: ProviderFormState,
  nextForm: ProviderFormState
) => buildSharedSignature(previousForm) !== buildSharedSignature(nextForm);

const normalizeCodexSyncBaseUrl = (baseUrl: string | undefined): string =>
  String(baseUrl ?? '').trim().replace(/\/+$/g, '');

const normalizeCodexSyncPrefix = (prefix: string | undefined): string =>
  String(prefix ?? '').trim();

export const canSyncCodexConfigGroup = (
  left: Pick<ProviderKeyConfig, 'baseUrl' | 'prefix'> | null | undefined,
  right: Pick<ProviderKeyConfig, 'baseUrl' | 'prefix'> | null | undefined
) =>
  normalizeCodexSyncBaseUrl(left?.baseUrl) !== '' &&
  normalizeCodexSyncBaseUrl(left?.baseUrl) === normalizeCodexSyncBaseUrl(right?.baseUrl) &&
  normalizeCodexSyncPrefix(left?.prefix) === normalizeCodexSyncPrefix(right?.prefix);

export const applyCodexSharedFields = (
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
  websockets: source.websockets,
});

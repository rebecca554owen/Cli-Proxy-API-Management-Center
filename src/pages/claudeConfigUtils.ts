import type { ProviderKeyConfig } from '@/types';
import type { ProviderFormState } from '@/components/providers/types';
import { excludedModelsToText, normalizeClaudeBaseUrl, parseExcludedModels } from '@/components/providers/utils';
import { headersToEntries, normalizeHeaderEntries } from '@/utils/headers';
import { modelsToEntries } from '@/components/ui/modelInputListUtils';

export const buildEmptyClaudeForm = (): ProviderFormState => ({
  apiKey: '',
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
  headers: headersToEntries(config.headers),
  modelEntries: modelsToEntries(config.models),
  excludedText: excludedModelsToText(config.excludedModels),
  cloak: cloneCloak(config.cloak),
});

export const buildClaudeCopyFormState = (config: ProviderKeyConfig): ProviderFormState => ({
  ...buildClaudeFormState(config),
  apiKey: '',
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

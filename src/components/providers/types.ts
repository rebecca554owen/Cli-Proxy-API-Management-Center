import type { ApiKeyEntry, GeminiKeyConfig, ProviderKeyConfig } from '@/types';
import type { HeaderEntry } from '@/utils/headers';
import type { KeyStats, StatusBarData, UsageDetail } from '@/utils/usage';

export interface ModelEntry {
  name: string;
  alias: string;
}

export interface OpenAIFormState {
  name: string;
  priority?: number;
  prefix: string;
  baseUrl: string;
  headers: HeaderEntry[];
  testModel?: string;
  modelEntries: ModelEntry[];
  apiKeyEntries: ApiKeyEntry[];
}

export type ProviderKind = 'gemini' | 'codex' | 'claude' | 'openai';

export interface ProviderKeyEntryDraft {
  apiKey: string;
  proxyUrl: string;
  headers: HeaderEntry[];
  testStatus: 'idle' | 'loading' | 'success' | 'error';
  testMessage: string;
}

export interface ProviderGroupFormState {
  name?: string;
  baseUrl: string;
  prefix: string;
  priority?: number;
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
  excludedText: string;
  testModel: string;
  keyEntries: ProviderKeyEntryDraft[];
  websockets?: boolean;
  cloak?: ProviderFormState['cloak'];
}

export interface ProviderConfigGroup<TConfig> {
  id: string;
  provider: Exclude<ProviderKind, 'openai'>;
  title: string;
  baseUrl: string;
  prefix: string;
  priority?: number;
  headers: Record<string, string>;
  models: Array<{ name: string; alias?: string }>;
  excludedModels: string[];
  configs: TConfig[];
  indexes: number[];
  primaryIndex: number;
  enabled: boolean;
  proxyUrls: string[];
  websockets?: boolean;
  cloak?: ProviderKeyConfig['cloak'];
}

export interface AmpcodeUpstreamApiKeyEntry {
  upstreamApiKey: string;
  clientApiKeysText: string;
}

export interface AmpcodeFormState {
  upstreamUrl: string;
  upstreamApiKey: string;
  forceModelMappings: boolean;
  mappingEntries: ModelEntry[];
  upstreamApiKeyEntries: AmpcodeUpstreamApiKeyEntry[];
}

export type GeminiFormState = Omit<GeminiKeyConfig, 'headers' | 'models'> & {
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
  excludedText: string;
};

export type ProviderFormState = Omit<ProviderKeyConfig, 'headers'> & {
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
  excludedText: string;
  apiKeys?: string[];
};

export type VertexFormState = Omit<ProviderKeyConfig, 'headers'> & {
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
  excludedText: string;
};

export interface ProviderSectionProps<TConfig> {
  configs: TConfig[];
  keyStats: KeyStats;
  statusBarBySource: Map<string, StatusBarData>;
  usageDetails: UsageDetail[];
  disabled: boolean;
  onEdit: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onToggle?: (index: number, enabled: boolean) => void;
}

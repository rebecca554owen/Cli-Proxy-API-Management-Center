/**
 * 配置相关类型定义
 * 与基线 /config 返回结构保持一致（内部使用驼峰形式）
 */

import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from './provider';
import type { AmpcodeConfig } from './ampcode';

export interface QuotaExceededConfig {
  switchProject?: boolean;
  switchPreviewModel?: boolean;
}

export interface Config {
  debug?: boolean;
  proxyUrl?: string;
  requestRetry?: number;
  quotaExceeded?: QuotaExceededConfig;
  usageStatisticsEnabled?: boolean;
  requestLog?: boolean;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  wsAuth?: boolean;
  forceModelPrefix?: boolean;
  routingStrategy?: string;
  apiKeys?: string[];
  ampcode?: AmpcodeConfig;
  geminiApiKeys?: GeminiKeyConfig[];
  codexApiKeys?: ProviderKeyConfig[];
  claudeApiKeys?: ProviderKeyConfig[];
  vertexApiKeys?: ProviderKeyConfig[];
  openaiCompatibility?: OpenAIProviderConfig[];
  oauthExcludedModels?: Record<string, string[]>;
  raw?: Record<string, unknown>;
}

export type RawConfigSection =
  | 'debug'
  | 'proxy-url'
  | 'request-retry'
  | 'quota-exceeded'
  | 'usage-statistics-enabled'
  | 'request-log'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'ws-auth'
  | 'force-model-prefix'
  | 'routing/strategy'
  | 'api-keys'
  | 'ampcode'
  | 'gemini-api-key'
  | 'codex-api-key'
  | 'claude-api-key'
  | 'vertex-api-key'
  | 'openai-compatibility'
  | 'oauth-excluded-models';

export interface ConfigSectionValueMap {
  debug: boolean | undefined;
  'proxy-url': string | undefined;
  'request-retry': number | undefined;
  'quota-exceeded': Config['quotaExceeded'];
  'usage-statistics-enabled': boolean | undefined;
  'request-log': boolean | undefined;
  'logging-to-file': boolean | undefined;
  'logs-max-total-size-mb': number | undefined;
  'ws-auth': boolean | undefined;
  'force-model-prefix': boolean | undefined;
  'routing/strategy': string | undefined;
  'api-keys': string[] | undefined;
  ampcode: AmpcodeConfig | undefined;
  'gemini-api-key': GeminiKeyConfig[] | undefined;
  'codex-api-key': ProviderKeyConfig[] | undefined;
  'claude-api-key': ProviderKeyConfig[] | undefined;
  'vertex-api-key': ProviderKeyConfig[] | undefined;
  'openai-compatibility': OpenAIProviderConfig[] | undefined;
  'oauth-excluded-models': Record<string, string[]> | undefined;
}

export interface ConfigCache {
  data: Config;
  timestamp: number;
}

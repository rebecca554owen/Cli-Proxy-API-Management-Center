/**
 * API 相关类型定义
 * 基于原项目 src/core/api-client.js 和各模块 API
 */

export type ApiResponseValue =
  | null
  | boolean
  | number
  | string
  | ApiResponseValue[]
  | { [key: string]: ApiResponseValue | undefined };

// HTTP 方法
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

// API 客户端配置
export interface ApiClientConfig {
  apiBase: string;
  managementKey: string;
  timeout?: number;
}

// 请求选项
export interface RequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
}

// 服务器版本信息
export interface ServerVersion {
  version: string;
  buildDate?: string;
}

export interface ApiKeysResponse {
  'api-keys'?: string[];
  apiKeys?: string[];
}

export interface LogsMaxTotalSizeResponse {
  'logs-max-total-size-mb'?: number | string;
  logsMaxTotalSizeMb?: number | string;
}

export interface ForceModelPrefixResponse {
  'force-model-prefix'?: boolean;
  forceModelPrefix?: boolean;
}

export interface RoutingStrategyResponse {
  strategy?: string;
  'routing-strategy'?: string;
  routingStrategy?: string;
}

export interface VersionCheckResponse {
  'latest-version'?: string;
  latest_version?: string;
  latest?: string;
}

export interface AmpcodeUpstreamApiKeysResponse {
  'upstream-api-keys'?: unknown;
  upstreamApiKeys?: unknown;
  items?: unknown;
}

export interface AmpcodeModelMappingsResponse {
  'model-mappings'?: unknown;
  modelMappings?: unknown;
  items?: unknown;
}

export interface ModelsResponse<T> {
  models?: T[];
}

export interface ListResponse<T> {
  items?: T[];
  data?: T[];
}

export interface ProviderArrayResponse<T> extends ListResponse<T> {
  'gemini-api-key'?: T[];
  'codex-api-key'?: T[];
  'claude-api-key'?: T[];
  'vertex-api-key'?: T[];
  'openai-compatibility'?: T[];
}

export interface OAuthExcludedModelsResponse extends ListResponse<[string, string[]]> {
  'oauth-excluded-models'?: Record<string, string[]>;
}

export interface OAuthModelAliasResponse extends ListResponse<[string, unknown[]]> {
  'oauth-model-alias'?: Record<string, unknown[]>;
}

export interface ApiCallResponse {
  status_code?: number;
  statusCode?: number;
  header?: Record<string, string[]>;
  headers?: Record<string, string[]>;
  body?: ApiResponseValue;
}

export interface ApiCallStreamEventPayload {
  type?: string;
  statusCode?: number;
  status_code?: number;
  header?: Record<string, string[]>;
  headers?: Record<string, string[]>;
  chunk?: string;
  error?: string;
}

// API 错误
export type ApiError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
  data?: unknown;
};

/**
 * 认证文件与 OAuth 排除模型相关 API
 */

import { apiClient } from './client';
import type { AuthFilesResponse } from '@/types/authFile';
import { getErrorStatus, isRecord, parseJsonRecord } from '@/utils/errors';
import type {
  ModelsResponse,
  OAuthExcludedModelsResponse,
  OAuthModelAliasEntry,
  OAuthModelAliasResponse,
} from '@/types';

type AuthFileStatusResponse = { status: string; disabled: boolean };
type AuthFileModelItem = {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
};

export type CodexCleanupEvent =
  | { type: 'start'; total: number }
  | {
      type: 'progress';
      index: number;
      total: number;
      name: string;
      auth_index: string;
      status_code?: number;
      deleted?: boolean;
      error?: string;
    }
  | { type: 'done'; total: number; deleted: number };
export const AUTH_FILE_INVALID_JSON_OBJECT_ERROR = 'AUTH_FILE_INVALID_JSON_OBJECT';

const parseAuthFileJsonObject = (rawText: string): Record<string, unknown> => {
  const trimmed = rawText.trim();

  const parsed = parseJsonRecord(trimmed);
  if (!parsed) {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  return { ...parsed };
};

const saveAuthFileText = async (name: string, text: string) => {
  const file = new File([text], name, { type: 'application/json' });
  await authFilesApi.upload(file);
};

export const isAuthFileInvalidJsonObjectError = (err: unknown): boolean =>
  err instanceof Error && err.message === AUTH_FILE_INVALID_JSON_OBJECT_ERROR;

const normalizeOauthExcludedModels = (payload: unknown): Record<string, string[]> => {
  if (!isRecord(payload)) return {};

  const record = payload;
  const source = record['oauth-excluded-models'] ?? record.items ?? payload;
  if (!isRecord(source)) return {};

  const result: Record<string, string[]> = {};

  Object.entries(source).forEach(([provider, models]) => {
    const key = String(provider ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;

    const rawList = Array.isArray(models)
      ? models
      : typeof models === 'string'
        ? models.split(/[\n,]+/)
        : [];

    const seen = new Set<string>();
    const normalized: string[] = [];
    rawList.forEach((item) => {
      const trimmed = String(item ?? '').trim();
      if (!trimmed) return;
      const modelKey = trimmed.toLowerCase();
      if (seen.has(modelKey)) return;
      seen.add(modelKey);
      normalized.push(trimmed);
    });

    result[key] = normalized;
  });

  return result;
};

const normalizeOauthModelAlias = (payload: unknown): Record<string, OAuthModelAliasEntry[]> => {
  if (!isRecord(payload)) return {};

  const record = payload;
  const source = record['oauth-model-alias'] ?? record.items ?? payload;
  if (!isRecord(source)) return {};

  const result: Record<string, OAuthModelAliasEntry[]> = {};

  Object.entries(source).forEach(([channel, mappings]) => {
    const key = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;
    if (!Array.isArray(mappings)) return;

    const seen = new Set<string>();
    const normalized = mappings
      .map((item) => {
        if (!isRecord(item)) return null;
        const entry = item;
        const name = String(entry.name ?? entry.id ?? entry.model ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const fork = entry.fork === true;
        return fork ? { name, alias, fork } : { name, alias };
      })
      .filter(Boolean)
      .filter((entry) => {
        const aliasEntry = entry as OAuthModelAliasEntry;
        const dedupeKey = `${aliasEntry.name.toLowerCase()}::${aliasEntry.alias.toLowerCase()}::${aliasEntry.fork ? '1' : '0'}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      }) as OAuthModelAliasEntry[];

    if (normalized.length) {
      result[key] = normalized;
    }
  });

  return result;
};

type OauthExcludedModelsMutation = {
  provider: string;
  models: string[];
};

type OauthModelAliasMutation = {
  channel: string;
  aliases: OAuthModelAliasEntry[];
};

const OAUTH_MODEL_ALIAS_ENDPOINT = '/oauth-model-alias';

export const authFilesApi = {
  list: () => apiClient.get<AuthFilesResponse>('/auth-files'),

  setStatus: (name: string, disabled: boolean) =>
    apiClient.patch<AuthFileStatusResponse>('/auth-files/status', { name, disabled }),

  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiClient.postForm('/auth-files', formData);
  },

  deleteFile: (name: string) => apiClient.delete(`/auth-files?name=${encodeURIComponent(name)}`),

  deleteAll: () => apiClient.delete('/auth-files', { params: { all: true } }),

  downloadText: async (name: string): Promise<string> => {
    const response = await apiClient.getRaw(
      `/auth-files/download?name=${encodeURIComponent(name)}`,
      {
        responseType: 'blob',
      }
    );
    const blob = response.data as Blob;
    return blob.text();
  },

  async downloadJsonObject(name: string): Promise<Record<string, unknown>> {
    const rawText = await authFilesApi.downloadText(name);
    return parseAuthFileJsonObject(rawText);
  },

  saveText: (name: string, text: string) => saveAuthFileText(name, text),

  saveJsonObject: (name: string, json: Record<string, unknown>) =>
    saveAuthFileText(name, JSON.stringify(json)),

  // OAuth 排除模型
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await apiClient.get<OAuthExcludedModelsResponse>('/oauth-excluded-models');
    return normalizeOauthExcludedModels(data);
  },

  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch<void, OauthExcludedModelsMutation>('/oauth-excluded-models', {
      provider,
      models,
    }),

  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete(`/oauth-excluded-models?provider=${encodeURIComponent(provider)}`),

  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put<void, Record<string, string[]>>(
      '/oauth-excluded-models',
      normalizeOauthExcludedModels(map)
    ),

  // OAuth 模型别名
  async getOauthModelAlias(): Promise<Record<string, OAuthModelAliasEntry[]>> {
    const data = await apiClient.get<OAuthModelAliasResponse>(OAUTH_MODEL_ALIAS_ENDPOINT);
    return normalizeOauthModelAlias(data);
  },

  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    const normalizedAliases =
      normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch<void, OauthModelAliasMutation>(OAUTH_MODEL_ALIAS_ENDPOINT, {
      channel: normalizedChannel,
      aliases: normalizedAliases,
    });
  },

  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();

    try {
      await apiClient.patch<void, OauthModelAliasMutation>(OAUTH_MODEL_ALIAS_ENDPOINT, {
        channel: normalizedChannel,
        aliases: [],
      });
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      if (status !== 405) throw err;
      await apiClient.delete(
        `${OAUTH_MODEL_ALIAS_ENDPOINT}?channel=${encodeURIComponent(normalizedChannel)}`
      );
    }
  },

  // 获取认证凭证支持的模型
  async getModelsForAuthFile(name: string): Promise<AuthFileModelItem[]> {
    const data = await apiClient.get<ModelsResponse<AuthFileModelItem>>(
      `/auth-files/models?name=${encodeURIComponent(name)}`
    );
    return Array.isArray(data.models) ? data.models : [];
  },

  // 获取指定 channel 的模型定义
  async getModelDefinitions(channel: string): Promise<AuthFileModelItem[]> {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<ModelsResponse<AuthFileModelItem>>(
      `/model-definitions/${encodeURIComponent(normalizedChannel)}`
    );
    return Array.isArray(data.models) ? data.models : [];
  },

  // Codex 凭证清理（NDJSON 流式）
  async codexCleanup(
    onEvent: (event: CodexCleanupEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const { baseUrl, managementKey } = apiClient.getFetchContext();
    const resp = await fetch(`${baseUrl}/custom/codex-cleanup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managementKey}`,
        'Content-Type': 'application/json',
      },
      signal,
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`codex-cleanup failed: ${resp.status}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onEvent(JSON.parse(trimmed) as CodexCleanupEvent);
        } catch {
          /* skip malformed lines */
        }
      }
    }
    if (buffer.trim()) {
      try {
        onEvent(JSON.parse(buffer.trim()) as CodexCleanupEvent);
      } catch {
        /* skip */
      }
    }
  },
};

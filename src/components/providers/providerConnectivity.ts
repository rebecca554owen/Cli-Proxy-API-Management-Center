import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import { buildHeaderObject } from '@/utils/headers';
import {
  buildClaudeMessagesEndpoint,
  buildOpenAIChatCompletionsEndpoint,
  normalizeOpenAIBaseUrl,
} from './utils';
import type { HeaderEntry } from '@/utils/headers';
import type { ProviderKind } from './types';

const TEST_TIMEOUT_MS = 30_000;
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

const hasHeader = (headers: Record<string, string>, name: string) =>
  Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());

const resolveBearerTokenFromAuthorization = (headers: Record<string, string>) => {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization');
  if (!entry) return '';
  const value = String(entry[1] ?? '').trim();
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const buildGeminiGenerateEndpoint = (baseUrl: string, model: string) => {
  const normalized = normalizeOpenAIBaseUrl(baseUrl) || 'https://generativelanguage.googleapis.com';
  let trimmed = normalized.replace(/\/+$/g, '');
  trimmed = trimmed.replace(/\/v1beta\/models\/.*$/i, '');
  trimmed = trimmed.replace(/\/v1beta(?:\/.*)?$/i, '');
  const normalizedModel = String(model ?? '').trim().replace(/^\/?models\//i, '');
  if (!normalizedModel) return '';
  return `${trimmed}/v1beta/models/${normalizedModel}:generateContent`;
};

export async function runProviderConnectivityTest(input: {
  provider: ProviderKind;
  baseUrl: string;
  testModel: string;
  headers: HeaderEntry[];
  apiKey: string;
  proxyUrl?: string;
}) {
  const provider = input.provider;
  const headers = buildHeaderObject(input.headers);
  const apiKey = input.apiKey.trim();
  const proxyUrl = String(input.proxyUrl ?? '').trim();

  if (provider === 'claude') {
    const endpoint = buildClaudeMessagesEndpoint(input.baseUrl);
    if (!endpoint) {
      throw new Error('Invalid Claude endpoint');
    }
    const resolvedHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (!hasHeader(resolvedHeaders, 'anthropic-version')) {
      resolvedHeaders['anthropic-version'] = DEFAULT_ANTHROPIC_VERSION;
    }
    if (!hasHeader(resolvedHeaders, 'x-api-key')) {
      const authToken = resolveBearerTokenFromAuthorization(resolvedHeaders);
      const resolvedApiKey = apiKey || authToken;
      if (resolvedApiKey) {
        resolvedHeaders['x-api-key'] = resolvedApiKey;
      }
    }
    const result = await apiCallApi.request(
      {
        method: 'POST',
        url: endpoint,
        header: resolvedHeaders,
        proxy: proxyUrl || undefined,
        data: JSON.stringify({
          model: input.testModel,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      },
      { timeout: TEST_TIMEOUT_MS }
    );
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(getApiCallErrorMessage(result));
    }
    return;
  }

  if (provider === 'gemini') {
    const endpoint = buildGeminiGenerateEndpoint(input.baseUrl, input.testModel);
    if (!endpoint) {
      throw new Error('Invalid Gemini endpoint');
    }
    const resolvedHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (apiKey && !hasHeader(resolvedHeaders, 'x-goog-api-key')) {
      resolvedHeaders['x-goog-api-key'] = apiKey;
    }
    const result = await apiCallApi.request(
      {
        method: 'POST',
        url: endpoint,
        header: resolvedHeaders,
        proxy: proxyUrl || undefined,
        data: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 8 },
        }),
      },
      { timeout: TEST_TIMEOUT_MS }
    );
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(getApiCallErrorMessage(result));
    }
    return;
  }

  const endpoint = buildOpenAIChatCompletionsEndpoint(
    provider === 'codex' ? normalizeOpenAIBaseUrl(input.baseUrl) : input.baseUrl
  );
  if (!endpoint) {
    throw new Error('Invalid OpenAI-compatible endpoint');
  }
  const resolvedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (apiKey && !hasHeader(resolvedHeaders, 'authorization')) {
    resolvedHeaders.Authorization = `Bearer ${apiKey}`;
  }

  const result = await apiCallApi.request(
    {
      method: 'POST',
      url: endpoint,
      header: resolvedHeaders,
      proxy: proxyUrl || undefined,
      data: JSON.stringify({
        model: input.testModel,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
        max_tokens: 8,
      }),
    },
    { timeout: TEST_TIMEOUT_MS }
  );
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(getApiCallErrorMessage(result));
  }
}

export const resolveConnectivityErrorMessage = (provider: ProviderKind, err: unknown, t: (key: string, options?: Record<string, unknown>) => string) => {
  const message = getErrorMessage(err);
  const errorCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  const isTimeout = errorCode === 'ECONNABORTED' || message.toLowerCase().includes('timeout');
  if (!isTimeout) {
    return message;
  }
  if (provider === 'claude') {
    return t('ai_providers.claude_test_timeout', { seconds: TEST_TIMEOUT_MS / 1000 });
  }
  if (provider === 'gemini') {
    return t('ai_providers.gemini_test_timeout', { seconds: TEST_TIMEOUT_MS / 1000 });
  }
  if (provider === 'codex') {
    return t('ai_providers.codex_test_timeout', { seconds: TEST_TIMEOUT_MS / 1000 });
  }
  return t('ai_providers.openai_test_timeout', { seconds: TEST_TIMEOUT_MS / 1000 });
};

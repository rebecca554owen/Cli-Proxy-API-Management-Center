import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOpenAIProvider } from '../src/services/api/transformers.ts';
import { buildOpenAIProviderFromForm, buildOpenAIProviderCard } from '../src/components/providers/groupedProviderUtils.ts';
import type { OpenAIFormState } from '../src/components/providers/types.ts';

test('normalizeOpenAIProvider preserves api key disabled flags', () => {
  const provider = normalizeOpenAIProvider({
    name: 'demo',
    'base-url': 'https://example.com/v1',
    'api-key-entries': [
      { 'api-key': 'sk-a', disabled: true },
      { 'api-key': 'sk-b', disabled: false },
    ],
  });

  assert.ok(provider);
  assert.equal(provider.apiKeyEntries[0]?.disabled, true);
  assert.equal(provider.apiKeyEntries[1]?.disabled, false);
});

test('buildOpenAIProviderFromForm persists disabled api keys', () => {
  const form: OpenAIFormState = {
    name: 'demo',
    priority: 1,
    prefix: 'team',
    baseUrl: 'https://example.com/v1',
    headers: [],
    excludedText: '',
    testModel: 'gpt-4o-mini',
    modelEntries: [{ name: 'gpt-4o-mini', alias: 'mini' }],
    apiKeyEntries: [
      { apiKey: 'sk-a', proxyUrl: '', headers: {}, disabled: true },
      { apiKey: 'sk-b', proxyUrl: '', headers: {}, disabled: false },
    ],
  };

  const provider = buildOpenAIProviderFromForm(form, form.testModel);

  assert.equal(provider.apiKeyEntries[0]?.disabled, true);
  assert.equal(provider.apiKeyEntries[1]?.disabled, false);
});

test('buildOpenAIProviderCard treats provider as enabled when only part of keys are disabled', () => {
  const card = buildOpenAIProviderCard(
    {
      name: 'demo',
      baseUrl: 'https://example.com/v1',
      apiKeyEntries: [
        { apiKey: 'sk-a', disabled: true },
        { apiKey: 'sk-b', disabled: false },
      ],
      excludedModels: [],
    },
    0,
    { bySource: {}, byAuthIndex: {} },
    new Map()
  );

  assert.equal(card.disabledKeyCount, 1);
  assert.equal(card.enabledKeyCount, 1);
  assert.equal(card.enabled, true);
});

test('buildOpenAIProviderCard treats provider as disabled when all keys are disabled', () => {
  const card = buildOpenAIProviderCard(
    {
      name: 'demo',
      baseUrl: 'https://example.com/v1',
      apiKeyEntries: [
        { apiKey: 'sk-a', disabled: true },
        { apiKey: 'sk-b', disabled: true },
      ],
      excludedModels: [],
    },
    0,
    { bySource: {}, byAuthIndex: {} },
    new Map()
  );

  assert.equal(card.disabledKeyCount, 2);
  assert.equal(card.enabledKeyCount, 0);
  assert.equal(card.enabled, false);
});

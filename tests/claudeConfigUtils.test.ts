import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderKeyConfig } from '../src/types/provider.ts';
import {
  applyClaudeSharedFields,
  buildClaudeCopyFormState,
  buildClaudeFormState,
  hasClaudeSharedFieldChanges,
  normalizeClaudeSyncBaseUrl,
} from '../src/pages/claudeConfigUtils.ts';

test('复制 Claude 配置时保留共享字段并清空 apiKey', () => {
  const source: ProviderKeyConfig = {
    apiKey: 'sk-source',
    priority: 10,
    prefix: 'team-a',
    baseUrl: 'https://example.com',
    proxyUrl: 'socks5://127.0.0.1:1080',
    headers: { Foo: 'bar' },
    models: [{ name: 'claude-sonnet-4-5', alias: 'sonnet' }],
    excludedModels: ['claude-opus-*'],
    cloak: {
      mode: 'always',
      strictMode: true,
      sensitiveWords: ['API'],
    },
  };

  const copied = buildClaudeCopyFormState(source);

  assert.equal(copied.apiKey, '');
  assert.equal(copied.baseUrl, 'https://example.com');
  assert.equal(copied.prefix, 'team-a');
  assert.equal(copied.proxyUrl, 'socks5://127.0.0.1:1080');
  assert.deepEqual(copied.headers, [{ key: 'Foo', value: 'bar' }]);
  assert.deepEqual(copied.modelEntries, [{ name: 'claude-sonnet-4-5', alias: 'sonnet' }]);
  assert.equal(copied.excludedText, 'claude-opus-*');
  assert.deepEqual(copied.cloak, {
    mode: 'always',
    strictMode: true,
    sensitiveWords: ['API'],
  });
});

test('共享字段变更只比较需要同步的字段', () => {
  const source: ProviderKeyConfig = {
    apiKey: 'sk-source',
    priority: 10,
    prefix: 'team-a',
    baseUrl: 'https://example.com',
    proxyUrl: 'socks5://127.0.0.1:1080',
    headers: { Foo: 'bar' },
    models: [{ name: 'claude-sonnet-4-5', alias: 'sonnet' }],
    excludedModels: ['claude-opus-*'],
    cloak: {
      mode: 'always',
      strictMode: true,
      sensitiveWords: ['API'],
    },
  };

  const previousForm = buildClaudeFormState(source);
  const sameSharedDifferentApiKey = { ...previousForm, apiKey: 'sk-other' };
  const changedModels = {
    ...previousForm,
    modelEntries: [{ name: 'claude-sonnet-4-5', alias: 'sonnet-latest' }],
  };

  assert.equal(hasClaudeSharedFieldChanges(previousForm, sameSharedDifferentApiKey), false);
  assert.equal(hasClaudeSharedFieldChanges(previousForm, changedModels), true);
});

test('同步共享字段时保留目标 apiKey 和 baseUrl', () => {
  const source: ProviderKeyConfig = {
    apiKey: 'sk-source',
    priority: 10,
    prefix: 'team-a',
    baseUrl: 'https://example.com',
    proxyUrl: 'socks5://127.0.0.1:1080',
    headers: { Foo: 'bar' },
    models: [{ name: 'claude-sonnet-4-5', alias: 'sonnet' }],
    excludedModels: ['claude-opus-*'],
    cloak: {
      mode: 'always',
      strictMode: true,
      sensitiveWords: ['API'],
    },
  };
  const target: ProviderKeyConfig = {
    apiKey: 'sk-target',
    priority: 1,
    prefix: 'team-b',
    baseUrl: 'https://example.com/',
    proxyUrl: '',
    headers: { Old: 'header' },
    models: [{ name: 'claude-old', alias: 'old' }],
  };

  const synced = applyClaudeSharedFields(target, source);

  assert.equal(synced.apiKey, 'sk-target');
  assert.equal(synced.baseUrl, 'https://example.com/');
  assert.equal(synced.prefix, 'team-b');
  assert.equal(synced.priority, 10);
  assert.deepEqual(synced.headers, { Foo: 'bar' });
  assert.deepEqual(synced.models, [{ name: 'claude-sonnet-4-5', alias: 'sonnet', priority: undefined, testModel: undefined }]);
  assert.deepEqual(synced.excludedModels, ['claude-opus-*']);
  assert.deepEqual(synced.cloak, {
    mode: 'always',
    strictMode: true,
    sensitiveWords: ['API'],
  });
});

test('同步匹配使用标准化后的 Claude baseUrl', () => {
  assert.equal(normalizeClaudeSyncBaseUrl('https://example.com/'), 'https://example.com');
  assert.equal(normalizeClaudeSyncBaseUrl('example.com'), 'http://example.com');
  assert.equal(normalizeClaudeSyncBaseUrl(''), '');
});

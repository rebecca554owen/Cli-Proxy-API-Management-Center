import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderConfigsFromGroupForm,
  buildProviderGroupFormState,
  findProviderGroupBySignature,
  groupProviderConfigs,
} from '../src/components/providers/groupedProviderUtils.ts';
import type { GeminiKeyConfig, ProviderKeyConfig } from '../src/types/provider.ts';

test('groupProviderConfigs splits gemini groups when headers differ', () => {
  const groups = groupProviderConfigs('gemini', [
    {
      apiKey: 'k1',
      baseUrl: 'https://example.com',
      prefix: 'team',
      headers: { 'X-Env': 'a' },
    },
    {
      apiKey: 'k2',
      baseUrl: 'https://example.com',
      prefix: 'team',
      headers: { 'X-Env': 'b' },
    },
  ] satisfies GeminiKeyConfig[]);

  assert.equal(groups.length, 2);
  assert.notEqual(groups[0]?.id, groups[1]?.id);
});

test('groupProviderConfigs keeps equivalent headers in one gemini group', () => {
  const groups = groupProviderConfigs('gemini', [
    {
      apiKey: 'k1',
      baseUrl: 'https://example.com',
      prefix: 'team',
      headers: { 'X-Env': 'a', 'X-Region': 'us' },
    },
    {
      apiKey: 'k2',
      baseUrl: 'https://example.com',
      prefix: 'team',
      headers: { 'x-region': 'us', 'x-env': 'a' },
    },
  ] satisfies GeminiKeyConfig[]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.configs.length, 2);
});

test('groupProviderConfigs splits claude groups when cloak differs', () => {
  const groups = groupProviderConfigs('claude', [
    {
      apiKey: 'k1',
      baseUrl: 'https://api.anthropic.com',
      cloak: { mode: 'auto' },
    },
    {
      apiKey: 'k2',
      baseUrl: 'https://api.anthropic.com',
      cloak: { mode: 'always' },
    },
  ] satisfies ProviderKeyConfig[]);

  assert.equal(groups.length, 2);
});

test('groupProviderConfigs splits codex groups when websockets differs', () => {
  const groups = groupProviderConfigs('codex', [
    {
      apiKey: 'k1',
      baseUrl: 'https://example.com',
      websockets: false,
    },
    {
      apiKey: 'k2',
      baseUrl: 'https://example.com',
      websockets: true,
    },
  ] satisfies ProviderKeyConfig[]);

  assert.equal(groups.length, 2);
});

test('findProviderGroupBySignature returns only the matching group', () => {
  const groups = groupProviderConfigs('gemini', [
    {
      apiKey: 'k1',
      baseUrl: 'https://example.com',
      prefix: 'team',
      headers: { 'X-Env': 'a' },
    },
    {
      apiKey: 'k2',
      baseUrl: 'https://example.com',
      prefix: 'team',
      headers: { 'X-Env': 'b' },
    },
  ] satisfies GeminiKeyConfig[]);

  const target = groups[1];
  const found = findProviderGroupBySignature(groups, target?.id);

  assert.equal(found?.id, target?.id);
  assert.deepEqual(found?.indexes, [1]);
});

test('buildProviderConfigsFromGroupForm preserves one group with multiple keys and per-key proxy urls', () => {
  const groups = groupProviderConfigs('gemini', [
    {
      apiKey: 'k1',
      baseUrl: 'https://example.com',
      prefix: 'team',
      proxyUrl: 'http://proxy-a',
      headers: { 'X-Env': 'a' },
    },
    {
      apiKey: 'k2',
      baseUrl: 'https://example.com',
      prefix: 'team',
      proxyUrl: 'http://proxy-b',
      headers: { 'X-Env': 'a' },
    },
  ] satisfies GeminiKeyConfig[]);

  const form = buildProviderGroupFormState(groups[0]!);
  const rebuilt = buildProviderConfigsFromGroupForm(form);

  assert.equal(rebuilt.length, 2);
  assert.equal(rebuilt[0]?.proxyUrl, 'http://proxy-a');
  assert.equal(rebuilt[1]?.proxyUrl, 'http://proxy-b');
  assert.deepEqual(rebuilt.map((entry) => entry.headers), [
    { 'X-Env': 'a' },
    { 'X-Env': 'a' },
  ]);
});

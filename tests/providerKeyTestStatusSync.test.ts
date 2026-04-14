import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haveProviderKeyConnectivityChanged,
  remapProviderKeyTestStatuses,
  type ProviderKeyTestStatus,
} from '../src/components/providers/utils.ts';
import type { ProviderKeyEntryDraft } from '../src/components/providers/types.ts';

const buildEntry = (overrides: Partial<ProviderKeyEntryDraft> = {}): ProviderKeyEntryDraft => ({
  apiKey: '',
  proxyUrl: '',
  headers: [],
  enabled: true,
  testStatus: 'idle',
  testMessage: '',
  ...overrides,
});

const buildStatus = (status: ProviderKeyTestStatus['status'], message = ''): ProviderKeyTestStatus => ({
  status,
  message,
});

test('enabled toggle does not count as connectivity change', () => {
  const previous = [buildEntry({ apiKey: 'sk-a', enabled: true, testStatus: 'success' })];
  const next = [buildEntry({ apiKey: 'sk-a', enabled: false, testStatus: 'idle' })];

  assert.equal(haveProviderKeyConnectivityChanged(previous, next), false);
});

test('apiKey change counts as connectivity change', () => {
  const previous = [buildEntry({ apiKey: 'sk-a' })];
  const next = [buildEntry({ apiKey: 'sk-b' })];

  assert.equal(haveProviderKeyConnectivityChanged(previous, next), true);
});

test('remap keeps statuses when only enabled changes', () => {
  const previous = [buildEntry({ apiKey: 'sk-a', enabled: true })];
  const statuses = [buildStatus('success')];
  const next = [buildEntry({ apiKey: 'sk-a', enabled: false })];

  assert.deepEqual(remapProviderKeyTestStatuses(previous, statuses, next), [buildStatus('success')]);
});

test('adding or removing keys does not count as direct connectivity change', () => {
  const previous = [buildEntry({ apiKey: 'sk-a' })];
  const next = [buildEntry({ apiKey: 'sk-a' }), buildEntry({ apiKey: 'sk-b' })];

  assert.equal(haveProviderKeyConnectivityChanged(previous, next), false);
});

test('remap preserves existing statuses and initializes new keys as idle', () => {
  const previous = [buildEntry({ apiKey: 'sk-a' }), buildEntry({ apiKey: 'sk-b' })];
  const statuses = [buildStatus('success'), buildStatus('error', 'boom')];
  const next = [buildEntry({ apiKey: 'sk-a' }), buildEntry({ apiKey: 'sk-b' }), buildEntry({ apiKey: 'sk-c' })];

  assert.deepEqual(remapProviderKeyTestStatuses(previous, statuses, next), [
    buildStatus('success'),
    buildStatus('error', 'boom'),
    buildStatus('idle'),
  ]);
});

test('remap removes deleted key status without shifting remaining keys incorrectly', () => {
  const previous = [buildEntry({ apiKey: 'sk-a' }), buildEntry({ apiKey: 'sk-b' }), buildEntry({ apiKey: 'sk-c' })];
  const statuses = [buildStatus('success'), buildStatus('error', 'bad'), buildStatus('loading')];
  const next = [buildEntry({ apiKey: 'sk-a' }), buildEntry({ apiKey: 'sk-c' })];

  assert.deepEqual(remapProviderKeyTestStatuses(previous, statuses, next), [
    buildStatus('success'),
    buildStatus('loading'),
  ]);
});

test('remap matches duplicate keys by occurrence order', () => {
  const previous = [
    buildEntry({ apiKey: 'sk-a', proxyUrl: 'http://one' }),
    buildEntry({ apiKey: 'sk-a', proxyUrl: 'http://one' }),
  ];
  const statuses = [buildStatus('success'), buildStatus('error', 'second')];
  const next = [
    buildEntry({ apiKey: 'sk-a', proxyUrl: 'http://one', enabled: false }),
    buildEntry({ apiKey: 'sk-a', proxyUrl: 'http://one' }),
  ];

  assert.deepEqual(remapProviderKeyTestStatuses(previous, statuses, next), [
    buildStatus('success'),
    buildStatus('error', 'second'),
  ]);
});

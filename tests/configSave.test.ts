import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfigYamlForSave } from '../src/pages/configSave.ts';

test('源码模式保存时直接使用编辑器内容，不经过可视化合并', () => {
  const sourceYaml = `host: 0.0.0.0
payload:
  override:
    - models:
        - name: gpt-5.2
        - name: gpt-5.3-codex
        - name: gpt-5.4
      params:
        service_tier: priority
`;

  const merged = buildConfigYamlForSave({
    activeTab: 'source',
    content: sourceYaml,
    applyVisualChangesToYaml: () => 'payload: {}\n',
  });

  assert.equal(merged, sourceYaml);
  assert.match(merged, /service_tier: priority/);
});

test('可视化模式保存时继续使用可视化合并结果', () => {
  const merged = buildConfigYamlForSave({
    activeTab: 'visual',
    content: 'host: 0.0.0.0\n',
    applyVisualChangesToYaml: (yaml) => `${yaml}debug: true\n`,
  });

  assert.equal(merged, 'host: 0.0.0.0\ndebug: true\n');
});

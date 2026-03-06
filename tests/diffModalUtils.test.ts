import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiffCards } from '../src/components/config/diffModalUtils.ts';

test('payload override 模型调整应生成可读的单个差异卡片', () => {
  const original = `host: 0.0.0.0
port: 8317

# When false, only localhost can access management endpoints (a key
remote-management:
  allow-remote: false

auth-dir: ./auth

payload:
  override:
    - models:
        - name: gpt-5.2
        - name: gpt-5.3-codex
        - name: gpt-5.4
      params:
        service_tier: priority
`;

  const modified = `host: 0.0.0.0
port: 8317

# When false, only localhost can access management endpoints (a key
remote-management:
  allow-remote: false

auth-dir: ./auth

payload:
  override:
    - models:
        - name: gpt-5.2
        - name: gpt-5.4
        - name: gpt-5.3-codex
        - name: gpt-5.1-codex-mini
      params:
        service_tier: priority
`;

  const cards = buildDiffCards(original, modified);

  assert.equal(cards.length, 1);
  assert.match(cards[0].current.lines.map((line) => line.text).join('\n'), /gpt-5\.3-codex/);
  assert.match(cards[0].modified.lines.map((line) => line.text).join('\n'), /gpt-5\.1-codex-mini/);
  assert.match(cards[0].modified.lines.map((line) => line.text).join('\n'), /service_tier: priority/);
});

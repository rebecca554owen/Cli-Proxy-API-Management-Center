/**
 * 使用统计相关工具
 * 提供 key stats、status bar、source ID 规范化等纯逻辑
 */

import { maskApiKey } from './format';

export interface KeyStatBucket {
  success: number;
  failure: number;
}

export interface KeyStats {
  bySource: Record<string, KeyStatBucket>;
  byAuthIndex: Record<string, KeyStatBucket>;
}

export interface UsageDetail {
  timestamp: string;
  source: string;
  auth_index: string | number;
  failed: boolean;
  __timestampMs?: number;
}

export const normalizeAuthIndex = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

// ── Source ID 规范化 ──

const USAGE_SOURCE_PREFIX_KEY = 'k:';
const USAGE_SOURCE_PREFIX_MASKED = 'm:';
const USAGE_SOURCE_PREFIX_TEXT = 't:';

const KEY_LIKE_TOKEN_REGEX =
  /(sk-[A-Za-z0-9-_]{6,}|sk-ant-[A-Za-z0-9-_]{6,}|AIza[0-9A-Za-z-_]{8,}|AI[a-zA-Z0-9_-]{6,}|hf_[A-Za-z0-9]{6,}|pk_[A-Za-z0-9]{6,}|rk_[A-Za-z0-9]{6,})/;
const MASKED_TOKEN_HINT_REGEX = /^[^\s]{1,24}(\*{2,}|\.{3}|…)[^\s]{1,24}$/;

const keyFingerprintCache = new Map<string, string>();

const fnv1a64Hex = (value: string): string => {
  const cached = keyFingerprintCache.get(value);
  if (cached) return cached;

  const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }

  const hex = hash.toString(16).padStart(16, '0');
  keyFingerprintCache.set(value, hex);
  return hex;
};

const looksLikeRawSecret = (text: string): boolean => {
  if (!text || /\s/.test(text)) return false;

  const lower = text.toLowerCase();
  if (lower.endsWith('.json')) return false;
  if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
  if (/[\\/]/.test(text)) return false;

  if (KEY_LIKE_TOKEN_REGEX.test(text)) return true;

  if (text.length >= 32 && text.length <= 512) {
    return true;
  }

  if (text.length >= 16 && text.length < 32 && /^[A-Za-z0-9._=-]+$/.test(text)) {
    return /[A-Za-z]/.test(text) && /\d/.test(text);
  }

  return false;
};

const extractRawSecretFromText = (text: string): string | null => {
  if (!text) return null;
  if (looksLikeRawSecret(text)) return text;

  const keyLikeMatch = text.match(KEY_LIKE_TOKEN_REGEX);
  if (keyLikeMatch?.[0]) return keyLikeMatch[0];

  const queryMatch = text.match(
    /(?:[?&])(api[-_]?key|key|token|access_token|authorization)=([&#\s]+)/i
  );
  const queryValue = queryMatch?.[2];
  if (queryValue && looksLikeRawSecret(queryValue)) {
    return queryValue;
  }

  const headerMatch = text.match(
    /(api[-_]?key|key|token|access[-_]?token|authorization)\s*[:=]\s*([A-Za-z0-9._=-]+)/i
  );
  const headerValue = headerMatch?.[2];
  if (headerValue && looksLikeRawSecret(headerValue)) {
    return headerValue;
  }

  const bearerMatch = text.match(/\bBearer\s+([A-Za-z0-9._=-]{6,})/i);
  const bearerValue = bearerMatch?.[1];
  if (bearerValue && looksLikeRawSecret(bearerValue)) {
    return bearerValue;
  }

  return null;
};

export function normalizeUsageSourceId(
  value: unknown,
  masker: (val: string) => string = maskApiKey
): string {
  const raw = typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const extracted = extractRawSecretFromText(trimmed);
  if (extracted) {
    return `${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(extracted)}`;
  }

  if (MASKED_TOKEN_HINT_REGEX.test(trimmed)) {
    return `${USAGE_SOURCE_PREFIX_MASKED}${masker(trimmed)}`;
  }

  return `${USAGE_SOURCE_PREFIX_TEXT}${trimmed}`;
}

export function buildCandidateUsageSourceIds(input: { apiKey?: string; prefix?: string }): string[] {
  const result: string[] = [];

  const prefix = input.prefix?.trim();
  if (prefix) {
    result.push(`${USAGE_SOURCE_PREFIX_TEXT}${prefix}`);
  }

  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    result.push(`${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(apiKey)}`);
    result.push(`${USAGE_SOURCE_PREFIX_MASKED}${maskApiKey(apiKey)}`);
  }

  return Array.from(new Set(result));
}

// ── Status Bar ──

export type StatusBlockState = 'success' | 'failure' | 'mixed' | 'idle';

export interface StatusBlockDetail {
  success: number;
  failure: number;
  /** 该格子的成功率 (0–1)，无请求时为 -1 */
  rate: number;
  /** 格子起始时间戳 (ms) */
  startTime: number;
  /** 格子结束时间戳 (ms) */
  endTime: number;
}

export interface StatusBarData {
  blocks: StatusBlockState[];
  blockDetails: StatusBlockDetail[];
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
}

export const EMPTY_STATUS_BAR: StatusBarData = {
  blocks: Array.from({ length: 20 }, () => 'idle' as StatusBlockState),
  blockDetails: Array.from({ length: 20 }, () => ({
    success: 0,
    failure: 0,
    rate: -1,
    startTime: 0,
    endTime: 0,
  })),
  successRate: 100,
  totalSuccess: 0,
  totalFailure: 0,
};

export function calculateStatusBarData(
  usageDetails: UsageDetail[],
  sourceFilter?: string,
  authIndexFilter?: number
): StatusBarData {
  const BLOCK_COUNT = 20;
  const BLOCK_DURATION_MS = 10 * 60 * 1000;
  const WINDOW_MS = BLOCK_COUNT * BLOCK_DURATION_MS;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const blockStats: Array<{ success: number; failure: number }> = Array.from(
    { length: BLOCK_COUNT },
    () => ({ success: 0, failure: 0 })
  );
  let totalSuccess = 0;
  let totalFailure = 0;

  usageDetails.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number' ? detail.__timestampMs : Date.parse(detail.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp < windowStart || timestamp > now) {
      return;
    }
    if (sourceFilter !== undefined && detail.source !== sourceFilter) {
      return;
    }
    if (authIndexFilter !== undefined && normalizeAuthIndex(detail.auth_index) !== String(authIndexFilter)) {
      return;
    }

    const ageMs = now - timestamp;
    const blockIndex = BLOCK_COUNT - 1 - Math.floor(ageMs / BLOCK_DURATION_MS);
    if (blockIndex < 0 || blockIndex >= BLOCK_COUNT) {
      return;
    }

    if (detail.failed) {
      blockStats[blockIndex].failure += 1;
      totalFailure += 1;
    } else {
      blockStats[blockIndex].success += 1;
      totalSuccess += 1;
    }
  });

  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];

  blockStats.forEach((stat, idx) => {
    const total = stat.success + stat.failure;
    if (total === 0) {
      blocks.push('idle');
    } else if (stat.failure === 0) {
      blocks.push('success');
    } else if (stat.success === 0) {
      blocks.push('failure');
    } else {
      blocks.push('mixed');
    }

    const blockStartTime = windowStart + idx * BLOCK_DURATION_MS;
    blockDetails.push({
      success: stat.success,
      failure: stat.failure,
      rate: total > 0 ? stat.success / total : -1,
      startTime: blockStartTime,
      endTime: blockStartTime + BLOCK_DURATION_MS,
    });
  });

  const total = totalSuccess + totalFailure;
  return {
    blocks,
    blockDetails,
    successRate: total > 0 ? (totalSuccess / total) * 100 : 100,
    totalSuccess,
    totalFailure,
  };
}

/**
 * 将 monitor/key-stats 返回的 blocks 数组转换为 StatusBarData
 */
export function blocksToStatusBarData(
  blocks: ReadonlyArray<{ success: number; failure: number }>,
  windowStartMs: number,
  blockDurationMs: number
): StatusBarData {
  const blockStates: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];
  let totalSuccess = 0;
  let totalFailure = 0;

  blocks.forEach((stat, idx) => {
    const total = stat.success + stat.failure;
    if (total === 0) {
      blockStates.push('idle');
    } else if (stat.failure === 0) {
      blockStates.push('success');
    } else if (stat.success === 0) {
      blockStates.push('failure');
    } else {
      blockStates.push('mixed');
    }

    const blockStartTime = windowStartMs + idx * blockDurationMs;
    blockDetails.push({
      success: stat.success,
      failure: stat.failure,
      rate: total > 0 ? stat.success / total : -1,
      startTime: blockStartTime,
      endTime: blockStartTime + blockDurationMs,
    });

    totalSuccess += stat.success;
    totalFailure += stat.failure;
  });

  const total = totalSuccess + totalFailure;
  const successRate = total > 0 ? (totalSuccess / total) * 100 : 100;

  return {
    blocks: blockStates,
    blockDetails,
    successRate,
    totalSuccess,
    totalFailure,
  };
}

/**
 * 从 statusBar Map 中按候选 source ID 列表查找第一个匹配的 StatusBarData
 */
export function lookupStatusBar(
  map: Map<string, StatusBarData>,
  candidates: string[]
): StatusBarData {
  const matched = Array.from(new Set(candidates))
    .map((candidate) => map.get(candidate))
    .filter(Boolean) as StatusBarData[];

  if (!matched.length) {
    return EMPTY_STATUS_BAR;
  }

  if (matched.length === 1) {
    return matched[0];
  }

  const blockCount = matched[0]?.blockDetails.length ?? 0;
  if (!blockCount) {
    return EMPTY_STATUS_BAR;
  }

  const blockDetails = Array.from({ length: blockCount }, (_, index) => {
    const base = matched[0].blockDetails[index];
    let success = 0;
    let failure = 0;

    matched.forEach((item) => {
      const detail = item.blockDetails[index];
      if (!detail) return;
      success += detail.success;
      failure += detail.failure;
    });

    const total = success + failure;
    return {
      success,
      failure,
      rate: total > 0 ? success / total : -1,
      startTime: base?.startTime ?? 0,
      endTime: base?.endTime ?? 0,
    };
  });

  const totalSuccess = blockDetails.reduce((sum, detail) => sum + detail.success, 0);
  const totalFailure = blockDetails.reduce((sum, detail) => sum + detail.failure, 0);
  const total = totalSuccess + totalFailure;

  return {
    blocks: blockDetails.map((detail) => {
      if (detail.rate === -1) return 'idle';
      if (detail.failure === 0) return 'success';
      if (detail.success === 0) return 'failure';
      return 'mixed';
    }),
    blockDetails,
    successRate: total > 0 ? (totalSuccess / total) * 100 : 100,
    totalSuccess,
    totalFailure,
  };
}

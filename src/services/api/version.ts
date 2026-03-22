/**
 * 版本相关 API
 */

import { apiClient } from './client';
import type { VersionCheckResponse } from '@/types';

export const versionApi = {
  checkLatest: () => apiClient.get<VersionCheckResponse>('/latest-version'),
};

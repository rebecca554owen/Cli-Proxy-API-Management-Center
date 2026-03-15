import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authFilesApi, providersApi } from '@/services/api';
import { useConfigStore, useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import { withDisableAllModelsRule, withoutDisableAllModelsRule } from '@/components/providers/utils';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import type { RawConfigSection } from '@/types/config';
import type { MonitorSourceMeta } from '@/utils/monitor';

interface UseMonitorChannelActionsOptions {
  sourceMetaMap: Record<string, MonitorSourceMeta>;
  onChanged?: () => Promise<void> | void;
}

interface UseMonitorChannelActionsReturn {
  pendingSource: string | null;
  copySourceValue: (source: string) => Promise<void>;
  openEditor: (source: string) => void;
  toggleSource: (source: string) => Promise<void>;
  isSourceDisabled: (source: string) => boolean;
}

const resolveConfigIndex = <T extends { apiKey: string }>(
  list: T[],
  source: string,
  configIndex?: number
) => {
  if (typeof configIndex === 'number' && configIndex >= 0 && configIndex < list.length) {
    return configIndex;
  }
  return list.findIndex((item) => item.apiKey === source);
};

const resolveOpenAIProviderIndex = (
  list: OpenAIProviderConfig[],
  source: string,
  configIndex?: number
) => {
  if (typeof configIndex === 'number' && configIndex >= 0 && configIndex < list.length) {
    return configIndex;
  }

  return list.findIndex((item) => {
    if (item.name === source) return true;
    if (item.prefix === source) return true;
    return (item.apiKeyEntries || []).some((entry) => entry.apiKey === source);
  });
};

const toggleExcludedModels = <T extends { excludedModels?: string[] }>(entry: T, disabled: boolean): T => {
  const excludedModels = disabled
    ? withoutDisableAllModelsRule(entry.excludedModels)
    : withDisableAllModelsRule(entry.excludedModels);
  return { ...entry, excludedModels };
};

const syncConfigSection = (section: RawConfigSection, value: unknown) => {
  const { updateConfigValue, clearCache } = useConfigStore.getState();
  updateConfigValue(section, value);
  clearCache(section);
};

export function useMonitorChannelActions(
  options: UseMonitorChannelActionsOptions
): UseMonitorChannelActionsReturn {
  const { sourceMetaMap, onChanged } = options;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const [pendingSource, setPendingSource] = useState<string | null>(null);

  const metaMap = useMemo(() => sourceMetaMap, [sourceMetaMap]);

  const copySourceValue = useCallback(async (source: string) => {
    const meta = metaMap[source];
    if (!meta?.copyValue) {
      showNotification(t('notification.copy_failed'), 'error');
      return;
    }
    const copied = await copyToClipboard(meta.copyValue);
    showNotification(t(copied ? 'notification.link_copied' : 'notification.copy_failed'), copied ? 'success' : 'error');
  }, [metaMap, showNotification, t]);

  const openEditor = useCallback((source: string) => {
    const meta = metaMap[source];
    const editPath = meta?.editPath || '';
    if (!editPath) {
      return;
    }
    navigate(editPath);
  }, [metaMap, navigate]);

  const updateGeminiSource = useCallback(async (source: string, meta: MonitorSourceMeta) => {
    const list = await providersApi.getGeminiKeys();
    const index = resolveConfigIndex<GeminiKeyConfig>(list, source, meta.configIndex);
    if (index < 0) {
      throw new Error(t('monitor.logs.disable_error_no_provider'));
    }
    const current = list[index];
    const nextList = list.map((item, idx) =>
      idx === index ? toggleExcludedModels(current, meta.disabled) : item
    );
    await providersApi.saveGeminiKeys(nextList);
    syncConfigSection('gemini-api-key', nextList);
  }, [t]);

  const updateProviderSource = useCallback(
    async (
      source: string,
      meta: MonitorSourceMeta,
      load: () => Promise<ProviderKeyConfig[]>,
      save: (configs: ProviderKeyConfig[]) => Promise<unknown>
    ) => {
      const list = await load();
      const index = resolveConfigIndex<ProviderKeyConfig>(list, source, meta.configIndex);
      if (index < 0) {
        throw new Error(t('monitor.logs.disable_error_no_provider'));
      }
      const current = list[index];
      const nextList = list.map((item, idx) =>
        idx === index ? toggleExcludedModels(current, meta.disabled) : item
      );
      await save(nextList);
      syncConfigSection(
        load === providersApi.getClaudeConfigs
          ? 'claude-api-key'
          : load === providersApi.getCodexConfigs
            ? 'codex-api-key'
            : 'vertex-api-key',
        nextList
      );
    },
    [t]
  );

  const updateOpenAISource = useCallback(async (source: string, meta: MonitorSourceMeta) => {
    const list = await providersApi.getOpenAIProviders();
    const index = resolveOpenAIProviderIndex(list, source, meta.configIndex);
    if (index < 0) {
      throw new Error(t('monitor.logs.disable_error_no_provider'));
    }
    const current = list[index];
    const nextList = list.map((item, idx) =>
      idx === index ? toggleExcludedModels(current, meta.disabled) : item
    );
    await providersApi.saveOpenAIProviders(nextList);
    syncConfigSection('openai-compatibility', nextList);
  }, [t]);

  const toggleSource = useCallback(async (source: string) => {
    const meta = metaMap[source];
    if (!meta?.canToggle || pendingSource) {
      return;
    }
    const targetSource = meta.canonicalSource || source;

    setPendingSource(source);
    try {
      switch (meta.kind) {
        case 'auth-file':
          await authFilesApi.setStatus(meta.authFileName || targetSource, !meta.disabled);
          break;
        case 'gemini':
          await updateGeminiSource(targetSource, meta);
          break;
        case 'claude':
          await updateProviderSource(targetSource, meta, providersApi.getClaudeConfigs, providersApi.saveClaudeConfigs);
          break;
        case 'codex':
          await updateProviderSource(targetSource, meta, providersApi.getCodexConfigs, providersApi.saveCodexConfigs);
          break;
        case 'vertex':
          await updateProviderSource(targetSource, meta, providersApi.getVertexConfigs, providersApi.saveVertexConfigs);
          break;
        case 'openai':
          await updateOpenAISource(targetSource, meta);
          break;
        default:
          return;
      }

      showNotification(
        meta.disabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );

      if (onChanged) {
        await onChanged();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('notification.update_failed');
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setPendingSource(null);
    }
  }, [metaMap, onChanged, pendingSource, showNotification, t, updateGeminiSource, updateOpenAISource, updateProviderSource]);

  const isSourceDisabled = useCallback((source: string) => {
    const meta = metaMap[source];
    return Boolean(meta?.disabled);
  }, [metaMap]);

  return {
    pendingSource,
    copySourceValue,
    openEditor,
    toggleSource,
    isSourceDisabled,
  };
}

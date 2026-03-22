import { useMonitorStore } from '@/stores';
import type { ConfigSectionValueMap, RawConfigSection } from '@/types/config';
import { useConfigStore } from '@/stores';
import { withDisableAllModelsRule, withoutDisableAllModelsRule } from './utils';

type ProviderConfigSection = Extract<
  RawConfigSection,
  'gemini-api-key' | 'codex-api-key' | 'claude-api-key' | 'vertex-api-key' | 'openai-compatibility'
>;

type ProviderConfigList<K extends ProviderConfigSection> = Exclude<
  ConfigSectionValueMap[K],
  undefined
>;

export const setProviderEntryEnabled = <T extends { excludedModels?: string[] }>(
  entry: T,
  enabled: boolean
): T => ({
  ...entry,
  excludedModels: enabled
    ? withoutDisableAllModelsRule(entry.excludedModels)
    : withDisableAllModelsRule(entry.excludedModels),
});

export const syncProviderConfigSection = <K extends RawConfigSection>(
  section: K,
  value: ConfigSectionValueMap[K]
) => {
  const { updateConfigValue, clearCache } = useConfigStore.getState();
  updateConfigValue(section, value);
  clearCache(section);
};

export const refreshMonitorProviderMeta = async () => {
  await useMonitorStore.getState().ensureProviderMeta(true);
};

interface PersistProviderConfigToggleParams<K extends ProviderConfigSection> {
  list: ProviderConfigList<K>;
  index: number;
  enabled: boolean;
  save: (list: ProviderConfigList<K>) => Promise<unknown>;
  section: K;
}

export const persistProviderConfigToggle = async <K extends ProviderConfigSection>({
  list,
  index,
  enabled,
  save,
  section,
}: PersistProviderConfigToggleParams<K>) => {
  const current = list[index];
  if (!current) {
    throw new Error('Provider entry not found');
  }
  const nextItem = setProviderEntryEnabled(current, enabled);
  const nextList = list.map((item, currentIndex) =>
    currentIndex === index ? nextItem : item
  ) as ProviderConfigList<K>;
  await save(nextList);
  syncProviderConfigSection(section, nextList);
  await refreshMonitorProviderMeta();
  return nextList;
};

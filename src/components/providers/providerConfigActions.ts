import { useMonitorStore } from '@/stores';
import type { RawConfigSection } from '@/types/config';
import { useConfigStore } from '@/stores';
import { withDisableAllModelsRule, withoutDisableAllModelsRule } from './utils';

export const setProviderEntryEnabled = <T extends { excludedModels?: string[] }>(
  entry: T,
  enabled: boolean
): T => ({
  ...entry,
  excludedModels: enabled
    ? withoutDisableAllModelsRule(entry.excludedModels)
    : withDisableAllModelsRule(entry.excludedModels),
});

export const syncProviderConfigSection = (section: RawConfigSection, value: unknown) => {
  const { updateConfigValue, clearCache } = useConfigStore.getState();
  updateConfigValue(section, value);
  clearCache(section);
};

export const refreshMonitorProviderMeta = async () => {
  await useMonitorStore.getState().ensureProviderMeta(true);
};

interface PersistProviderConfigToggleParams<T extends { excludedModels?: string[] }> {
  list: T[];
  index: number;
  enabled: boolean;
  save: (list: T[]) => Promise<unknown>;
  section: RawConfigSection;
}

export const persistProviderConfigToggle = async <T extends { excludedModels?: string[] }>({
  list,
  index,
  enabled,
  save,
  section,
}: PersistProviderConfigToggleParams<T>) => {
  const current = list[index];
  if (!current) {
    throw new Error('Provider entry not found');
  }
  const nextItem = setProviderEntryEnabled(current, enabled);
  const nextList = list.map((item, currentIndex) => (currentIndex === index ? nextItem : item));
  await save(nextList);
  syncProviderConfigSection(section, nextList);
  await refreshMonitorProviderMeta();
  return nextList;
};

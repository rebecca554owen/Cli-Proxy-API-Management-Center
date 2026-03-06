export type ConfigEditorTab = 'visual' | 'source';

interface BuildConfigYamlForSaveOptions {
  activeTab: ConfigEditorTab;
  content: string;
  applyVisualChangesToYaml: (currentYaml: string) => string;
}

export function buildConfigYamlForSave({
  activeTab,
  content,
  applyVisualChangesToYaml,
}: BuildConfigYamlForSaveOptions): string {
  if (activeTab === 'source') {
    return content;
  }

  return applyVisualChangesToYaml(content);
}

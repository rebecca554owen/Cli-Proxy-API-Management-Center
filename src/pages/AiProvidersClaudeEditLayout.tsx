import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { providersApi } from '@/services/api';
import { useAuthStore, useClaudeEditDraftStore, useConfigStore, useNotificationStore } from '@/stores';
import type { ProviderKeyConfig } from '@/types';
import type { ModelInfo } from '@/utils/models';
import {
  buildProviderConfigsFromGroupForm,
  buildProviderGroupEditSignature,
  type ProviderGroupFormState,
} from '@/components/providers';
import {
  applyClaudeSharedFields,
  buildClaudeFormState,
  canSyncClaudeConfigGroup,
  hasClaudeSharedFieldChanges,
} from './claudeConfigUtils';

type LocationState = {
  fromAiProviders?: boolean;
  copyIndex?: number;
  updatedClaudeConfigs?: ProviderKeyConfig[];
} | null;

type TestStatus = 'idle' | 'loading' | 'success' | 'error';

export type ClaudeEditOutletContext = {
  hasIndexParam: boolean;
  editIndex: number | null;
  invalidIndexParam: boolean;
  invalidIndex: boolean;
  disableControls: boolean;
  loading: boolean;
  saving: boolean;
  form: ProviderGroupFormState;
  setForm: Dispatch<SetStateAction<ProviderGroupFormState>>;
  testModel: string;
  setTestModel: Dispatch<SetStateAction<string>>;
  testStatus: TestStatus;
  setTestStatus: Dispatch<SetStateAction<TestStatus>>;
  testMessage: string;
  setTestMessage: Dispatch<SetStateAction<string>>;
  availableModels: string[];
  handleBack: () => void;
  handleSave: () => Promise<void>;
  mergeDiscoveredModels: (selectedModels: ModelInfo[]) => void;
};

const parseIndexParam = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
};

const buildEmptyForm = (): ProviderGroupFormState => ({
  priority: undefined,
  prefix: '',
  baseUrl: '',
  headers: [],
  excludedText: '',
  testModel: '',
  modelEntries: [{ name: '', alias: '' }],
  keyEntries: [{ apiKey: '', proxyUrl: '', headers: [], testStatus: 'idle', testMessage: '' }],
  cloak: undefined,
});

const toHeaderEntries = (headers?: Record<string, string>) =>
  headers ? Object.entries(headers).map(([key, value]) => ({ key, value })) : [];

const buildSingleForm = (config: ProviderKeyConfig): ProviderGroupFormState => ({
  priority: config.priority,
  prefix: config.prefix ?? '',
  baseUrl: config.baseUrl ?? '',
  headers: toHeaderEntries(config.headers),
  excludedText: Array.isArray(config.excludedModels) ? config.excludedModels.join('\n') : '',
  testModel: config.models?.[0]?.name ?? '',
  modelEntries:
    config.models?.length
      ? config.models.map((model) => ({ name: model.name ?? '', alias: model.alias ?? '' }))
      : [{ name: '', alias: '' }],
  keyEntries: [
    {
      apiKey: config.apiKey ?? '',
      proxyUrl: config.proxyUrl ?? '',
      headers: toHeaderEntries(config.headers),
      testStatus: 'idle',
      testMessage: '',
    },
  ],
  cloak: config.cloak
    ? {
        mode: config.cloak.mode,
        strictMode: config.cloak.strictMode,
        sensitiveWords: config.cloak.sensitiveWords ? [...config.cloak.sensitiveWords] : undefined,
      }
    : undefined,
});

export function AiProvidersClaudeEditLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification, showConfirmation } = useNotificationStore();

  const params = useParams<{ index?: string }>();
  const hasIndexParam = typeof params.index === 'string';
  const editIndex = useMemo(() => parseIndexParam(params.index), [params.index]);
  const invalidIndexParam = hasIndexParam && editIndex === null;

  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const isCacheValid = useConfigStore((state) => state.isCacheValid);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [configs, setConfigs] = useState<ProviderKeyConfig[]>(() => config?.claudeApiKeys ?? []);
  const [loading, setLoading] = useState(() => !isCacheValid('claude-api-key'));
  const [saving, setSaving] = useState(false);

  const draftKey = useMemo(() => {
    if (invalidIndexParam) return `claude:invalid:${params.index ?? 'unknown'}`;
    if (editIndex === null) return 'claude:new';
    return `claude:${editIndex}`;
  }, [editIndex, invalidIndexParam, params.index]);

  const draft = useClaudeEditDraftStore((state) => state.drafts[draftKey]);
  const acquireDraft = useClaudeEditDraftStore((state) => state.acquireDraft);
  const releaseDraft = useClaudeEditDraftStore((state) => state.releaseDraft);
  const initDraft = useClaudeEditDraftStore((state) => state.initDraft);
  const setDraftBaselineSignature = useClaudeEditDraftStore((state) => state.setDraftBaselineSignature);
  const setDraftForm = useClaudeEditDraftStore((state) => state.setDraftForm);
  const setDraftTestModel = useClaudeEditDraftStore((state) => state.setDraftTestModel);
  const setDraftTestStatus = useClaudeEditDraftStore((state) => state.setDraftTestStatus);
  const setDraftTestMessage = useClaudeEditDraftStore((state) => state.setDraftTestMessage);

  const form = draft?.form ?? buildEmptyForm();
  const testModel = draft?.testModel ?? '';
  const testStatus = draft?.testStatus ?? 'idle';
  const testMessage = draft?.testMessage ?? '';

  const setForm: Dispatch<SetStateAction<ProviderGroupFormState>> = useCallback(
    (action) => {
      setDraftForm(draftKey, action);
    },
    [draftKey, setDraftForm]
  );

  const setTestModel: Dispatch<SetStateAction<string>> = useCallback(
    (action) => {
      setDraftTestModel(draftKey, action);
    },
    [draftKey, setDraftTestModel]
  );

  const setTestStatus: Dispatch<SetStateAction<TestStatus>> = useCallback(
    (action) => {
      setDraftTestStatus(draftKey, action);
    },
    [draftKey, setDraftTestStatus]
  );

  const setTestMessage: Dispatch<SetStateAction<string>> = useCallback(
    (action) => {
      setDraftTestMessage(draftKey, action);
    },
    [draftKey, setDraftTestMessage]
  );

  const initialConfig = useMemo(() => {
    if (editIndex === null) return undefined;
    return configs[editIndex];
  }, [configs, editIndex]);

  const invalidIndex = editIndex !== null && !initialConfig;

  const availableModels = useMemo(
    () => form.modelEntries.map((entry) => entry.name.trim()).filter(Boolean),
    [form.modelEntries]
  );

  useEffect(() => {
    acquireDraft(draftKey);
    return () => releaseDraft(draftKey);
  }, [acquireDraft, draftKey, releaseDraft]);

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.updatedClaudeConfigs) {
      navigate('/ai-providers', {
        replace: true,
        state: {
          fromClaudeSave: true,
          updatedClaudeConfigs: state.updatedClaudeConfigs,
        },
      });
      return;
    }
    if (state?.fromAiProviders) {
      navigate(-1);
      return;
    }
    navigate('/ai-providers', { replace: true });
  }, [location.state, navigate]);

  useEffect(() => {
    let cancelled = false;
    const hasValidCache = isCacheValid('claude-api-key');
    if (!hasValidCache) {
      setLoading(true);
    }

    fetchConfig('claude-api-key')
      .then((value) => {
        if (cancelled) return;
        setConfigs(Array.isArray(value) ? (value as ProviderKeyConfig[]) : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = getErrorMessage(err) || t('notification.refresh_failed');
        showNotification(`${t('notification.load_failed')}: ${message}`, 'error');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchConfig, isCacheValid, showNotification, t]);

  useEffect(() => {
    if (loading) return;
    if (draft?.initialized) return;

    if (initialConfig) {
      const seededForm = buildSingleForm(initialConfig);
      const baselineSignature = buildProviderGroupEditSignature(seededForm);
      initDraft(draftKey, {
        baselineSignature,
        form: seededForm,
        testModel: seededForm.testModel,
        testStatus: 'idle',
        testMessage: '',
      });
      return;
    }

    const locationState = location.state as LocationState;
    if (editIndex === null && typeof locationState?.copyIndex === 'number') {
      const copySource = configs[locationState.copyIndex];
      if (copySource) {
        const copiedForm = buildSingleForm(copySource);
        copiedForm.keyEntries = [{ ...copiedForm.keyEntries[0], apiKey: '', testStatus: 'idle', testMessage: '' }];
        initDraft(draftKey, {
          baselineSignature: buildProviderGroupEditSignature(copiedForm),
          form: copiedForm,
          testModel: copiedForm.testModel,
          testStatus: 'idle',
          testMessage: '',
        });
        return;
      }
    }

    const emptyForm = buildEmptyForm();
    initDraft(draftKey, {
      baselineSignature: buildProviderGroupEditSignature(emptyForm),
      form: emptyForm,
      testModel: '',
      testStatus: 'idle',
      testMessage: '',
    });
  }, [configs, draft?.initialized, draftKey, editIndex, initDraft, initialConfig, loading, location.state]);

  const resolvedLoading = !draft?.initialized;
  const currentSignature = useMemo(() => buildProviderGroupEditSignature(form), [form]);
  const baselineSignature = draft?.baselineSignature ?? '';
  const isDirty = Boolean(draft?.initialized) && baselineSignature !== currentSignature;
  const editorRootPath = useMemo(() => {
    if (hasIndexParam) {
      return `/ai-providers/claude/${params.index ?? ''}`;
    }
    return '/ai-providers/claude/new';
  }, [hasIndexParam, params.index]);
  const canGuard = !resolvedLoading && !saving && !invalidIndexParam && !invalidIndex;

  const { allowNextNavigation } = useUnsavedChangesGuard({
    enabled: canGuard,
    shouldBlock: ({ nextLocation }) => {
      const nextPath = nextLocation.pathname;
      const isWithinRoot =
        nextPath === editorRootPath || nextPath.startsWith(`${editorRootPath}/`);
      return isDirty && !isWithinRoot;
    },
    dialog: {
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
      variant: 'danger',
    },
  });

  useEffect(() => {
    if (resolvedLoading) return;

    if (availableModels.length === 0) {
      if (testModel) {
        setTestModel('');
        setTestStatus('idle');
        setTestMessage('');
      }
      return;
    }

    if (!testModel || !availableModels.includes(testModel)) {
      setTestModel(availableModels[0]);
      setTestStatus('idle');
      setTestMessage('');
    }
  }, [availableModels, resolvedLoading, setTestMessage, setTestModel, setTestStatus, testModel]);

  const mergeDiscoveredModels = useCallback(
    (selectedModels: ModelInfo[]) => {
      if (!selectedModels.length) return;

      let addedCount = 0;
      setForm((prev) => {
        const mergedMap = new Map<string, { name: string; alias: string }>();
        prev.modelEntries.forEach((entry) => {
          const name = entry.name.trim();
          if (!name) return;
          mergedMap.set(name, { name, alias: entry.alias?.trim() || '' });
        });

        selectedModels.forEach((model) => {
          const name = model.name.trim();
          if (!name || mergedMap.has(name)) return;
          mergedMap.set(name, { name, alias: model.alias ?? '' });
          addedCount += 1;
        });

        const mergedEntries = Array.from(mergedMap.values());
        return {
          ...prev,
          modelEntries: mergedEntries.length ? mergedEntries : [{ name: '', alias: '' }],
        };
      });

      if (addedCount > 0) {
        showNotification(t('ai_providers.claude_models_fetch_added', { count: addedCount }), 'success');
      }
    },
    [setForm, showNotification, t]
  );

  const handleSave = useCallback(async () => {
    const canSave =
      !disableControls && !saving && !resolvedLoading && !invalidIndexParam && !invalidIndex;
    if (!canSave) return;

    const payloads = buildProviderConfigsFromGroupForm(form);
    if (!payloads.length) {
      showNotification(t('ai_providers.claude_test_key_required'), 'error');
      return;
    }
    const nextPayload = payloads[0];
    const performSave = async (syncGroup: boolean) => {
      setSaving(true);
      try {
        const nextList =
          editIndex !== null
            ? configs.map((item, index) => {
                if (index === editIndex) return nextPayload;
                if (syncGroup && canSyncClaudeConfigGroup(item, configs[editIndex])) {
                  return applyClaudeSharedFields(item, nextPayload);
                }
                return item;
              })
            : [...configs, nextPayload];

        await providersApi.saveClaudeConfigs(nextList);
        setConfigs(nextList);
        updateConfigValue('claude-api-key', nextList);
        clearCache('claude-api-key');
        showNotification(
          editIndex !== null
            ? t('notification.claude_config_updated')
            : t('notification.claude_config_added'),
          'success'
        );
        allowNextNavigation();
        setDraftBaselineSignature(draftKey, buildProviderGroupEditSignature(form));
        navigate('/ai-providers', {
          replace: true,
          state: {
            fromClaudeSave: true,
            updatedClaudeConfigs: nextList,
          },
        });
      } catch (err: unknown) {
        showNotification(`${t('notification.update_failed')}: ${getErrorMessage(err)}`, 'error');
      } finally {
        setSaving(false);
      }
    };

    const currentConfig = editIndex !== null ? configs[editIndex] : undefined;
    const siblingCount =
      currentConfig && editIndex !== null
        ? configs.filter((item, index) => index !== editIndex && canSyncClaudeConfigGroup(item, currentConfig)).length
        : 0;
    const shouldPromptSync =
      Boolean(currentConfig) &&
      siblingCount > 0 &&
      hasClaudeSharedFieldChanges(buildClaudeFormState(currentConfig!), buildClaudeFormState(nextPayload));

    if (shouldPromptSync) {
      showConfirmation({
        title: '同步相同上游配置',
        message: `检测到还有 ${siblingCount} 个相同 baseUrl + prefix 的 Claude key。是否将模型映射、代理、请求头、优先级等共享配置同步到这些 key？`,
        confirmText: '同步保存',
        cancelText: '仅保存当前',
        onConfirm: async () => {
          await performSave(true);
        },
        onCancel: () => {
          void performSave(false);
        },
      });
      return;
    }

    await performSave(false);
  }, [
    allowNextNavigation,
    clearCache,
    configs,
    draftKey,
    disableControls,
    editIndex,
    form,
    invalidIndex,
    invalidIndexParam,
    navigate,
    resolvedLoading,
    saving,
    setDraftBaselineSignature,
    showConfirmation,
    showNotification,
    t,
    updateConfigValue,
  ]);

  return (
    <Outlet
      context={{
        hasIndexParam,
        editIndex,
        invalidIndexParam,
        invalidIndex,
        disableControls,
        loading: resolvedLoading,
        saving,
        form,
        setForm,
        testModel,
        setTestModel,
        testStatus,
        setTestStatus,
        testMessage,
        setTestMessage,
        availableModels,
        handleBack,
        handleSave,
        mergeDiscoveredModels,
      } satisfies ClaudeEditOutletContext}
    />
  );
}

import { defaultPlanBudgets } from './data';
import { defaultFilters } from './engine';
import type {
  Currency,
  ExportFormat,
  GeneralPreferences,
  ModelProfile,
  PlanBudget,
  RoutingPreference,
  SettingsState,
  TaskCategory,
  ThemeMode,
  UsageColumnId,
  WeekStart,
} from './types';

export const defaultAccentColor = '#007aff';

export const accentPresets: string[] = [
  '#007aff',
  '#ff1e26',
  '#fe941e',
  '#ffff00',
  '#06bd00',
  '#001a98',
  '#760088',
];

export const defaultGeneral: GeneralPreferences = {
  accentColor: defaultAccentColor,
  currency: 'EUR',
  fxRatePerUsd: {
    BRL: 5.10,
    EUR: 0.926,
    GBP: 0.79,
  },
  weekStart: 'monday',
};

export type SettingsStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export const settingsStorageKey = 'ai-ops-settings-v3';
export const legacyBudgetStorageKey = 'ai-ops-plan-budgets';

export const usageColumnIds: UsageColumnId[] = [
  'date',
  'provider',
  'model',
  'workspace',
  'category',
  'turns',
  'tokens',
  'tokensPerTurn',
  'apiProxy',
  'source',
];

export const buildDefaultColumnVisibility = (): Record<UsageColumnId, boolean> =>
  Object.fromEntries(usageColumnIds.map((id) => [id, true])) as Record<UsageColumnId, boolean>;

export const defaultModelProfiles: ModelProfile[] = [
  {
    avoidFor: ['Long final-review memos', 'Ambiguous strategy synthesis'],
    bestFor: ['Multi-file code', 'tests', 'repo work', 'terminal workflows'],
    costTier: 'premium',
    model: 'Codex Frontier',
    provider: 'Codex',
    recommendedSkills: ['github', 'repo-conventions'],
    role: 'Primary implementation agent',
  },
  {
    avoidFor: ['Large architecture rewrites', 'ambiguous product decisions'],
    bestFor: ['Small fixes', 'lint cleanup', 'mechanical refactors'],
    costTier: 'budget',
    model: 'Codex Mini Route',
    provider: 'Codex',
    recommendedSkills: ['github'],
    role: 'Cheap-first code route',
  },
  {
    avoidFor: ['Bulk mechanical edits', 'test loops that need terminal execution'],
    bestFor: ['Strategy', 'note synthesis', 'narrative writing', 'decision memos'],
    costTier: 'standard',
    model: 'Claude Sonnet',
    provider: 'Claude',
    recommendedSkills: ['research', 'writing'],
    role: 'Narrative and analysis partner',
  },
  {
    avoidFor: ['Routine execution', 'simple extraction', 'cheap triage'],
    bestFor: ['Critical review', 'high-stakes reasoning', 'architecture critique'],
    costTier: 'premium',
    model: 'Claude Opus',
    provider: 'Claude',
    recommendedSkills: ['code-review', 'research'],
    role: 'Premium review pass',
  },
  {
    avoidFor: ['Owning complex implementation', 'deep architecture'],
    bestFor: ['Classification', 'tagging', 'summary extraction', 'routing'],
    costTier: 'budget',
    model: 'Claude Haiku',
    provider: 'Claude',
    recommendedSkills: ['extraction'],
    role: 'Fast triage route',
  },
];

export const taskCategories: TaskCategory[] = [
  'automation',
  'deck',
  'engineering',
  'finance',
  'general',
  'notes',
  'strategy',
];

export const defaultRoutingPreferences: Record<TaskCategory, RoutingPreference> = {
  automation: { fallbackAgentId: 'claude-haiku', primaryAgentId: 'codex-mini' },
  deck: { fallbackAgentId: 'claude-haiku', primaryAgentId: 'claude-sonnet' },
  engineering: { fallbackAgentId: 'codex-mini', primaryAgentId: 'codex-frontier' },
  finance: { fallbackAgentId: 'codex-mini', primaryAgentId: 'claude-sonnet' },
  general: { fallbackAgentId: 'codex-mini', primaryAgentId: 'claude-sonnet' },
  notes: { fallbackAgentId: 'claude-haiku', primaryAgentId: 'claude-sonnet' },
  strategy: { fallbackAgentId: 'claude-haiku', primaryAgentId: 'claude-sonnet' },
};

export const defaultSettings: SettingsState = {
  defaultFilters,
  general: defaultGeneral,
  modelProfiles: defaultModelProfiles,
  planBudgets: defaultPlanBudgets,
  routingPreferences: defaultRoutingPreferences,
  table: {
    columnVisibility: buildDefaultColumnVisibility(),
    exportFormat: 'csv',
    pageIndex: 0,
    pageSize: 25,
    search: '',
  },
  theme: 'system',
  version: 3,
};

const getBrowserStorage = (): SettingsStorage | undefined => {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
};

const parseJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const isPlanBudgetArray = (value: unknown): value is PlanBudget[] =>
  Array.isArray(value) &&
  value.every((item) =>
    item &&
    typeof item === 'object' &&
    'provider' in item &&
    'planName' in item &&
    'monthlyPriceUsd' in item
  );

const sanitizeExportFormat = (value: unknown): ExportFormat =>
  value === 'json' ? 'json' : 'csv';

const sanitizeTheme = (value: unknown): ThemeMode =>
  value === 'dark' || value === 'light' || value === 'system' ? value : 'system';

const isCurrency = (value: unknown): value is Currency =>
  value === 'EUR' || value === 'USD' || value === 'GBP' || value === 'BRL';

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);

const sanitizeWeekStart = (value: unknown): WeekStart =>
  value === 'sunday' ? 'sunday' : 'monday';

const sanitizeGeneral = (
  candidate: Partial<GeneralPreferences> | undefined
): GeneralPreferences => ({
  accentColor: isHexColor(candidate?.accentColor) ? candidate!.accentColor : defaultGeneral.accentColor,
  currency: isCurrency(candidate?.currency) ? candidate!.currency : defaultGeneral.currency,
  fxRatePerUsd: {
    ...defaultGeneral.fxRatePerUsd,
    ...(candidate?.fxRatePerUsd ?? {}),
  },
  weekStart: sanitizeWeekStart(candidate?.weekStart),
});

const sanitizeBudgets = (candidate: PlanBudget[] | undefined): PlanBudget[] => {
  const source = candidate?.length ? candidate : defaultPlanBudgets;
  return source.map((budget, index) => ({
    dailyCeilingUsd:
      typeof budget.dailyCeilingUsd === 'number' && budget.dailyCeilingUsd >= 0
        ? budget.dailyCeilingUsd
        : defaultPlanBudgets[index]?.dailyCeilingUsd ?? 0,
    monthlyPriceUsd: budget.monthlyPriceUsd,
    planName: budget.planName,
    provider: budget.provider,
    resetCadence: budget.resetCadence,
    strictPlanMode: Boolean(budget.strictPlanMode),
    warnAtPercent: budget.warnAtPercent,
  }));
};

export const mergeSettings = (candidate: Partial<SettingsState> | null): SettingsState => ({
  ...defaultSettings,
  ...candidate,
  defaultFilters: {
    ...defaultSettings.defaultFilters,
    ...(candidate?.defaultFilters ?? {}),
    tab: String(candidate?.defaultFilters?.tab) === 'settings'
      ? defaultSettings.defaultFilters.tab
      : candidate?.defaultFilters?.tab ?? defaultSettings.defaultFilters.tab,
  },
  general: sanitizeGeneral(candidate?.general),
  modelProfiles: candidate?.modelProfiles?.length ? candidate.modelProfiles : defaultSettings.modelProfiles,
  planBudgets: sanitizeBudgets(candidate?.planBudgets),
  routingPreferences: {
    ...defaultSettings.routingPreferences,
    ...(candidate?.routingPreferences ?? {}),
  },
  table: {
    ...defaultSettings.table,
    ...(candidate?.table ?? {}),
    columnVisibility: {
      ...defaultSettings.table.columnVisibility,
      ...(candidate?.table?.columnVisibility ?? {}),
    },
    exportFormat: sanitizeExportFormat(candidate?.table?.exportFormat),
    pageSize: [10, 25, 50, 100].includes(candidate?.table?.pageSize ?? 0)
      ? Number(candidate?.table?.pageSize)
      : defaultSettings.table.pageSize,
  },
  theme: sanitizeTheme(candidate?.theme),
  version: 3,
});

export const migrateSettings = (storage = getBrowserStorage()): SettingsState => {
  const stored = parseJson<Partial<SettingsState>>(storage?.getItem(settingsStorageKey) ?? null);
  if (stored) {
    const merged = mergeSettings(stored);
    storage?.setItem(settingsStorageKey, JSON.stringify(merged));
    return merged;
  }

  const legacyBudgets = parseJson<unknown>(storage?.getItem(legacyBudgetStorageKey) ?? null);
  const migrated = mergeSettings({
    planBudgets: isPlanBudgetArray(legacyBudgets) ? legacyBudgets : defaultPlanBudgets,
  });
  storage?.setItem(settingsStorageKey, JSON.stringify(migrated));
  return migrated;
};

export const loadSettings = (storage = getBrowserStorage()): SettingsState =>
  migrateSettings(storage);

export const saveSettings = (settings: SettingsState, storage = getBrowserStorage()) => {
  storage?.setItem(settingsStorageKey, JSON.stringify(mergeSettings(settings)));
};

export const resolveTheme = (
  theme: ThemeMode,
  prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
): 'dark' | 'light' => {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
};

export const applyTheme = (theme: ThemeMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(theme);
};

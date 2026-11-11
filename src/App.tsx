import {
  Activity,
  BarChart3,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  DatabaseZap,
  Download,
  ExternalLink,
  Gauge,
  Info,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Moon,
  Monitor,
  PlugZap,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  PaginationState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';

const UsageAreaChart = lazy(() =>
  import('./charts').then((mod) => ({ default: mod.UsageAreaChart }))
);
const ContextLineChart = lazy(() =>
  import('./charts').then((mod) => ({ default: mod.ContextLineChart }))
);
const ProviderPie = lazy(() =>
  import('./charts').then((mod) => ({ default: mod.ProviderPie }))
);
const FinanceBarChart = lazy(() =>
  import('./charts').then((mod) => ({ default: mod.FinanceBarChart }))
);
const DailyComparisonBars = lazy(() =>
  import('./charts').then((mod) => ({ default: mod.DailyComparisonBars }))
);

import { getRecommendedExtensions } from './catalog';
import {
  applyAccent,
  currencyOptions,
  formatCurrencyOption,
  formatMoney,
  formatMoneyDual,
  formatMoneyNative,
  formatOption,
} from './format';
import {
  financeEntries,
  loadFinanceEntries,
  loadInvoicesPayload,
  loadUsagePayload,
  loadWorkstreams,
  prebuiltPlans,
  isSamplePayload,
  refreshUsagePayload,
  workstreams as defaultWorkstreams,
} from './data';
import { exportUsageRows } from './export';
import {
  agents,
  analyzeCategoryRouting,
  buildUsageSeries,
  calculatePlanPressure,
  compareProviders,
  inferPlansFromInvoices,
  summarizeInvoices,
  compactNumber,
  defaultFilters,
  describeFreshness,
  euro,
  filterUsageEvents,
  formatDateLabel,
  getActiveFilters,
  getLatestDate,
  getOptions,
  getStrictPlanWarnings,
  groupTotals,
  inferCategory,
  recommendAgent,
  summarizeFinance,
  summarizeProductivity,
  sum,
  toUsageEvents,
} from './engine';
import type { ActiveFilter } from './engine';
import {
  accentPresets,
  applyTheme,
  loadSettings,
  mergeSettings,
  saveSettings,
  taskCategories,
  usageColumnIds,
} from './settings';
import type {
  Currency,
  DateRange,
  ExportFormat,
  FilterState,
  GeneralPreferences,
  Grain,
  PlanBudget,
  Provider,
  ProviderPlanStatus,
  SettingsState,
  TabId,
  TaskCategory,
  ThemeMode,
  UsageColumnId,
  UsageEvent,
  UsagePayload,
  InvoicesPayload,
  WeekStart,
} from './types';

type SettingsUpdater = (settings: SettingsState) => SettingsState;

const tabs: Array<{ icon: typeof LayoutDashboard; id: TabId; label: string }> = [
  { icon: CalendarDays, id: 'daily', label: 'Daily' },
  { icon: LayoutDashboard, id: 'plan', label: 'AI Plan Control' },
  { icon: Bot, id: 'router', label: 'Router Lab' },
  { icon: ListChecks, id: 'productivity', label: 'Productivity' },
  { icon: WalletCards, id: 'finance', label: 'Finance' },
  { icon: PlugZap, id: 'sources', label: 'Sources' },
];

const tabSet = new Set(tabs.map((tab) => tab.id));
const dateRangeSet = new Set<DateRange>(['7d', '30d', '90d', 'all']);
const grainSet = new Set<Grain>(['day', 'week', 'month']);
const providerSet = new Set<Provider | 'all'>(['all', 'Claude', 'Codex']);
const categorySet = new Set<TaskCategory | 'all'>([
  'all',
  'automation',
  'deck',
  'engineering',
  'finance',
  'general',
  'notes',
  'strategy',
]);

const readFilters = (fallback = defaultFilters): FilterState => {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') as TabId | null;
  const range = params.get('range') as DateRange | null;
  const grain = params.get('grain') as Grain | null;
  const provider = params.get('provider') as Provider | 'all' | null;
  const category = params.get('category') as TaskCategory | 'all' | null;

  return {
    category: category && categorySet.has(category) ? category : fallback.category,
    grain: grain && grainSet.has(grain) ? grain : fallback.grain,
    model: params.get('model') || fallback.model,
    provider: provider && providerSet.has(provider) ? provider : fallback.provider,
    range: range && dateRangeSet.has(range) ? range : fallback.range,
    source: params.get('source') || fallback.source,
    tab: tab && tabSet.has(tab) ? tab : fallback.tab,
    workspace: params.get('workspace') || fallback.workspace,
  };
};

const syncFiltersToUrl = (filters: FilterState) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== defaultFilters[key as keyof FilterState]) params.set(key, value);
  }

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
  window.history.replaceState(null, '', nextUrl);
};

const downloadArtifact = (artifact: ReturnType<typeof exportUsageRows>) => {
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const App = () => {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [finance, setFinance] = useState(financeEntries);
  const [workstreams, setWorkstreams] = useState(defaultWorkstreams);
  const [invoicesPayload, setInvoicesPayload] = useState<InvoicesPayload>({
    generatedAt: new Date().toISOString(),
    invoices: [],
    sources: [],
  });
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings());
  const [filters, setFilters] = useState<FilterState>(() => readFilters(loadSettings().defaultFilters));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [task, setTask] = useState(
    'Refactor this local dashboard and choose whether Claude or Codex should own each step.'
  );

  useEffect(() => {
    void loadUsagePayload().then(setPayload);
    void loadFinanceEntries().then(setFinance);
    void loadWorkstreams().then(setWorkstreams);
    void loadInvoicesPayload().then(setInvoicesPayload);
  }, []);

  // Live refresh: when `npm run ingest:watch` rewrites usage.json, pick it up
  // without a manual reload. Polls periodically and on window focus; only
  // applies a payload that actually changed to avoid needless re-renders.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await refreshUsagePayload();
      if (cancelled || !next) return;
      setPayload((current) =>
        current && current.generatedAt === next.generatedAt ? current : next
      );
    };
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    syncFiltersToUrl(filters);
  }, [filters]);

  useEffect(() => {
    saveSettings(settings);
    applyTheme(settings.theme);
    applyAccent(settings.general.accentColor);
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setSettingsOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const events = useMemo(() => toUsageEvents(payload?.sessions ?? []), [payload]);
  const latestDate = useMemo(() => getLatestDate(events), [events]);
  const filteredEvents = useMemo(
    () => filterUsageEvents(events, filters, latestDate),
    [events, filters, latestDate]
  );
  const usageSeries = useMemo(
    () => buildUsageSeries(filteredEvents, filters.grain),
    [filteredEvents, filters.grain]
  );
  const dailySeries = useMemo(() => buildUsageSeries(filteredEvents, 'day'), [filteredEvents]);
  const comparison = useMemo(() => compareProviders(dailySeries), [dailySeries]);
  const inferredPlans = useMemo(
    () => inferPlansFromInvoices(invoicesPayload.invoices, settings.planBudgets),
    [invoicesPayload.invoices, settings.planBudgets]
  );
  const pressures = useMemo(
    () => calculatePlanPressure(filteredEvents, inferredPlans.plans),
    [filteredEvents, inferredPlans.plans]
  );
  const invoiceSummary = useMemo(
    () => summarizeInvoices(invoicesPayload.invoices),
    [invoicesPayload.invoices]
  );
  const warnings = useMemo(() => getStrictPlanWarnings(pressures), [pressures]);
  const providerRows = useMemo(() => groupTotals(filteredEvents, 'provider'), [filteredEvents]);
  const modelRows = useMemo(() => groupTotals(filteredEvents, 'model'), [filteredEvents]);
  const categoryRows = useMemo(() => groupTotals(filteredEvents, 'category'), [filteredEvents]);
  const recommendation = useMemo(() => recommendAgent(task), [task]);
  const routingInsight = useMemo(
    () => analyzeCategoryRouting(filteredEvents, inferCategory(task)),
    [filteredEvents, task]
  );
  const productivity = useMemo(() => summarizeProductivity(filteredEvents), [filteredEvents]);
  const financeSummary = useMemo(() => summarizeFinance(finance), [finance]);

  const updateFilters = useCallback((patch: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const activeFilters = useMemo(() => getActiveFilters(filters), [filters]);
  const clearActiveFilters = useCallback(() => {
    setFilters((current) => ({ ...defaultFilters, tab: current.tab }));
  }, []);
  const clearOneFilter = useCallback((key: keyof FilterState) => {
    setFilters((current) => ({ ...current, [key]: defaultFilters[key] }));
  }, []);

  const updateSettings = useCallback((updater: SettingsUpdater) => {
    setSettings((current) => mergeSettings(updater(current)));
  }, []);

  if (!payload) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <DatabaseZap />
          <p>Loading local AI usage aggregates...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Sidebar
        activeTab={filters.tab}
        onOpenSettings={() => setSettingsOpen(true)}
        onTabChange={(tab) => updateFilters({ tab })}
      />
      <section className="workspace-shell">
        <Header events={filteredEvents} general={settings.general} payload={payload} />
        <FilterBar
          categoryOptions={getOptions(events, 'category') as TaskCategory[]}
          filters={filters}
          modelOptions={getOptions(events, 'model')}
          onChange={updateFilters}
          sourceOptions={getOptions(events, 'source')}
          workspaceOptions={getOptions(events, 'workspace')}
        />
        {activeFilters.length > 0 && (
          <ActiveFilterChips
            filters={activeFilters}
            onClear={clearOneFilter}
            onClearAll={clearActiveFilters}
          />
        )}

        {filters.tab === 'daily' && (
          <DailyView
            comparison={comparison}
            planStatus={payload.limits}
            series={dailySeries}
          />
        )}
        {filters.tab === 'plan' && (
          <PlanView
            categoryRows={categoryRows}
            events={filteredEvents}
            general={settings.general}
            invoiceSummary={invoiceSummary}
            invoicesPayload={invoicesPayload}
            modelRows={modelRows}
            planSources={inferredPlans.sources}
            pressures={pressures}
            providerRows={providerRows}
            series={usageSeries}
            warnings={warnings}
          />
        )}
        {filters.tab === 'router' && (
          <RouterView
            general={settings.general}
            insight={routingInsight}
            recommendation={recommendation}
            task={task}
            onTaskChange={setTask}
          />
        )}
        {filters.tab === 'productivity' && (
          <ProductivityView
            general={settings.general}
            stats={productivity}
            workstreams={workstreams}
          />
        )}
        {filters.tab === 'finance' && (
          <FinanceView entries={finance} summary={financeSummary} />
        )}
        {filters.tab === 'sources' && <SourcesView payload={payload} />}

        {filters.tab !== 'daily' && (
          <DrilldownTable
            events={filteredEvents}
            general={settings.general}
            onSettingsChange={updateSettings}
            settings={settings}
          />
        )}
      </section>
      <SettingsModal
        activeCategory={filters.category}
        activeModel={filters.model}
        activeProvider={filters.provider}
        onClose={() => setSettingsOpen(false)}
        invoiceCount={invoicesPayload.invoices.length}
        onSettingsChange={updateSettings}
        open={settingsOpen}
        payload={payload}
        settings={settings}
      />
    </main>
  );
};

const Sidebar = ({
  activeTab,
  onOpenSettings,
  onTabChange,
}: {
  activeTab: TabId;
  onOpenSettings: () => void;
  onTabChange: (tab: TabId) => void;
}) => (
  <aside className="sidebar" aria-label="Dashboard navigation">
    <div className="brand-lockup">
      <span className="brand-mark">AI</span>
      <div>
        <strong>AI Ops</strong>
        <span>Plan control</span>
      </div>
    </div>
    <nav>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={activeTab === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <Icon />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
    <button className="settings-launch" onClick={onOpenSettings} type="button">
      <Settings />
      <span>Settings</span>
    </button>
    <div className="sidebar-note">
      <LockKeyhole />
      <span>Local aggregates only. No prompts, outputs, or secrets are stored.</span>
    </div>
  </aside>
);

const Header = ({
  events,
  general,
  payload,
}: {
  events: UsageEvent[];
  general: GeneralPreferences;
  payload: UsagePayload;
}) => {
  const totalTurns = sum(events.map((event) => event.turns));
  const totalTokens = sum(events.map((event) => event.tokens));
  const totalEstimate = sum(events.map((event) => event.costEstimateUsd));
  const claudeTurns = sum(events.filter((event) => event.provider === 'Claude').map((event) => event.turns));
  const codexTurns = sum(events.filter((event) => event.provider === 'Codex').map((event) => event.turns));
  const claudeShare = totalTurns > 0 ? Math.round((claudeTurns / totalTurns) * 100) : 0;
  const freshness = describeFreshness(payload.generatedAt);
  const codexPrimary = payload.limits?.codex?.windows.find((window) => window.id === 'primary');
  const codexWeekly = payload.limits?.codex?.windows.find((window) => window.id === 'secondary');
  const isSample = isSamplePayload(payload);

  return (
    <header className="top-header">
      <div className="header-lead">
        <div className="header-lead-top">
          <span className="eyebrow">AI Ops · Daily</span>
          <div className="header-status">
            {isSample ? (
              <span
                className="demo-badge"
                title="Anonymized sample data. Run the dashboard locally with npm run ingest to see your own usage."
              >
                Demo data
              </span>
            ) : (
              <span
                className="live-badge"
                title="Auto-refreshes from your local logs every 30s and on window focus. Run npm run ingest:watch for instant updates."
              >
                <span className="live-dot" aria-hidden="true" />
                Live
              </span>
            )}
            <span className="updated-inline" title={`Generated ${payload.generatedAt}`}>
              Updated {formatDateLabel(payload.generatedAt.slice(0, 10))} · {freshness.label}
            </span>
          </div>
        </div>
        <h1>How hard you're leaning on Claude Code vs ChatGPT.</h1>
        <p>
          Local Claude Code and ChatGPT/Codex usage — turns, tokens, and plan pressure, straight from your machine.
          {' '}Both are flat plans, so what counts is how much you lean on each, not a bill.
        </p>
      </div>
      <div className="header-metrics" aria-label="Usage summary for the selected range">
        <div className="metric">
          <span>
            Work split
            <InfoTip label="About Work split">
              Share of turns between the two assistants in the current range. Both are flat plans, so this is about where your work goes.
            </InfoTip>
          </span>
          <strong>{claudeShare}% <span className="metric-unit">Claude</span></strong>
          <div className="split-bar" aria-hidden="true">
            <span className="split-claude" style={{ flexGrow: Math.max(claudeShare, 0.5) }} />
            <span className="split-codex" style={{ flexGrow: Math.max(100 - claudeShare, 0.5) }} />
          </div>
        </div>
        <Metric
          label="Turns"
          value={compactNumber(totalTurns)}
          sub={`${compactNumber(claudeTurns)} Claude · ${compactNumber(codexTurns)} ChatGPT`}
          tooltip="One turn = one user prompt + one model response. Summed across filtered sessions."
        />
        <Metric
          label="Tokens"
          value={compactNumber(totalTokens)}
          sub={`across ${compactNumber(events.length)} sessions`}
          tooltip="Input + output + cached tokens across filtered sessions. Cached reads are billable on the API but free on flat plans."
        />
        {codexPrimary ? (
          <Metric
            label="ChatGPT plan burn"
            value={`${Math.round(codexPrimary.usedPercent)}%`}
            sub={codexWeekly ? `5h window · ${Math.round(codexWeekly.usedPercent)}% weekly` : '5h window'}
            tooltip="How much of your ChatGPT 5-hour quota window is used, straight from rate_limits in your Codex logs. This is your real cost — capacity, not dollars."
          />
        ) : null}
        <Metric
          label="API-equivalent"
          value={formatMoney(totalEstimate, general)}
          muted
          sub="value vs metered API — not a bill"
          tooltip={
            <>
              What this usage would cost if billed via official API pricing instead of your flat plan. A measure of value, not what you pay.
              <br />
              Anthropic + OpenAI rates verified {payload.pricing?.lastVerified ?? '2026-05-27'}. Sources in Settings → Data.
            </>
          }
        />
      </div>
      <div className="data-lineage" role="note">
        <DatabaseZap />
        {isSample ? (
          <span>Sample data — run locally to see your own usage.</span>
        ) : (
          <span>
            Ingested from your local <code>~/.claude/projects</code> + <code>~/.codex/sessions</code> logs, refreshed live.
            {' '}Read-only — nothing leaves your machine.
          </span>
        )}
      </div>
    </header>
  );
};

const InfoTip = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="info-tip" tabIndex={0} aria-label={label} role="img">
    <Info />
    <span className="info-tip-bubble" role="tooltip">{children}</span>
  </span>
);

const Metric = ({
  label,
  muted = false,
  sub,
  tooltip,
  value,
}: {
  label: string;
  muted?: boolean;
  sub?: string;
  tooltip?: ReactNode;
  value: string;
}) => (
  <div className={muted ? 'metric muted' : 'metric'}>
    <span>
      {label}
      {tooltip ? <InfoTip label={`About ${label}`}>{tooltip}</InfoTip> : null}
    </span>
    <strong>{value}</strong>
    {sub ? <small>{sub}</small> : null}
  </div>
);

type FilterBarProps = {
  categoryOptions: TaskCategory[];
  filters: FilterState;
  modelOptions: string[];
  onChange: (patch: Partial<FilterState>) => void;
  sourceOptions: string[];
  workspaceOptions: string[];
};

const FilterBar = ({
  categoryOptions,
  filters,
  modelOptions,
  onChange,
  sourceOptions,
  workspaceOptions,
}: FilterBarProps) => (
  <section className="filter-bar" aria-label="Dashboard filters">
    <div className="filter-title">
      <SlidersHorizontal />
      <span>Filters</span>
    </div>
    <SelectControl
      label="Range"
      onChange={(value) => onChange({ range: value as DateRange })}
      options={['7d', '30d', '90d', 'all']}
      value={filters.range}
    />
    <SelectControl
      label="Grain"
      onChange={(value) => onChange({ grain: value as Grain })}
      options={['day', 'week', 'month']}
      value={filters.grain}
    />
    <SelectControl
      label="Provider"
      onChange={(value) => onChange({ provider: value as Provider | 'all' })}
      options={['all', 'Claude', 'Codex']}
      value={filters.provider}
    />
    <SelectControl
      label="Model"
      onChange={(value) => onChange({ model: value })}
      options={['all', ...modelOptions]}
      value={filters.model}
    />
    <SelectControl
      label="Workspace"
      onChange={(value) => onChange({ workspace: value })}
      options={['all', ...workspaceOptions]}
      value={filters.workspace}
    />
    <SelectControl
      label="Category"
      onChange={(value) => onChange({ category: value as TaskCategory | 'all' })}
      options={['all', ...categoryOptions]}
      value={filters.category}
    />
    <SelectControl
      label="Source"
      onChange={(value) => onChange({ source: value })}
      options={['all', ...sourceOptions]}
      value={filters.source}
    />
  </section>
);

const ActiveFilterChips = ({
  filters,
  onClear,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onClear: (key: keyof FilterState) => void;
  onClearAll: () => void;
}) => (
  <section className="filter-chips" aria-label="Active filters">
    {filters.map((filter) => (
      <button
        aria-label={`Clear ${filter.label} filter: ${filter.value}`}
        className="filter-chip"
        key={filter.key}
        onClick={() => onClear(filter.key)}
        type="button"
      >
        <span>{filter.label}</span>
        <strong>{filter.value}</strong>
        <X />
      </button>
    ))}
    <button className="filter-chip clear-all" onClick={onClearAll} type="button">
      Clear all
    </button>
  </section>
);

const SelectControl = ({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) => (
  <label className="select-control">
    <span>{label}</span>
    <select onChange={(event) => onChange(event.target.value)} value={value}>
      {options.map((option) => (
        <option key={option} value={option}>
          {formatOption(option)}
        </option>
      ))}
    </select>
  </label>
);

const meterTone = (percent: number): 'ok' | 'watch' | 'over' =>
  percent >= 90 ? 'over' : percent >= 70 ? 'watch' : 'ok';

const formatResetLabel = (resetsAt: string | null): string => {
  if (!resetsAt) return '';
  const when = new Date(resetsAt);
  if (Number.isNaN(when.getTime())) return '';
  const diffMs = when.getTime() - Date.now();
  if (diffMs <= 0) return 'resetting now';
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `resets in ~${Math.max(hours, 1)}h`;
  return `resets in ~${Math.round(hours / 24)}d`;
};

const PlanBurnGauge = ({ status }: { status: ProviderPlanStatus }) => (
  <div className="burn-card">
    <div className="burn-head">
      <span className="burn-name">ChatGPT / Codex</span>
      <span className="burn-plan">{status.planType}</span>
    </div>
    {status.windows.map((window) => {
      const tone = meterTone(window.usedPercent);
      return (
        <div className="burn-window" key={window.id}>
          <div className="burn-window-row">
            <span>{window.label} window</span>
            <strong>{Math.round(window.usedPercent)}%</strong>
          </div>
          <div className="meter">
            <span className={`meter-fill ${tone}`} style={{ width: `${Math.min(window.usedPercent, 100)}%` }} />
          </div>
          <small>{formatResetLabel(window.resetsAt)}</small>
        </div>
      );
    })}
  </div>
);

const DailyView = ({
  comparison,
  planStatus,
  series,
}: {
  comparison: ReturnType<typeof compareProviders>;
  planStatus: UsagePayload['limits'];
  series: ReturnType<typeof buildUsageSeries>;
}) => {
  const [measure, setMeasure] = useState<'turns' | 'tokens'>('turns');
  const codexStatus = planStatus?.codex;
  const claudeAvgPerTurn =
    comparison.claudeTurns > 0 ? Math.round(comparison.claudeTokens / comparison.claudeTurns) : 0;
  const contextPct = Math.min((claudeAvgPerTurn / 80_000) * 100, 100);

  return (
    <>
      <section className="dashboard-grid daily-grid">
        <Panel
          icon={<CalendarDays />}
          title="Daily usage — Claude Code vs ChatGPT"
          subtitle="Side-by-side per day. Both on flat plans, so the axis is usage."
          tooltip="One pair of bars per day: how hard you leaned on each assistant. Toggle between turns and tokens."
        >
          <div className="measure-toggle" role="group" aria-label="Measure">
            {(['turns', 'tokens'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={measure === option ? 'active' : ''}
                aria-pressed={measure === option}
                onClick={() => setMeasure(option)}
              >
                {option === 'turns' ? 'Turns' : 'Tokens'}
              </button>
            ))}
          </div>
          {series.length === 0 ? (
            <EmptyState title="No usage in range" hint="Widen the date range or clear filters." />
          ) : (
            <Suspense fallback={<ChartFallback label="Loading daily usage" />}>
              <DailyComparisonBars data={series} measure={measure} />
            </Suspense>
          )}
        </Panel>

        <Panel
          icon={<BarChart3 />}
          title="Daily balance"
          subtitle="Share of work between the two, day by day"
          tooltip="Each day as a 100% split of turns. Good for spotting drift — e.g. a week that went almost all Claude."
        >
          {series.some((point) => point.turns > 0) ? (
            <div className="balance-ribbon">
              {series
                .filter((point) => point.turns > 0)
                .map((point) => {
                  const total = point.claudeTurns + point.codexTurns;
                  const claudePct = total > 0 ? (point.claudeTurns / total) * 100 : 0;
                  return (
                    <div className="ribbon-row" key={point.key}>
                      <span className="ribbon-date">{point.label}</span>
                      <div
                        className="ribbon-track"
                        title={`${point.label}: Claude ${point.claudeTurns} · ChatGPT ${point.codexTurns} turns`}
                      >
                        <span className="ribbon-seg claude" style={{ width: `${claudePct}%` }} />
                        <span className="ribbon-seg codex" style={{ width: `${100 - claudePct}%` }} />
                      </div>
                      <span className="ribbon-total">{compactNumber(total)}</span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <EmptyState title="No activity" hint="No turns in the filtered range." />
          )}
        </Panel>

        <Panel
          icon={<Gauge />}
          title="Plan pressure"
          subtitle="What each flat plan is costing you in capacity"
          tooltip="ChatGPT shows real quota windows from rate_limits in your Codex logs. Claude Code doesn't expose quotas, so it shows context pressure — average tokens per turn, which tracks how close dense sessions get to the 5h-window limit."
        >
          <div className="burn-grid">
            {codexStatus ? (
              <PlanBurnGauge status={codexStatus} />
            ) : (
              <div className="burn-card empty">
                <div className="burn-head">
                  <span className="burn-name">ChatGPT / Codex</span>
                </div>
                <p className="burn-na">No <code>rate_limits</code> captured yet. Run <code>npm run ingest</code> after using Codex.</p>
              </div>
            )}
            <div className="burn-card">
              <div className="burn-head">
                <span className="burn-name">Claude Code</span>
                <span className="burn-plan">context</span>
              </div>
              {claudeAvgPerTurn > 0 ? (
                <div className="burn-window">
                  <div className="burn-window-row">
                    <span>Avg tokens / turn</span>
                    <strong>{compactNumber(claudeAvgPerTurn)}</strong>
                  </div>
                  <div className="meter">
                    <span
                      className={`meter-fill ${meterTone(contextPct)}`}
                      style={{ width: `${Math.max(contextPct, 2)}%` }}
                    />
                  </div>
                  <small>vs ~80K guideline — denser sessions sit closer to 5h-window limits</small>
                </div>
              ) : (
                <p className="burn-na">No Claude Code turns in this range.</p>
              )}
            </div>
          </div>
          {codexStatus ? (
            <p className="burn-foot">
              ChatGPT snapshot from {formatDateLabel(codexStatus.capturedAt.slice(0, 10))}. You pay a flat plan fee — these signals are your real cost, measured in capacity.
            </p>
          ) : null}
        </Panel>
      </section>
    </>
  );
};

const PlanView = ({
  categoryRows,
  events,
  general,
  invoiceSummary,
  invoicesPayload,
  modelRows,
  planSources,
  pressures,
  providerRows,
  series,
  warnings,
}: {
  categoryRows: ReturnType<typeof groupTotals>;
  events: UsageEvent[];
  general: GeneralPreferences;
  invoiceSummary: ReturnType<typeof summarizeInvoices>;
  invoicesPayload: InvoicesPayload;
  modelRows: ReturnType<typeof groupTotals>;
  planSources: ReturnType<typeof inferPlansFromInvoices>['sources'];
  pressures: ReturnType<typeof calculatePlanPressure>;
  providerRows: ReturnType<typeof groupTotals>;
  series: ReturnType<typeof buildUsageSeries>;
  warnings: string[];
}) => {
  const totalTurns = sum(events.map((event) => event.turns));
  const premiumTurns = sum(events.filter((event) => event.model.includes('opus') || event.model.includes('gpt-5.5')).map((event) => event.turns));
  const tokensPerTurn = Math.round(sum(events.map((event) => event.tokens)) / Math.max(totalTurns, 1));

  return (
    <>
      <InvoicesStrip
        invoicesPayload={invoicesPayload}
        summary={invoiceSummary}
      />

      <section className="plan-grid" aria-label="Plan vs API value">
        {pressures.map((pressure) => {
          const multiplier = pressure.pressurePercent / 100;
          const tier: 'great' | 'good' | 'breakeven' = multiplier >= 5
            ? 'great'
            : multiplier >= 1.3
              ? 'good'
              : 'breakeven';
          const tierCopy = {
            great: 'Massive value vs API pricing',
            good: 'Solid value vs API pricing',
            breakeven: 'Close to API break-even',
          }[tier];
          return (
            <article className={`plan-tile value-${tier}`} key={pressure.budget.provider}>
              <header className="tile-head">
                <div>
                  <span className="tile-eyebrow">
                    {pressure.budget.provider}
                    {planSources[pressure.budget.provider] === 'invoices' ? (
                      <span className="plan-source-pill from-invoices" title="Plan name and price extracted from your billing receipts">
                        <CheckCircle2 /> From receipts
                      </span>
                    ) : (
                      <span className="plan-source-pill from-default" title="No receipts found. Showing fallback values — run npm run ingest:invoices.">
                        <Info /> Default
                      </span>
                    )}
                  </span>
                  <strong>{pressure.budget.planName}</strong>
                </div>
                <span className="plan-badge ok" title="Cost-only comparison. Rate-limit pressure is not tracked.">
                  <CheckCircle2 /> Within plan
                </span>
              </header>

              <dl className="plan-value-rows">
                <div>
                  <dt>
                    Plan cost
                    <InfoTip label="About plan cost">Flat monthly subscription you pay to {pressure.budget.provider === 'Claude' ? 'Anthropic' : 'OpenAI'}.</InfoTip>
                  </dt>
                  <dd>{formatMoney(pressure.budget.monthlyPriceUsd, general)} <span>/ mo</span></dd>
                </div>
                <div>
                  <dt>
                    API-equivalent
                    <InfoTip label="About API-equivalent">
                      What 30 days of this usage would cost on per-token API pricing.
                      Formula: (observed cost ÷ {pressure.daysTracked} days tracked) × 30.
                    </InfoTip>
                  </dt>
                  <dd>{formatMoney(pressure.costEstimateUsd, general)} <span>/ mo</span></dd>
                </div>
                <div>
                  <dt>Tokens (30d proxy)</dt>
                  <dd>{compactNumber(pressure.tokens)}</dd>
                </div>
                <div>
                  <dt>Turns (30d proxy)</dt>
                  <dd>{compactNumber(pressure.turns)}</dd>
                </div>
              </dl>

              <div className={`plan-multiplier tier-${tier}`}>
                <b>{multiplier >= 10 ? multiplier.toFixed(0) : multiplier.toFixed(1)}×</b>
                <span>
                  <strong>{tierCopy}.</strong>
                  {' '}You pay {formatMoney(pressure.budget.monthlyPriceUsd, general)} for usage worth {formatMoney(pressure.costEstimateUsd, general)} on the API.
                </span>
              </div>

              <p className="plan-caveat">
                <ShieldAlert />
                <span>
                  <strong>This is not rate-limit pressure.</strong> {pressure.budget.provider} limits reset on {pressure.budget.resetCadence === 'weekly' ? '5h / weekly' : pressure.budget.resetCadence} windows and aren't exposed to local logs.
                </span>
              </p>
            </article>
          );
        })}
        <article className="plan-tile context">
          <header className="tile-head">
            <div>
              <span className="tile-eyebrow">Context pressure</span>
              <strong>{compactNumber(tokensPerTurn)} tokens / turn</strong>
            </div>
            <InfoTip label="About context pressure">
              Average tokens consumed per user→model turn across the filtered set.
              High values correlate with long sessions and 5h-window rate-limit hits on Anthropic plans.
            </InfoTip>
          </header>

          <dl className="plan-value-rows">
            <div>
              <dt>Avg tokens / turn</dt>
              <dd>{compactNumber(tokensPerTurn)}</dd>
            </div>
            <div>
              <dt>
                Premium turns
                <InfoTip label="About premium turns">Turns on `opus` or `gpt-5.5` models in the filtered set.</InfoTip>
              </dt>
              <dd>{compactNumber(premiumTurns)}</dd>
            </div>
            <div>
              <dt>Typical safe range</dt>
              <dd>&lt; 80K</dd>
            </div>
          </dl>

          <p className="plan-caveat info">
            <Info />
            <span>
              When tokens/turn climbs above ~80K you're hitting context-heavy sessions. Compact context or split sessions to stay clear of 5h-window limits.
            </span>
          </p>
        </article>
      </section>

      <section className="settings-callout view-callout" aria-label="Strict plan mode advisory">
        <LockKeyhole />
        <div>
          <strong>
            Strict Plan Mode
            <InfoTip label="About Strict Plan Mode">
              When on, the task router prefers your flat-plan routes (Claude Max, ChatGPT Pro+Codex) and avoids paid API credits unless you opt in per task. Toggle per provider in Settings → Plans.
            </InfoTip>
          </strong>
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <Panel
          icon={<Activity />}
          title="Usage over time"
          subtitle="Tokens, turns, and API-equivalent cost per day"
          tooltip={
            <>
              Daily aggregates from your local logs, bucketed by the selected grain (day/week/month).
              The area shows tokens; the overlay line shows API-equivalent cost in your selected currency.
            </>
          }
        >
          {series.length === 0 ? (
            <EmptyState title="No usage in range" hint="Widen the date range or clear filters." />
          ) : (
            <Suspense fallback={<ChartFallback label="Loading usage" />}>
              <UsageAreaChart data={series} />
            </Suspense>
          )}
        </Panel>
        <Panel
          icon={<BarChart3 />}
          title="Provider split"
          subtitle="Claude vs Codex by filtered usage"
          tooltip="Token share between providers across the filtered set. Useful to see whether routing is balanced or one provider is doing all the work."
        >
          <ProviderPiePanel rows={providerRows} />
        </Panel>
        <Panel
          icon={<Gauge />}
          title="Context pressure"
          subtitle="Avg tokens per turn over time"
          tooltip={
            <>
              Daily average tokens per turn. Rising values mean longer, denser sessions — these correlate with 5h-window rate-limit hits on Anthropic plans.
              <br />
              Rule of thumb: keep this below ~80K to stay clear of limits.
            </>
          }
        >
          {series.length === 0 ? (
            <EmptyState title="No context data" hint="Filtered set is empty for this range." />
          ) : (
            <Suspense fallback={<ChartFallback label="Loading context" />}>
              <ContextLineChart data={series} />
            </Suspense>
          )}
        </Panel>
        <Panel
          icon={<BrainCircuit />}
          title="Model and category mix"
          subtitle="What is consuming attention"
          tooltip={
            <>
              Top section: tokens by model.
              Bottom section: tokens by inferred task category (engineering, strategy, notes…) — classified from workspace + model name.
            </>
          }
        >
          {modelRows.length === 0 ? (
            <EmptyState title="No rows" hint="No models match the active filters." />
          ) : (
            <>
              <RankedRows rows={modelRows.slice(0, 6)} unit="tokens" />
              <div className="divider" />
              <RankedRows rows={categoryRows.slice(0, 6)} unit="tokens" />
            </>
          )}
        </Panel>
      </section>
    </>
  );
};

const InvoicesStrip = ({
  invoicesPayload,
  summary,
}: {
  invoicesPayload: InvoicesPayload;
  summary: ReturnType<typeof summarizeInvoices>;
}) => {
  const hasInvoices = invoicesPayload.invoices.length > 0;
  const lastSync = invoicesPayload.sources[0]?.lastSync;
  const lastSyncLabel = lastSync ? formatDateLabel(lastSync.slice(0, 10)) : 'never';
  const recent = [...invoicesPayload.invoices]
    .sort((left, right) => (left.date < right.date ? 1 : -1))
    .slice(0, 4);

  return (
    <section className="invoices-strip" aria-label="Invoices">
      <header>
        <div>
          <span className="invoices-eyebrow">
            <WalletCards /> Invoices
            <InfoTip label="About invoices">
              Parsed from your billing receipt emails (Anthropic + OpenAI). These are actual amounts you paid — not estimates.
            </InfoTip>
          </span>
          <strong>{hasInvoices ? `${invoicesPayload.invoices.length} receipts on file` : 'No receipts ingested yet'}</strong>
        </div>
        <div className="invoices-sync">
          <span>Last sync</span>
          <strong>{lastSyncLabel}</strong>
        </div>
      </header>

      {hasInvoices ? (
        <>
          <ul className="invoice-summary-row">
            {summary.map((row) => (
              <li key={row.provider}>
                <span>{row.provider}</span>
                <strong>{formatMoneyNative(row.total, row.currency)}</strong>
                <small>{row.count} receipts · last {formatDateLabel(row.lastDate)}</small>
              </li>
            ))}
          </ul>
          <ul className="invoice-recent">
            {recent.map((invoice) => (
              <li key={`${invoice.provider}-${invoice.date}-${invoice.receiptNumber ?? invoice.invoiceNumber ?? invoice.description}`}>
                <span className="invoice-date">{formatDateLabel(invoice.date)}</span>
                <span className="invoice-plan">
                  <strong>{invoice.planName}</strong>
                  <small>{invoice.provider} · receipt {invoice.receiptNumber ?? invoice.invoiceNumber ?? '—'}</small>
                </span>
                <span className="invoice-amount">{formatMoneyNative(invoice.amountTotal, invoice.currency)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="invoices-empty">
          <Info />
          <div>
            <strong>No invoices yet.</strong>
            <p>
              Export your billing history (CSV, Gmail mbox or saved HTML receipts) and run <code>npm run ingest:invoices</code>. See Settings → Data Sources. Until then, plan tiles show fallback defaults.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

const RouterView = ({
  general,
  insight,
  onTaskChange,
  recommendation,
  task,
}: {
  general: GeneralPreferences;
  insight: ReturnType<typeof analyzeCategoryRouting>;
  onTaskChange: (task: string) => void;
  recommendation: ReturnType<typeof recommendAgent>;
  task: string;
}) => (
  <section className="router-layout">
    <Panel icon={<Bot />} title="Task router" subtitle="Plan-first routing before spending context">
      <label className="task-label" htmlFor="task-input">Task description</label>
      <textarea
        id="task-input"
        onChange={(event) => onTaskChange(event.target.value)}
        spellCheck={false}
        value={task}
      />
      <div className="route-result">
        <div className="route-node primary">
          <span>Primary</span>
          <strong>{recommendation.primary.name}</strong>
          <p>{recommendation.primary.vibe}</p>
        </div>
        <ChevronRight />
        <div className="route-node">
          <span>Fallback</span>
          <strong>{recommendation.fallback.name}</strong>
          <p>{recommendation.fallback.vibe}</p>
        </div>
      </div>
    </Panel>
    <Panel icon={<ShieldAlert />} title="Why this route" subtitle={`${recommendation.confidence}% confidence`}>
      <ul className="signal-list">
        {recommendation.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <div className="divider" />
      <ul className="signal-list">
        {recommendation.actions.map((action) => (
          <li key={action}>{action}</li>
        ))}
      </ul>
    </Panel>
    <RoutingInsightPanel general={general} insight={insight} />
  </section>
);

const RoutingInsightPanel = ({
  general,
  insight,
}: {
  general: GeneralPreferences;
  insight: ReturnType<typeof analyzeCategoryRouting>;
}) => {
  const ranked = [...insight.economics]
    .filter((row) => row.observedTurns > 0)
    .sort((left, right) => {
      const leftValue = left.costPerTurn ?? Number.POSITIVE_INFINITY;
      const rightValue = right.costPerTurn ?? Number.POSITIVE_INFINITY;
      return leftValue - rightValue;
    });

  return (
    <Panel
      icon={<Gauge />}
      title="Observed cost router"
      subtitle={`Category: ${insight.category} · confidence ${insight.confidence}`}
    >
      {insight.observedTurns === 0 ? (
        <EmptyState
          title="Not enough history yet"
          hint="No matching turns in this category for the active filter range."
        />
      ) : (
        <>
          <div className="insight-summary">
            <Metric label="Observed turns" value={compactNumber(insight.observedTurns)} />
            <Metric label="Observed cost" value={formatMoney(insight.observedTotalCost, general)} />
            <Metric
              label="Best-value projection"
              value={formatMoney(insight.projectedTotalCost, general)}
              muted
            />
            <Metric label="Estimated savings" value={formatMoney(insight.savings, general)} />
          </div>
          {insight.bestValue && insight.savings > 0 && (
            <p className="insight-callout">
              Routing this category through <strong>{insight.bestValue.agentName}</strong>{' '}
              ({formatMoney(insight.bestValue.costPerTurn ?? 0, general)}/turn) would have saved{' '}
              <strong>{formatMoney(insight.savings, general)}</strong> across {compactNumber(insight.observedTurns)} turns.
            </p>
          )}
          <div className="divider" />
          <div className="economics-table">
            <div className="econ-row econ-head">
              <span>Agent</span>
              <span>Turns</span>
              <span>Cost</span>
              <span>per turn</span>
            </div>
            {ranked.map((row) => (
              <div className="econ-row" key={row.agentId}>
                <span>
                  <strong>{row.agentName}</strong>
                  <small>{formatOption(row.costTier)}</small>
                </span>
                <span>{compactNumber(row.observedTurns)}</span>
                <span>{formatMoney(row.observedCost, general)}</span>
                <span>{row.costPerTurn !== null ? formatMoney(row.costPerTurn, general) : '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
};

const ProductivityView = ({
  general,
  stats,
  workstreams,
}: {
  general: GeneralPreferences;
  stats: ReturnType<typeof summarizeProductivity>;
  workstreams: typeof defaultWorkstreams;
}) => (
  <>
    <section className="productivity-summary" aria-label="Productivity summary">
      <Metric label="Active days" value={String(stats.activeDays)} />
      <Metric label="Sessions" value={compactNumber(stats.totalSessions)} />
      <Metric label="Sessions / day" value={String(stats.avgSessionsPerActiveDay)} />
      <Metric label="Total turns" value={compactNumber(stats.totalTurns)} />
      <Metric label="Premium turn %" value={`${Math.round(stats.premiumTurnRatio * 100)}%`} muted />
    </section>
    <section className="dashboard-grid">
      <Panel
        icon={<ListChecks />}
        title="Top workspaces"
        subtitle="Where the time is going (filtered range)"
      >
        {stats.topWorkspaces.length === 0 ? (
          <EmptyState title="No workspaces" hint="Widen filters or run npm run ingest." />
        ) : (
          <div className="ranked-rows">
            {stats.topWorkspaces.map((row) => (
              <div className="ranked-row" key={row.workspace}>
                <div>
                  <strong>{row.workspace}</strong>
                  <span>
                    {compactNumber(row.turns)} turns · {compactNumber(row.tokens)} tokens · {formatMoney(row.cost, general)}
                  </span>
                </div>
                <i aria-hidden="true">
                  <b
                    style={{
                      width: `${(row.tokens / Math.max(stats.topWorkspaces[0].tokens, 1)) * 100}%`,
                    }}
                  />
                </i>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel
        icon={<Activity />}
        title="Heaviest day"
        subtitle="Longest single-day session push"
      >
        {stats.longestDay ? (
          <div className="heaviest-day">
            <strong>{formatDateLabel(stats.longestDay.date)}</strong>
            <div className="insight-summary compact">
              <Metric label="Turns" value={compactNumber(stats.longestDay.turns)} />
              <Metric label="Tokens" value={compactNumber(stats.longestDay.tokens)} />
              <Metric label="Cost" value={formatMoney(stats.longestDay.cost, general)} muted />
            </div>
          </div>
        ) : (
          <EmptyState title="No activity" hint="Filtered range has no recorded turns." />
        )}
      </Panel>
    </section>
    <section className="workstream-grid">
      {workstreams.map((stream) => (
        <article className="workstream" key={stream.name}>
          <span>{stream.source}</span>
          <h2>{stream.name}</h2>
          <p>{stream.summary}</p>
          <ul>
            {stream.items.map((item) => (
              <li className={item.priority} key={item.label}>
                {item.status === 'done' ? <CheckCircle2 /> : <span className="status-dot" />}
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.status} / {item.priority}</small>
                </div>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  </>
);

const FinanceView = ({
  entries,
  summary,
}: {
  entries: typeof financeEntries;
  summary: ReturnType<typeof summarizeFinance>;
}) => {
  const rows = entries.map((entry) => ({
    ...entry,
    remaining: entry.budgetEur - entry.actualEur,
    usage: Math.round((entry.actualEur / Math.max(entry.budgetEur, 1)) * 100),
  }));

  return (
    <>
      <section className="finance-summary" aria-label="Finance summary">
        <Metric label="Budget baseline" value={euro(summary.budget)} />
        <Metric label="Known actual" value={euro(summary.actual)} />
        <Metric label="Remaining" value={euro(summary.remaining)} />
        <Metric label="Missing invoices" value={String(summary.missingInvoices)} muted />
        <Metric label="High volatility" value={String(summary.highVolatility)} muted />
      </section>
      <section className="dashboard-grid finance-grid">
        <Panel icon={<WalletCards />} title="Budget vs actual" subtitle="Load your own finance CSV with npm run ingest:finance">
          <Suspense fallback={<ChartFallback label="Loading finance" />}>
            <FinanceBarChart rows={rows} />
          </Suspense>
        </Panel>
        <Panel icon={<BriefcaseBusiness />} title="Finance operating table" subtitle="Manual source now, adapters later">
          <div className="finance-table">
            <div className="table-row table-head">
              <span>Service</span>
              <span>Budget</span>
              <span>Actual</span>
              <span>Status</span>
              <span>Next action</span>
            </div>
            {rows.map((entry) => (
              <div className="table-row" key={entry.service}>
                <span>{entry.service}</span>
                <span>{euro(entry.budgetEur)}</span>
                <span>{euro(entry.actualEur)}</span>
                <span>{entry.invoiceStatus}</span>
                <span>{entry.nextAction}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </>
  );
};

const SourcesView = ({ payload }: { payload: UsagePayload }) => (
  <section className="sources-grid">
    {payload.sources.map((source) => (
      <article className="source-tile" key={source.path}>
        <PlugZap />
        <div>
          <strong>{source.label}</strong>
          <span>{source.available ? 'Available' : 'Not found in this environment'}</span>
          <code>{source.path}</code>
        </div>
      </article>
    ))}
    <article className="source-tile">
      <DatabaseZap />
      <div>
        <strong>Sample repo data</strong>
        <span>Safe fallback for other developers</span>
        <code>/public/data/sample-usage.json</code>
      </div>
    </article>
    <article className="source-tile">
      <LockKeyhole />
      <div>
        <strong>Privacy boundary</strong>
        <span>No prompts, outputs, cookies, tokens, or API keys</span>
        <code>date / model / workspace / tokens / turns</code>
      </div>
    </article>
  </section>
);

const Panel = ({
  children,
  icon,
  subtitle,
  title,
  tooltip,
}: {
  children: ReactNode;
  icon: ReactNode;
  subtitle: string;
  title: string;
  tooltip?: ReactNode;
}) => (
  <section className="panel">
    <div className="panel-heading">
      <div className="panel-icon">{icon}</div>
      <div>
        <h2>
          {title}
          {tooltip ? <InfoTip label={`About ${title}`}>{tooltip}</InfoTip> : null}
        </h2>
        <p>{subtitle}</p>
      </div>
    </div>
    {children}
  </section>
);

const ChartFallback = ({ label = 'Loading chart' }: { label?: string }) => (
  <div className="chart-frame chart-fallback" role="status" aria-live="polite">
    <span>{label}…</span>
  </div>
);

const EmptyState = ({ hint, title }: { hint: string; title: string }) => (
  <div className="empty-state" role="status">
    <strong>{title}</strong>
    <span>{hint}</span>
  </div>
);

const ProviderPiePanel = ({ rows }: { rows: ReturnType<typeof groupTotals> }) => {
  if (rows.length === 0) {
    return <EmptyState title="No provider data" hint="Loosen filters to see Claude vs Codex split." />;
  }
  return (
    <div className="split-chart-wrap">
      <Suspense fallback={<ChartFallback label="Loading provider split" />}>
        <ProviderPie rows={rows} />
      </Suspense>
      <RankedRows rows={rows} unit="tokens" />
    </div>
  );
};

const RankedRows = ({
  rows,
  unit,
}: {
  rows: ReturnType<typeof groupTotals>;
  unit: 'tokens' | 'turns';
}) => {
  const maxValue = Math.max(...rows.map((row) => row[unit]), 1);
  return (
    <div className="ranked-rows">
      {rows.map((row) => (
        <div className="ranked-row" key={row.label}>
          <div>
            <strong>{row.label}</strong>
            <span>{compactNumber(row[unit])} {unit}</span>
          </div>
          <i aria-hidden="true">
            <b style={{ width: `${(row[unit] / maxValue) * 100}%` }} />
          </i>
        </div>
      ))}
    </div>
  );
};

const columnTooltips: Record<string, ReactNode> = {
  date: 'Day the session ran (YYYY-MM-DD).',
  provider: 'Which provider served the session (Claude or Codex). Detected from log origin.',
  model: 'Model used for the session — e.g. claude-sonnet-4-6, gpt-5.3-codex.',
  workspace: 'Working directory or repo path where the session ran.',
  category: 'Inferred task category from workspace + model heuristics: engineering, strategy, notes, finance, automation, deck, general.',
  turns: 'Number of user→model exchanges in the session.',
  tokens: 'Total tokens for the session (input + output + cached).',
  tokensPerTurn: 'tokens ÷ turns for this session. High values = long, dense turns.',
  apiProxy: 'Estimated cost if billed via official API pricing. Token counts × price book (Settings → Models). Not a billed amount.',
  source: 'Origin of this row — which local log file/folder it came from.',
};

const columnLabels: Record<string, string> = {
  date: 'Date',
  provider: 'Provider',
  model: 'Model',
  workspace: 'Workspace',
  category: 'Category',
  turns: 'Turns',
  tokens: 'Tokens',
  tokensPerTurn: 'Tokens / turn',
  apiProxy: 'Est. cost',
  source: 'Source',
};

const renderColumnHeader = (id: string) => () => (
  <span className="column-header-label">
    {columnLabels[id]}
    {columnTooltips[id] ? (
      <InfoTip label={`About ${columnLabels[id]}`}>{columnTooltips[id]}</InfoTip>
    ) : null}
  </span>
);

const buildUsageColumns = (general: GeneralPreferences): ColumnDef<UsageEvent>[] => [
  {
    accessorKey: 'date',
    cell: ({ row }) => formatDateLabel(row.original.date),
    header: renderColumnHeader('date'),
    id: 'date',
  },
  {
    accessorKey: 'provider',
    filterFn: 'equalsString',
    header: renderColumnHeader('provider'),
    id: 'provider',
  },
  {
    accessorKey: 'model',
    filterFn: 'equalsString',
    header: renderColumnHeader('model'),
    id: 'model',
  },
  {
    accessorKey: 'workspace',
    filterFn: 'equalsString',
    header: renderColumnHeader('workspace'),
    id: 'workspace',
  },
  {
    accessorKey: 'category',
    cell: ({ row }) => formatOption(row.original.category),
    filterFn: 'equalsString',
    header: renderColumnHeader('category'),
    id: 'category',
  },
  {
    accessorKey: 'turns',
    cell: ({ row }) => compactNumber(row.original.turns),
    header: renderColumnHeader('turns'),
    id: 'turns',
  },
  {
    accessorKey: 'tokens',
    cell: ({ row }) => compactNumber(row.original.tokens),
    header: renderColumnHeader('tokens'),
    id: 'tokens',
  },
  {
    accessorKey: 'tokensPerTurn',
    cell: ({ row }) => compactNumber(row.original.tokensPerTurn),
    header: renderColumnHeader('tokensPerTurn'),
    id: 'tokensPerTurn',
  },
  {
    accessorFn: (row) => row.costEstimateUsd,
    cell: ({ row }) => formatMoney(row.original.costEstimateUsd, general),
    header: renderColumnHeader('apiProxy'),
    id: 'apiProxy',
  },
  {
    accessorKey: 'source',
    filterFn: 'equalsString',
    header: renderColumnHeader('source'),
    id: 'source',
  },
];

const getFilterValue = (filters: ColumnFiltersState, id: string): string =>
  String(filters.find((filter) => filter.id === id)?.value ?? 'all');

const setSelectFilter = (
  filters: ColumnFiltersState,
  id: string,
  value: string
): ColumnFiltersState => {
  const next = filters.filter((filter) => filter.id !== id);
  if (value === 'all') return next;
  return [...next, { id, value }];
};

const DrilldownTable = ({
  events,
  general,
  onSettingsChange,
  settings,
}: {
  events: UsageEvent[];
  general: GeneralPreferences;
  onSettingsChange: (updater: SettingsUpdater) => void;
  settings: SettingsState;
}) => {
  const usageColumns = useMemo(() => buildUsageColumns(general), [general]);
  const [globalFilter, setGlobalFilter] = useState(settings.table.search);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ desc: true, id: 'date' }]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: settings.table.pageIndex,
    pageSize: settings.table.pageSize,
  });

  const providerOptions = useMemo(() => getOptions(events, 'provider'), [events]);
  const modelOptions = useMemo(() => getOptions(events, 'model'), [events]);
  const workspaceOptions = useMemo(() => getOptions(events, 'workspace'), [events]);
  const categoryOptions = useMemo(() => getOptions(events, 'category'), [events]);
  const sourceOptions = useMemo(() => getOptions(events, 'source'), [events]);

  const handlePaginationChange: OnChangeFn<PaginationState> = useCallback((updater) => {
    setPagination((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      onSettingsChange((settingsValue) => ({
        ...settingsValue,
        table: {
          ...settingsValue.table,
          pageIndex: next.pageIndex,
          pageSize: next.pageSize,
        },
      }));
      return next;
    });
  }, [onSettingsChange]);

  const handleColumnVisibilityChange: OnChangeFn<VisibilityState> = useCallback((updater) => {
    const current = settings.table.columnVisibility;
    const next = typeof updater === 'function' ? updater(current) : updater;
    onSettingsChange((settingsValue) => ({
      ...settingsValue,
      table: {
        ...settingsValue.table,
        columnVisibility: {
          ...settingsValue.table.columnVisibility,
          ...(next as Record<UsageColumnId, boolean>),
        },
      },
    }));
  }, [onSettingsChange, settings.table.columnVisibility]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns: usageColumns,
    data: events,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: handlePaginationChange,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      columnVisibility: settings.table.columnVisibility,
      globalFilter,
      pagination,
      sorting,
    },
  });

  const resetSignature = JSON.stringify({ columnFilters, eventCount: events.length, globalFilter });
  const previousResetSignature = useRef(resetSignature);

  useEffect(() => {
    if (previousResetSignature.current !== resetSignature) {
      table.setPageIndex(0);
      previousResetSignature.current = resetSignature;
    }
  }, [resetSignature, table]);

  const exportRows = table.getSortedRowModel().rows.map((row) => row.original);
  const handleExport = (format: ExportFormat) => {
    downloadArtifact(exportUsageRows(exportRows, format));
  };

  return (
    <section className="panel drilldown-panel">
      <div className="panel-heading table-heading">
        <div className="panel-icon"><DatabaseZap /></div>
        <div>
          <h2>Drilldown rows</h2>
          <p>Paginated, searchable, filterable aggregate rows behind every chart.</p>
        </div>
      </div>
      <div className="table-toolbar" aria-label="Drilldown table controls">
        <label className="search-control">
          <Search />
          <input
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Search rows"
            value={String(globalFilter ?? '')}
          />
        </label>
        <SelectControl
          label="Provider"
          onChange={(value) => setColumnFilters((current) => setSelectFilter(current, 'provider', value))}
          options={['all', ...providerOptions]}
          value={getFilterValue(columnFilters, 'provider')}
        />
        <SelectControl
          label="Model"
          onChange={(value) => setColumnFilters((current) => setSelectFilter(current, 'model', value))}
          options={['all', ...modelOptions]}
          value={getFilterValue(columnFilters, 'model')}
        />
        <SelectControl
          label="Workspace"
          onChange={(value) => setColumnFilters((current) => setSelectFilter(current, 'workspace', value))}
          options={['all', ...workspaceOptions]}
          value={getFilterValue(columnFilters, 'workspace')}
        />
        <SelectControl
          label="Category"
          onChange={(value) => setColumnFilters((current) => setSelectFilter(current, 'category', value))}
          options={['all', ...categoryOptions]}
          value={getFilterValue(columnFilters, 'category')}
        />
        <SelectControl
          label="Source"
          onChange={(value) => setColumnFilters((current) => setSelectFilter(current, 'source', value))}
          options={['all', ...sourceOptions]}
          value={getFilterValue(columnFilters, 'source')}
        />
        <details className="columns-menu">
          <summary>
            <Columns3 />
            Columns
          </summary>
          <div>
            {table.getAllLeafColumns().map((column) => (
              <label key={column.id}>
                <input
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                  type="checkbox"
                />
                {columnLabels[column.id] ?? column.id}
              </label>
            ))}
          </div>
        </details>
        <div className="export-actions">
          <button className="toolbar-button primary" onClick={() => handleExport(settings.table.exportFormat)} type="button">
            <Download />
            Export {settings.table.exportFormat.toUpperCase()}
          </button>
          <button className="toolbar-button" onClick={() => handleExport(settings.table.exportFormat === 'csv' ? 'json' : 'csv')} type="button">
            {settings.table.exportFormat === 'csv' ? 'JSON' : 'CSV'}
          </button>
        </div>
      </div>
      <div className="analytics-table-wrap">
        <table className="analytics-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : (
                      <button
                        className={header.column.getCanSort() ? 'sort-header' : 'sort-header static'}
                        disabled={!header.column.getCanSort()}
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span>{header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}</span>
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className="table-empty" colSpan={table.getVisibleLeafColumns().length}>
                  No rows match the current search and filters.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination-bar">
        <span>
          {compactNumber(table.getFilteredRowModel().rows.length)} rows / page {pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
        </span>
        <div>
          <button disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} type="button">
            <ChevronLeft />
            Previous
          </button>
          <button disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} type="button">
            Next
            <ChevronRight />
          </button>
          <label>
            Rows
            <select
              onChange={(event) => table.setPageSize(Number(event.target.value))}
              value={pagination.pageSize}
            >
              {[10, 25, 50, 100].map((pageSize) => (
                <option key={pageSize} value={pageSize}>{pageSize}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
};

type SettingsSection =
  | 'about'
  | 'costs'
  | 'data'
  | 'extensions'
  | 'general'
  | 'models'
  | 'privacy'
  | 'table';

type SettingsSectionGroup = {
  items: Array<{ icon: typeof Settings; id: SettingsSection; label: string }>;
  label: string;
};

const settingsSectionGroups: SettingsSectionGroup[] = [
  {
    label: 'App',
    items: [
      { icon: Settings, id: 'general', label: 'General' },
      { icon: WalletCards, id: 'costs', label: 'Cost Limits' },
      { icon: Bot, id: 'models', label: 'Models & Routing' },
    ],
  },
  {
    label: 'Data',
    items: [
      { icon: PlugZap, id: 'data', label: 'Data Sources' },
      { icon: Columns3, id: 'table', label: 'Table & Export' },
    ],
  },
  {
    label: 'Extras',
    items: [
      { icon: Puzzle, id: 'extensions', label: 'Extensions' },
      { icon: LockKeyhole, id: 'privacy', label: 'Privacy' },
      { icon: Info, id: 'about', label: 'About' },
    ],
  },
];

const allSettingsSections = settingsSectionGroups.flatMap((group) => group.items);

const REPO_URL = 'https://github.com/gusmagnago/ai-ops-dashboard';
const docsLink = (anchor: string) => `${REPO_URL}#${anchor}`;

const SettingsModal = ({
  activeCategory,
  activeModel,
  activeProvider,
  invoiceCount,
  onClose,
  onSettingsChange,
  open,
  payload,
  settings,
}: {
  activeCategory: TaskCategory | 'all';
  activeModel: string;
  activeProvider: Provider | 'all';
  invoiceCount: number;
  onClose: () => void;
  onSettingsChange: (updater: SettingsUpdater) => void;
  open: boolean;
  payload: UsagePayload;
  settings: SettingsState;
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const recommendedExtensions = getRecommendedExtensions(
    activeModel !== 'all' ? activeModel : activeProvider,
    activeCategory
  ).slice(0, 6);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute('disabled'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-modal"
        ref={dialogRef}
        role="dialog"
      >
        <aside className="settings-sidebar">
          <div className="settings-title-block">
            <strong id="settings-title">Settings</strong>
            <span>⌘, to open · esc to close</span>
          </div>
          <nav aria-label="Settings sections">
            {settingsSectionGroups.map((group) => (
              <div className="settings-nav-group" key={group.label}>
                <div className="settings-nav-label">{group.label}</div>
                {group.items.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      className={activeSection === section.id ? 'active' : ''}
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      type="button"
                    >
                      <Icon />
                      {section.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <section className="settings-content">
          <div className="settings-window-toolbar">
            <div>
              <span>AI Ops Dashboard</span>
              <strong>{allSettingsSections.find((section) => section.id === activeSection)?.label}</strong>
            </div>
            <button aria-label="Close settings" className="icon-button" onClick={onClose} ref={closeButtonRef} type="button">
              <X />
            </button>
          </div>

          {activeSection === 'general' && (
            <GeneralSection onSettingsChange={onSettingsChange} settings={settings} />
          )}
          {activeSection === 'costs' && (
            <CostLimitsSection onSettingsChange={onSettingsChange} settings={settings} />
          )}
          {activeSection === 'models' && (
            <ModelsSection onSettingsChange={onSettingsChange} settings={settings} />
          )}
          {activeSection === 'data' && (
            <DataSourcesSection invoiceCount={invoiceCount} payload={payload} />
          )}
          {activeSection === 'table' && (
            <TableSection onSettingsChange={onSettingsChange} settings={settings} />
          )}
          {activeSection === 'extensions' && (
            <ExtensionsSection recommended={recommendedExtensions} />
          )}
          {activeSection === 'privacy' && <PrivacySection />}
          {activeSection === 'about' && <AboutSection payload={payload} />}
        </section>
      </div>
    </div>
  );
};

const updateBudget = (
  onSettingsChange: (updater: SettingsUpdater) => void,
  provider: Provider,
  patch: Partial<PlanBudget>
) => {
  onSettingsChange((current) => ({
    ...current,
    planBudgets: current.planBudgets.map((budget) =>
      budget.provider === provider ? { ...budget, ...patch } : budget
    ),
  }));
};

const updateRoutingPreference = (
  onSettingsChange: (updater: SettingsUpdater) => void,
  category: TaskCategory,
  patch: Partial<SettingsState['routingPreferences'][TaskCategory]>
) => {
  onSettingsChange((current) => ({
    ...current,
    routingPreferences: {
      ...current.routingPreferences,
      [category]: {
        ...current.routingPreferences[category],
        ...patch,
      },
    },
  }));
};

const Section = ({
  children,
  help,
  title,
}: {
  children: ReactNode;
  help: ReactNode;
  title: string;
}) => (
  <div className="settings-section">
    <h2>{title}</h2>
    <p className="settings-help">{help}</p>
    {children}
  </div>
);

const Row = ({
  children,
  label,
  sublabel,
}: {
  children: ReactNode;
  label: string;
  sublabel?: string;
}) => (
  <div className="settings-row">
    <div className="settings-row-label">
      <strong>{label}</strong>
      {sublabel && <span>{sublabel}</span>}
    </div>
    <div className="settings-row-control">{children}</div>
  </div>
);

const Segmented = <T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (next: T) => void;
  options: Array<{ icon?: ReactNode; label: string; value: T }>;
  value: T;
}) => (
  <div className="v4-segmented" role="group" aria-label={ariaLabel}>
    {options.map((option) => (
      <button
        className={value === option.value ? 'active' : ''}
        key={option.value}
        onClick={() => onChange(option.value)}
        type="button"
      >
        {option.icon}
        <span>{option.label}</span>
      </button>
    ))}
  </div>
);

const DocLink = ({ anchor, children }: { anchor: string; children: ReactNode }) => (
  <a className="settings-link" href={docsLink(anchor)} rel="noreferrer" target="_blank">
    {children}
    <ExternalLink aria-hidden="true" />
  </a>
);

const GeneralSection = ({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (updater: SettingsUpdater) => void;
  settings: SettingsState;
}) => {
  const { general } = settings;
  const updateGeneral = (patch: Partial<GeneralPreferences>) =>
    onSettingsChange((current) => ({ ...current, general: { ...current.general, ...patch } }));

  return (
    <Section
      title="General"
      help={<>Display defaults for this browser. Settings live in localStorage. Nothing leaves your machine.</>}
    >
      <div className="settings-group">
        <Row label="Appearance" sublabel="theme">
          <Segmented<ThemeMode>
            ariaLabel="Theme"
            onChange={(theme) => onSettingsChange((current) => ({ ...current, theme }))}
            options={[
              { icon: <Monitor />, label: 'System', value: 'system' },
              { icon: <Sun />, label: 'Light', value: 'light' },
              { icon: <Moon />, label: 'Dark', value: 'dark' },
            ]}
            value={settings.theme}
          />
        </Row>
        <Row label="Accent color" sublabel="links · primary buttons · charts">
          <AccentColorControl
            onChange={(accentColor) => updateGeneral({ accentColor })}
            value={general.accentColor}
          />
        </Row>
        <Row label="Currency" sublabel="display in">
          <select
            aria-label="Display currency"
            onChange={(event) => updateGeneral({ currency: event.target.value as Currency })}
            value={general.currency}
          >
            {currencyOptions.map((currency) => (
              <option key={currency} value={currency}>
                {formatCurrencyOption(currency)}
              </option>
            ))}
          </select>
          <span className="settings-help-inline">All amounts convert to this currency.</span>
        </Row>
        {general.currency !== 'USD' && (
          <Row label="FX rate" sublabel={`${general.currency} per 1 USD`}>
            <input
              aria-label={`Exchange rate for ${general.currency}`}
              onChange={(event) =>
                updateGeneral({
                  fxRatePerUsd: {
                    ...general.fxRatePerUsd,
                    [general.currency as Exclude<Currency, 'USD'>]: Number(event.target.value),
                  },
                })
              }
              step="0.001"
              type="number"
              value={general.fxRatePerUsd[general.currency as Exclude<Currency, 'USD'>] ?? 1}
            />
            <span className="settings-help-inline">Manual rate. No network calls.</span>
          </Row>
        )}
        <Row label="Default view" sublabel="tab · range · grain">
          <select
            aria-label="Default tab"
            onChange={(event) =>
              onSettingsChange((current) => ({
                ...current,
                defaultFilters: { ...current.defaultFilters, tab: event.target.value as TabId },
              }))
            }
            value={settings.defaultFilters.tab}
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>{formatOption(tab.id)}</option>
            ))}
          </select>
          <select
            aria-label="Default range"
            onChange={(event) =>
              onSettingsChange((current) => ({
                ...current,
                defaultFilters: { ...current.defaultFilters, range: event.target.value as DateRange },
              }))
            }
            value={settings.defaultFilters.range}
          >
            {(['7d', '30d', '90d', 'all'] as const).map((range) => (
              <option key={range} value={range}>{formatOption(range)}</option>
            ))}
          </select>
          <select
            aria-label="Default grain"
            onChange={(event) =>
              onSettingsChange((current) => ({
                ...current,
                defaultFilters: { ...current.defaultFilters, grain: event.target.value as Grain },
              }))
            }
            value={settings.defaultFilters.grain}
          >
            {(['day', 'week', 'month'] as const).map((grain) => (
              <option key={grain} value={grain}>{formatOption(grain)}</option>
            ))}
          </select>
        </Row>
        <Row label="Week starts on" sublabel="weekStart">
          <Segmented<WeekStart>
            ariaLabel="Week starts on"
            onChange={(weekStart) => updateGeneral({ weekStart })}
            options={[
              { label: 'Monday', value: 'monday' },
              { label: 'Sunday', value: 'sunday' },
            ]}
            value={general.weekStart}
          />
        </Row>
      </div>
    </Section>
  );
};

const AccentColorControl = ({
  onChange,
  value,
}: {
  onChange: (hex: string) => void;
  value: string;
}) => (
  <div className="accent-control">
    <label className="accent-swatch">
      <input
        aria-label="Custom accent color"
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
      <span aria-hidden="true" className="accent-chip" style={{ background: value }} />
    </label>
    <code className="settings-mono">{value.toLowerCase()}</code>
    <div className="accent-presets" role="group" aria-label="Color presets">
      {accentPresets.map((preset) => (
        <button
          aria-label={preset}
          className={value.toLowerCase() === preset.toLowerCase() ? 'preset active' : 'preset'}
          key={preset}
          onClick={() => onChange(preset)}
          style={{ background: preset }}
          title={preset}
          type="button"
        />
      ))}
    </div>
    <span className="settings-help-inline">Pick a custom color or tap a preset. Updates instantly.</span>
  </div>
);

const CostLimitsSection = ({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (updater: SettingsUpdater) => void;
  settings: SettingsState;
}) => (
  <Section
    title="Cost Limits"
    help={
      <>
        The dashboard does not enforce these limits — your provider does. These numbers let us warn you
        when your usage approaches the value of your subscription, so you don't accidentally start
        spending on paid API credits on top.{' '}
        <DocLink anchor="features">Docs: plan-pressure proxy</DocLink>
      </>
    }
  >
    <div className="settings-card-grid">
      {settings.planBudgets.map((budget) => (
        <CostLimitCard
          budget={budget}
          general={settings.general}
          key={budget.provider}
          onSettingsChange={onSettingsChange}
        />
      ))}
    </div>
    <div className="settings-callout">
      <ShieldAlert aria-hidden="true" />
      <div>
        <strong>API-equivalent cost is a proxy, not your invoice.</strong>
        <p>
          If you're on a subscription, the dashboard estimates what the same usage would cost via the
          public API. Actual invoicing happens on the provider's side.{' '}
          <DocLink anchor="notes">Docs: how the proxy is calculated</DocLink>
        </p>
      </div>
    </div>
  </Section>
);

const CostLimitCard = ({
  budget,
  general,
  onSettingsChange,
}: {
  budget: PlanBudget;
  general: GeneralPreferences;
  onSettingsChange: (updater: SettingsUpdater) => void;
}) => {
  const matchingPlans = prebuiltPlans.filter((plan) => plan.provider === budget.provider);
  const selectedPlanName = matchingPlans.find(
    (plan) => plan.planName === budget.planName && plan.monthlyPriceUsd === budget.monthlyPriceUsd
  )?.name ?? '__custom__';
  const dual = formatMoneyDual(budget.monthlyPriceUsd, general);
  const cadenceOptions: PlanBudget['resetCadence'][] = ['5h-window', 'weekly', 'monthly'];

  const onPickPrebuilt = (planName: string) => {
    if (planName === '__custom__') return;
    const next = matchingPlans.find((plan) => plan.name === planName);
    if (!next) return;
    updateBudget(onSettingsChange, budget.provider, {
      monthlyPriceUsd: next.monthlyPriceUsd,
      planName: next.planName,
      resetCadence: next.resetCadence,
    });
  };

  return (
    <article className="cost-card">
      <div className="cost-card-head">
        <strong>{budget.provider}</strong>
        <span className="cost-card-badge">{formatOption(budget.resetCadence)} reset</span>
      </div>
      <div className="cost-card-price">
        {dual.converted}
        <small>{dual.original}</small>
      </div>
      <div className="cost-card-field">
        <label>
          Plan
          <span className="settings-help-inline">Pre-built or custom.</span>
        </label>
        <select aria-label="Plan" onChange={(event) => onPickPrebuilt(event.target.value)} value={selectedPlanName}>
          {matchingPlans.map((plan) => (
            <option key={plan.name} value={plan.name}>{plan.name}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
      </div>
      {selectedPlanName === '__custom__' && (
        <>
          <div className="cost-card-field">
            <label>Plan name</label>
            <input
              onChange={(event) => updateBudget(onSettingsChange, budget.provider, { planName: event.target.value })}
              value={budget.planName}
            />
          </div>
          <div className="cost-card-field">
            <label>Monthly price (USD)</label>
            <input
              min="0"
              onChange={(event) => updateBudget(onSettingsChange, budget.provider, { monthlyPriceUsd: Number(event.target.value) })}
              type="number"
              value={budget.monthlyPriceUsd}
            />
          </div>
          <div className="cost-card-field">
            <label>Reset cadence</label>
            <select
              onChange={(event) => updateBudget(onSettingsChange, budget.provider, { resetCadence: event.target.value as PlanBudget['resetCadence'] })}
              value={budget.resetCadence}
            >
              {cadenceOptions.map((option) => (
                <option key={option} value={option}>{formatOption(option)}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="cost-card-field">
        <label>
          Warn at {budget.warnAtPercent}% of plan value
          <span className="settings-help-inline">Shown as a yellow plan tile.</span>
        </label>
        <input
          aria-label="Warn at percent"
          max="100"
          min="1"
          onChange={(event) => updateBudget(onSettingsChange, budget.provider, { warnAtPercent: Number(event.target.value) })}
          type="number"
          value={budget.warnAtPercent}
        />
      </div>
      <div className="cost-card-field">
        <label>
          Strict Plan Mode
          <span className="settings-help-inline">Adds a hard warning at 100%.</span>
        </label>
        <input
          checked={budget.strictPlanMode}
          onChange={(event) => updateBudget(onSettingsChange, budget.provider, { strictPlanMode: event.target.checked })}
          type="checkbox"
        />
      </div>
      <div className="cost-card-field">
        <label>
          Single-day burn ceiling
          <span className="settings-help-inline">Warn if any day proxies more than this.</span>
        </label>
        <div className="ceiling-input">
          <input
            min="0"
            onChange={(event) => updateBudget(onSettingsChange, budget.provider, { dailyCeilingUsd: Number(event.target.value) })}
            step="1"
            type="number"
            value={budget.dailyCeilingUsd}
          />
          <span className="settings-help-inline">{formatMoney(budget.dailyCeilingUsd, general)}/day</span>
        </div>
      </div>
    </article>
  );
};

const ModelsSection = ({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (updater: SettingsUpdater) => void;
  settings: SettingsState;
}) => (
  <Section
    title="Models & Routing"
    help={
      <>
        Model profiles describe each agent's strengths so the Router can recommend one for a new task.
        Routing preferences are the defaults the Router uses when there's no observed history yet.
      </>
    }
  >
    <div className="settings-group">
      {taskCategories.map((category) => {
        const pref = settings.routingPreferences[category];
        return (
          <Row key={category} label={formatOption(category)} sublabel="category">
            <select
              aria-label={`${category} primary`}
              onChange={(event) => updateRoutingPreference(onSettingsChange, category, { primaryAgentId: event.target.value })}
              value={pref.primaryAgentId}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>Primary: {agent.name}</option>
              ))}
            </select>
            <select
              aria-label={`${category} fallback`}
              onChange={(event) => updateRoutingPreference(onSettingsChange, category, { fallbackAgentId: event.target.value })}
              value={pref.fallbackAgentId}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>Fallback: {agent.name}</option>
              ))}
            </select>
          </Row>
        );
      })}
      <Row label="Manage profiles" sublabel="add or edit models">
        <button className="toolbar-button" disabled type="button">Add model profile…</button>
        <span className="settings-help-inline">{settings.modelProfiles.length} profiles defined. Editor lands in v4.1.</span>
      </Row>
    </div>
  </Section>
);

const DataSourcesSection = ({ invoiceCount, payload }: { invoiceCount: number; payload: UsagePayload }) => {
  const ingestedAt = formatDateLabel(payload.generatedAt.slice(0, 10));
  return (
    <Section
      title="Data Sources"
      help={
        <>
          Where the dashboard reads from. All sources are local files on this machine. To reload data, run the
          command in your terminal: usage refreshes on its own, the rest after a page reload. No credentials are
          ever entered here.
        </>
      }
    >
      <div className="settings-group">
        {payload.sources.map((source) => (
          <div className="data-source-row" key={source.path}>
            <span className={`source-status ${source.available ? 'ok' : 'warn'}`} />
            <div>
              <strong>{source.label}</strong>
              <code className="settings-mono">{source.path}</code>
            </div>
            <span className="settings-mono settings-help-inline">last ingested {ingestedAt}</span>
            <code className="settings-mono">npm run ingest</code>
          </div>
        ))}
        <div className="data-source-row">
          <span className="source-status warn" />
          <div>
            <strong>Finance (CSV)</strong>
            <code className="settings-mono">public/data/finance.json</code>
          </div>
          <span className="settings-mono settings-help-inline">sample data in use</span>
          <code className="settings-mono">npm run ingest:finance &lt;csv&gt;</code>
        </div>
        <div className="data-source-row">
          <span className="source-status warn" />
          <div>
            <strong>Workstreams</strong>
            <code className="settings-mono">public/data/workstreams.json</code>
          </div>
          <span className="settings-mono settings-help-inline">sample data in use</span>
          <DocLink anchor="workstreams-json">Docs: workstreams</DocLink>
        </div>
        <div className="data-source-row">
          <span className={`source-status ${invoiceCount > 0 ? 'ok' : 'warn'}`} />
          <div>
            <strong>Billing receipts</strong>
            <code className="settings-mono">public/data/invoices.json</code>
          </div>
          <span className="settings-mono settings-help-inline">
            {invoiceCount > 0 ? `${invoiceCount} receipts` : 'none yet · plan defaults in use'}
          </span>
          <code className="settings-mono">npm run ingest:invoices -- --csv &lt;path&gt;</code>
        </div>
      </div>
    </Section>
  );
};

const TableSection = ({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (updater: SettingsUpdater) => void;
  settings: SettingsState;
}) => (
  <Section title="Table & Export" help={<>Defaults for the drilldown table at the bottom of every tab.</>}>
    <div className="settings-group">
      <Row label="Page size" sublabel="rows per page">
        <Segmented<string>
          ariaLabel="Page size"
          onChange={(value) =>
            onSettingsChange((current) => ({
              ...current,
              table: { ...current.table, pageSize: Number(value) },
            }))
          }
          options={[
            { label: '10', value: '10' },
            { label: '25', value: '25' },
            { label: '50', value: '50' },
            { label: '100', value: '100' },
          ]}
          value={String(settings.table.pageSize)}
        />
      </Row>
      <Row label="Default export" sublabel="csv or json">
        <Segmented<ExportFormat>
          ariaLabel="Default export format"
          onChange={(value) =>
            onSettingsChange((current) => ({
              ...current,
              table: { ...current.table, exportFormat: value },
            }))
          }
          options={[
            { label: 'CSV', value: 'csv' },
            { label: 'JSON', value: 'json' },
          ]}
          value={settings.table.exportFormat}
        />
      </Row>
      <Row label="Visible columns" sublabel="toggle each column">
        <div className="column-list">
          {usageColumnIds.map((column) => (
            <label className="toggle-line" key={column}>
              <input
                checked={settings.table.columnVisibility[column]}
                onChange={(event) =>
                  onSettingsChange((current) => ({
                    ...current,
                    table: {
                      ...current.table,
                      columnVisibility: {
                        ...current.table.columnVisibility,
                        [column]: event.target.checked,
                      },
                    },
                  }))
                }
                type="checkbox"
              />
              {formatOption(column)}
            </label>
          ))}
        </div>
      </Row>
      <Row label="Reset table state" sublabel="clears search · sort · page">
        <button
          className="toolbar-button"
          onClick={() =>
            onSettingsChange((current) => ({
              ...current,
              table: { ...current.table, pageIndex: 0, search: '' },
            }))
          }
          type="button"
        >
          <RefreshCw />
          Reset table
        </button>
      </Row>
    </div>
  </Section>
);

const ExtensionsSection = ({ recommended }: { recommended: ReturnType<typeof getRecommendedExtensions> }) => {
  const [activeTab, setActiveTab] = useState<'installer' | 'installed' | 'recommendations'>('installer');
  return (
    <Section
      title="Extensions"
      help={
        <>
          Install a Claude Code skill from a URL, then optionally generate equivalent prompts for Codex,
          ChatGPT, and Cursor that you paste manually. Cross-tool sync is best-effort — there is no shared format.{' '}
          <DocLink anchor="roadmap">Docs: extensions roadmap</DocLink>
        </>
      }
    >
      <div className="settings-group">
        <div className="ext-tabs">
          {(['installer', 'installed', 'recommendations'] as const).map((tab) => (
            <button
              className={activeTab === tab ? 'ext-tab active' : 'ext-tab'}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab === 'installer' && 'Installer'}
              {tab === 'installed' && 'Installed (0)'}
              {tab === 'recommendations' && `Recommendations (${recommended.length})`}
            </button>
          ))}
        </div>
        {activeTab === 'installer' && (
          <div className="ext-install-row">
            <input placeholder="Paste a skill URL or @author/skill-name" type="text" disabled />
            <button className="toolbar-button" disabled type="button">Preview</button>
            <button className="toolbar-button primary" disabled type="button">Install for Claude</button>
            <div className="ext-install-hint settings-mono">
              Coming in v4.1 · target: <code>~/.claude/skills/</code>
            </div>
          </div>
        )}
        {activeTab === 'installed' && (
          <p className="settings-section-empty">No skills installed by this dashboard yet.</p>
        )}
        {activeTab === 'recommendations' && (
          <div className="ext-recommendations">
            {recommended.map((item) => (
              <article className="settings-card" key={item.id}>
                <span>{item.category} · {formatOption(item.installState)}</span>
                <h3>{item.name}</h3>
                <p>{item.notes}</p>
                <code className="settings-mono">{item.source}</code>
              </article>
            ))}
            {recommended.length === 0 && (
              <p className="settings-section-empty">No recommendations for the current filters.</p>
            )}
          </div>
        )}
      </div>
    </Section>
  );
};

const PrivacySection = () => {
  const wipeSettings = () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('Wipe local settings? This clears your preferences only. Usage and finance files stay.')) return;
    window.localStorage.removeItem('ai-ops-settings-v3');
    window.location.reload();
  };

  return (
    <Section title="Privacy" help={<>The dashboard is designed to be local-only and shareable without leaking your work.</>}>
      <div className="settings-callout">
        <LockKeyhole aria-hidden="true" />
        <div>
          <strong>This app runs locally. No server. No telemetry. No analytics.</strong>
          <p>The only network call ever made is "Refresh FX rate" in General, and only when you click it. Everything else lives on this machine.</p>
        </div>
      </div>
      <div className="settings-group">
        <Row label="What is stored" sublabel="aggregates only">
          <span className="settings-help-inline">date · provider · model · workspace · token counts · turns · API-equivalent proxy</span>
        </Row>
        <Row label="What is ignored" sublabel="never written">
          <span className="settings-help-inline">prompts · outputs · transcripts · API keys · cookies · billing tokens · Slack secrets</span>
        </Row>
        <Row label="Where data lives" sublabel="files on disk">
          <code className="settings-mono">public/data/usage.json · finance.json · workstreams.json</code>
        </Row>
        <Row label="Reset" sublabel="danger zone">
          <button className="toolbar-button danger" onClick={wipeSettings} type="button">
            <Trash2 />
            Wipe local settings
          </button>
          <span className="settings-help-inline">Clears localStorage. Leaves your usage/finance files alone.</span>
        </Row>
      </div>
    </Section>
  );
};

const AboutSection = ({ payload }: { payload: UsagePayload }) => (
  <Section
    title="About"
    help={<>Local console for Claude Code + Codex users. Open source under MIT.</>}
  >
    <div className="settings-group">
      <div className="about-tiles">
        <div className="about-tile"><span>version</span><strong>0.1.0</strong></div>
        <div className="about-tile"><span>data generated</span><strong>{formatDateLabel(payload.generatedAt.slice(0, 10))}</strong></div>
        <div className="about-tile"><span>rows</span><strong>{compactNumber(payload.sessions.length)}</strong></div>
      </div>
      <Row label="Links" sublabel="external">
        <a className="settings-link" href={REPO_URL} rel="noreferrer" target="_blank">
          github.com/gusmagnago/ai-ops-dashboard
          <ExternalLink aria-hidden="true" />
        </a>
        <a className="settings-link" href={`${REPO_URL}/issues`} rel="noreferrer" target="_blank">
          Report issue
          <ExternalLink aria-hidden="true" />
        </a>
        <a className="settings-link" href={`${REPO_URL}/blob/main/LICENSE`} rel="noreferrer" target="_blank">
          MIT License
          <ExternalLink aria-hidden="true" />
        </a>
        <DocLink anchor="readme">Docs</DocLink>
      </Row>
      <Row label="Acknowledgements" sublabel="built with">
        {['React', 'Vite', 'TanStack Table', 'Recharts', 'Lucide'].map((name) => (
          <DocLink anchor="tech" key={name}>{name}</DocLink>
        ))}
      </Row>
      <Row label="Pricing references" sublabel="provider docs (external)">
        {payload.pricing.links.map((link) => (
          <a className="settings-link" href={link} key={link} rel="noreferrer" target="_blank">
            {link}
            <ExternalLink aria-hidden="true" />
          </a>
        ))}
      </Row>
    </div>
  </Section>
);

export default App;

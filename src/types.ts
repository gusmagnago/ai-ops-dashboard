export type Provider = 'Claude' | 'Codex';

export type TabId =
  | 'daily'
  | 'plan'
  | 'router'
  | 'productivity'
  | 'finance'
  | 'sources';

export type DateRange = '7d' | '30d' | '90d' | 'all';

export type Grain = 'day' | 'week' | 'month';

export type TaskCategory =
  | 'automation'
  | 'deck'
  | 'engineering'
  | 'finance'
  | 'notes'
  | 'strategy'
  | 'general';

export type FilterState = {
  category: TaskCategory | 'all';
  grain: Grain;
  model: string;
  provider: Provider | 'all';
  range: DateRange;
  source: string;
  tab: TabId;
  workspace: string;
};

export type ThemeMode = 'dark' | 'light' | 'system';

export type Currency = 'BRL' | 'EUR' | 'GBP' | 'USD';

export type WeekStart = 'monday' | 'sunday';

export type GeneralPreferences = {
  accentColor: string;
  currency: Currency;
  fxRatePerUsd: Record<Exclude<Currency, 'USD'>, number>;
  weekStart: WeekStart;
};

export type ExportFormat = 'csv' | 'json';

export type UsageColumnId =
  | 'apiProxy'
  | 'category'
  | 'date'
  | 'model'
  | 'provider'
  | 'source'
  | 'tokens'
  | 'tokensPerTurn'
  | 'turns'
  | 'workspace';

export type TableState = {
  columnVisibility: Record<UsageColumnId, boolean>;
  exportFormat: ExportFormat;
  pageIndex: number;
  pageSize: number;
  search: string;
};

export type SettingsState = {
  defaultFilters: FilterState;
  general: GeneralPreferences;
  modelProfiles: ModelProfile[];
  planBudgets: PlanBudget[];
  routingPreferences: Record<TaskCategory, RoutingPreference>;
  table: TableState;
  theme: ThemeMode;
  version: 3;
};

export type UsageSession = {
  cacheCreationInputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
  date: string;
  inputTokens: number;
  interactions: number;
  model: string;
  outputTokens: number;
  provider: Provider;
  reasoningOutputTokens?: number;
  totalTokens: number;
  workspace: string;
};

export type UsageEvent = {
  category: TaskCategory;
  costEstimateUsd: number;
  date: string;
  inputTokens: number;
  model: string;
  outputTokens: number;
  provider: Provider;
  source: string;
  tokens: number;
  tokensPerTurn: number;
  turns: number;
  workspace: string;
};

export type RateLimitWindow = {
  id: string;
  label: string;
  resetsAt: string | null;
  usedPercent: number;
  windowMinutes: number;
};

export type ProviderPlanStatus = {
  capturedAt: string;
  planType: string;
  provider: Provider;
  windows: RateLimitWindow[];
};

export type UsagePayload = {
  generatedAt: string;
  // Which file the payload came from. Set by the loader at runtime, never
  // written to disk: 'local' = usage.json from npm run ingest, 'sample' =
  // sample-usage.json or the built-in fallback.
  origin?: 'local' | 'sample';
  limits?: {
    claude?: ProviderPlanStatus;
    codex?: ProviderPlanStatus;
  };
  pricing: {
    lastVerified: string;
    links: string[];
    sourceNote: string;
  };
  sessions: UsageSession[];
  sources: Array<{
    available: boolean;
    label: string;
    path: string;
  }>;
};

export type SourceStatus = UsagePayload['sources'][number];

export type PlanBudget = {
  dailyCeilingUsd: number;
  monthlyPriceUsd: number;
  planName: string;
  provider: Provider;
  resetCadence: '5h-window' | 'weekly' | 'monthly';
  strictPlanMode: boolean;
  warnAtPercent: number;
};

export type PrebuiltPlan = {
  monthlyPriceUsd: number;
  name: string;
  planName: string;
  provider: Provider;
  resetCadence: PlanBudget['resetCadence'];
};

export type ModelProfile = {
  avoidFor: string[];
  bestFor: string[];
  costTier: 'budget' | 'standard' | 'premium';
  model: string;
  provider: Provider;
  recommendedSkills: string[];
  role: string;
};

export type RoutingPreference = {
  fallbackAgentId: string;
  primaryAgentId: string;
};

export type PlanPressure = {
  budget: PlanBudget;
  costEstimateUsd: number;
  daysTracked: number;
  pressurePercent: number;
  status: 'calm' | 'watch' | 'over';
  tokens: number;
  turns: number;
};

export type Invoice = {
  amountSubtotal: number;
  amountTaxes: number;
  amountTotal: number;
  currency: string;
  date: string;
  description: string;
  invoiceNumber?: string;
  planName: string;
  provider: Provider;
  receiptNumber?: string;
  source: 'gmail' | 'csv' | 'manual';
  sourceRef?: string;
};

export type InvoicesPayload = {
  generatedAt: string;
  invoices: Invoice[];
  sources: Array<{
    kind: 'gmail' | 'csv' | 'manual';
    label: string;
    lastSync?: string;
  }>;
};

export type ConnectorId = 'gmail' | 'drive' | 'resend';

export type ConnectorState = {
  id: ConnectorId;
  enabled: boolean;
  account?: string;
  notes?: string;
  lastSync?: string;
  config: Record<string, string>;
};

export type FinanceEntry = {
  actualEur: number;
  budgetEur: number;
  category: 'infrastructure' | 'tooling' | 'incorporation' | 'variable';
  invoiceLink?: string;
  invoiceStatus: 'baseline' | 'missing' | 'received' | 'watch';
  month: string;
  nextAction: string;
  service: string;
  source: string;
  volatility: 'fixed' | 'medium' | 'high';
};

export type WorkItem = {
  label: string;
  priority: 'urgent' | 'high' | 'normal' | 'life';
  status: 'done' | 'next' | 'open';
};

export type Workstream = {
  items: WorkItem[];
  name: string;
  source: string;
  summary: string;
};

export type ExtensionCatalogItem = {
  category: 'automation' | 'code' | 'data' | 'design' | 'finance' | 'growth' | 'knowledge';
  id: string;
  installState: 'available' | 'installed' | 'manual';
  name: string;
  notes: string;
  providerFit: Array<Provider | 'Any'>;
  source: string;
  taskFit: Array<TaskCategory | 'all'>;
};

export type AgentCandidate = {
  bestFor: string[];
  caveat: string;
  costScore: number;
  costTier: 'budget' | 'standard' | 'premium';
  id: string;
  latencyScore: number;
  modelPatterns: string[];
  name: string;
  powerScore: number;
  provider: Provider;
  vibe: string;
};

export type AgentEconomics = {
  agentId: string;
  agentName: string;
  costPerTurn: number | null;
  costTier: AgentCandidate['costTier'];
  observedCost: number;
  observedTurns: number;
  provider: Provider;
};

export type RoutingInsight = {
  bestValue: AgentEconomics | null;
  category: TaskCategory | 'all';
  confidence: 'high' | 'low' | 'medium';
  economics: AgentEconomics[];
  observedTotalCost: number;
  observedTurns: number;
  projectedTotalCost: number;
  savings: number;
};

export type ProductivityStats = {
  activeDays: number;
  avgSessionsPerActiveDay: number;
  longestDay: { cost: number; date: string; tokens: number; turns: number } | null;
  premiumTurnRatio: number;
  topWorkspaces: Array<{ cost: number; tokens: number; turns: number; workspace: string }>;
  totalSessions: number;
  totalTurns: number;
};

export type RoutingRecommendation = {
  actions: string[];
  confidence: number;
  fallback: AgentCandidate;
  primary: AgentCandidate;
  reasons: string[];
};

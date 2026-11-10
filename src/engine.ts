import type {
  AgentCandidate,
  AgentEconomics,
  DateRange,
  FilterState,
  FinanceEntry,
  Grain,
  Invoice,
  PlanBudget,
  PlanPressure,
  ProductivityStats,
  Provider,
  RoutingInsight,
  RoutingRecommendation,
  TaskCategory,
  UsageEvent,
  UsageSession,
} from './types';

export type UsagePoint = {
  claudeTokens: number;
  claudeTurns: number;
  codexTokens: number;
  codexTurns: number;
  costEstimateUsd: number;
  key: string;
  label: string;
  premiumTurns: number;
  tokensPerTurn: number;
  totalTokens: number;
  turns: number;
};

export const tabIds = ['daily', 'plan', 'router', 'productivity', 'finance', 'sources'] as const;
export const dateRanges = ['7d', '30d', '90d', 'all'] as const;
export const grains = ['day', 'week', 'month'] as const;

export const defaultFilters: FilterState = {
  category: 'all',
  grain: 'day',
  model: 'all',
  provider: 'all',
  range: '30d',
  source: 'all',
  tab: 'daily',
  workspace: 'all',
};

export const agents: AgentCandidate[] = [
  {
    bestFor: ['multi-file code', 'tests', 'repo surgery', 'terminal work', 'pull requests'],
    caveat: 'Use with clear repo scope and acceptance checks.',
    costScore: 74,
    costTier: 'premium',
    id: 'codex-frontier',
    latencyScore: 72,
    modelPatterns: ['gpt-5.2-codex', 'gpt-5.3-codex', 'gpt-5.5', 'gpt-5.4'],
    name: 'Codex Frontier',
    powerScore: 94,
    provider: 'Codex',
    vibe: 'Best for execution inside the codebase',
  },
  {
    bestFor: ['small code fixes', 'lint cleanup', 'typed transforms', 'repeatable refactors'],
    caveat: 'Escalate only when ambiguity or architecture grows.',
    costScore: 92,
    costTier: 'budget',
    id: 'codex-mini',
    latencyScore: 88,
    modelPatterns: ['codex-mini', 'gpt-5.1-codex-mini', 'gpt-5-mini', 'gpt-5.4-mini'],
    name: 'Codex Mini Route',
    powerScore: 72,
    provider: 'Codex',
    vibe: 'Cheap-first implementation loop',
  },
  {
    bestFor: ['strategy', 'writing', 'analysis', 'product narrative', 'note synthesis'],
    caveat: 'Keep the prompt bounded and bring the final decision back to the vault.',
    costScore: 70,
    costTier: 'standard',
    id: 'claude-sonnet',
    latencyScore: 80,
    modelPatterns: ['sonnet'],
    name: 'Claude Sonnet',
    powerScore: 88,
    provider: 'Claude',
    vibe: 'Best for synthesis and narrative judgment',
  },
  {
    bestFor: ['high-stakes reasoning', 'hard critique', 'architecture review', 'final decision memos'],
    caveat: 'Reserve for decisions where a premium pass changes the outcome.',
    costScore: 42,
    costTier: 'premium',
    id: 'claude-opus',
    latencyScore: 60,
    modelPatterns: ['opus'],
    name: 'Claude Opus',
    powerScore: 98,
    provider: 'Claude',
    vibe: 'Premium review chamber',
  },
  {
    bestFor: ['classification', 'tagging', 'summaries', 'routing', 'cheap triage'],
    caveat: 'Do not make it own complex implementation.',
    costScore: 98,
    costTier: 'budget',
    id: 'claude-haiku',
    latencyScore: 96,
    modelPatterns: ['haiku'],
    name: 'Claude Haiku',
    powerScore: 58,
    provider: 'Claude',
    vibe: 'Fast low-cost extraction path',
  },
];

const matchesAgent = (event: UsageEvent, agent: AgentCandidate): boolean =>
  agent.modelPatterns.some((pattern) => event.model.toLowerCase().includes(pattern.toLowerCase()));

export const computeAgentEconomics = (events: UsageEvent[]): AgentEconomics[] =>
  agents.map((agent) => {
    const matched = events.filter((event) => matchesAgent(event, agent));
    const observedCost = sum(matched.map((event) => event.costEstimateUsd));
    const observedTurns = sum(matched.map((event) => event.turns));
    return {
      agentId: agent.id,
      agentName: agent.name,
      costPerTurn: observedTurns > 0 ? observedCost / observedTurns : null,
      costTier: agent.costTier,
      observedCost: Number(observedCost.toFixed(4)),
      observedTurns,
      provider: agent.provider,
    };
  });

const taskCategoryHints: Record<TaskCategory, AgentCandidate['id'][]> = {
  automation: ['codex-mini', 'claude-haiku', 'codex-frontier'],
  deck: ['claude-sonnet', 'claude-haiku'],
  engineering: ['codex-frontier', 'codex-mini', 'claude-sonnet'],
  finance: ['claude-sonnet', 'claude-haiku', 'codex-mini'],
  general: ['claude-sonnet', 'codex-mini', 'claude-haiku'],
  notes: ['claude-sonnet', 'claude-haiku'],
  strategy: ['claude-sonnet', 'claude-opus', 'claude-haiku'],
};

export const analyzeCategoryRouting = (
  events: UsageEvent[],
  category: TaskCategory | 'all'
): RoutingInsight => {
  const scopedEvents = category === 'all' ? events : events.filter((event) => event.category === category);
  const economics = computeAgentEconomics(scopedEvents);
  const observedTotalCost = sum(scopedEvents.map((event) => event.costEstimateUsd));
  const observedTurns = sum(scopedEvents.map((event) => event.turns));

  const viableHints = category === 'all'
    ? agents.map((agent) => agent.id)
    : taskCategoryHints[category as TaskCategory];

  const eligible = economics.filter(
    (entry) =>
      viableHints.includes(entry.agentId) &&
      entry.observedTurns >= 5 &&
      entry.costPerTurn !== null
  );

  const bestValue = eligible.sort((left, right) => {
    const leftValue = left.costPerTurn ?? Number.POSITIVE_INFINITY;
    const rightValue = right.costPerTurn ?? Number.POSITIVE_INFINITY;
    return leftValue - rightValue;
  })[0] ?? null;

  const projectedTotalCost = bestValue && bestValue.costPerTurn !== null
    ? bestValue.costPerTurn * observedTurns
    : observedTotalCost;
  const savings = Math.max(0, observedTotalCost - projectedTotalCost);

  const confidence: RoutingInsight['confidence'] =
    eligible.length >= 2 && observedTurns >= 50
      ? 'high'
      : eligible.length >= 1 && observedTurns >= 10
        ? 'medium'
        : 'low';

  return {
    bestValue,
    category,
    confidence,
    economics,
    observedTotalCost: Number(observedTotalCost.toFixed(2)),
    observedTurns,
    projectedTotalCost: Number(projectedTotalCost.toFixed(2)),
    savings: Number(savings.toFixed(2)),
  };
};

export const inferCategory = (task: string): TaskCategory => {
  const text = task.toLowerCase();
  if (hasAny(text, ['notes', 'note', 'vault', 'wiki', 'knowledge base'])) return 'notes';
  if (hasAny(text, ['pitch', 'deck', 'positioning', 'narrative', 'strategy', 'funding', 'investor'])) return 'strategy';
  if (hasAny(text, ['finance', 'billing', 'invoice', 'incorporation'])) return 'finance';
  if (hasAny(text, ['slack', 'automation', 'calendar', 'connector', 'webhook'])) return 'automation';
  if (hasAny(text, ['landing', 'marketing', 'campaign'])) return 'deck';
  if (hasAny(text, ['repo', 'code', 'component', 'bug', 'test', 'lint', 'typescript', 'react', 'api', 'backend', 'frontend'])) return 'engineering';
  return 'general';
};

export const summarizeProductivity = (events: UsageEvent[]): ProductivityStats => {
  const totalTurns = sum(events.map((event) => event.turns));
  const premiumTurns = sum(
    events
      .filter((event) => event.model.includes('opus') || event.model.includes('gpt-5.5'))
      .map((event) => event.turns)
  );
  const dateKeys = new Set(events.map((event) => event.date));
  const activeDays = dateKeys.size;
  const totalSessions = events.length;

  const workspaceTotals = new Map<string, { cost: number; tokens: number; turns: number }>();
  for (const event of events) {
    const current = workspaceTotals.get(event.workspace) ?? { cost: 0, tokens: 0, turns: 0 };
    current.cost += event.costEstimateUsd;
    current.tokens += event.tokens;
    current.turns += event.turns;
    workspaceTotals.set(event.workspace, current);
  }
  const topWorkspaces = [...workspaceTotals.entries()]
    .map(([workspace, totals]) => ({
      cost: Number(totals.cost.toFixed(2)),
      tokens: totals.tokens,
      turns: totals.turns,
      workspace,
    }))
    .sort((left, right) => right.tokens - left.tokens)
    .slice(0, 5);

  const dayTotals = new Map<string, { cost: number; tokens: number; turns: number }>();
  for (const event of events) {
    const current = dayTotals.get(event.date) ?? { cost: 0, tokens: 0, turns: 0 };
    current.cost += event.costEstimateUsd;
    current.tokens += event.tokens;
    current.turns += event.turns;
    dayTotals.set(event.date, current);
  }
  const longestDayEntry = [...dayTotals.entries()].sort(
    (left, right) => right[1].turns - left[1].turns
  )[0];
  const longestDay = longestDayEntry
    ? {
        cost: Number(longestDayEntry[1].cost.toFixed(2)),
        date: longestDayEntry[0],
        tokens: longestDayEntry[1].tokens,
        turns: longestDayEntry[1].turns,
      }
    : null;

  return {
    activeDays,
    avgSessionsPerActiveDay: activeDays > 0 ? Number((totalSessions / activeDays).toFixed(1)) : 0,
    longestDay,
    premiumTurnRatio: totalTurns > 0 ? Number((premiumTurns / totalTurns).toFixed(3)) : 0,
    topWorkspaces,
    totalSessions,
    totalTurns,
  };
};

const hasAny = (text: string, terms: string[]): boolean =>
  terms.some((term) => text.includes(term));

export const recommendAgent = (task: string): RoutingRecommendation => {
  const text = task.toLowerCase();
  const reasons: string[] = [];
  const actions: string[] = [];
  let primary = agents[2];
  let fallback = agents[1];
  let confidence = 68;

  if (hasAny(text, ['repo', 'code', 'component', 'bug', 'test', 'lint', 'typescript', 'react', 'api', 'backend', 'frontend'])) {
    primary = agents[0];
    fallback = agents[1];
    confidence = 88;
    reasons.push('Repo work benefits from local tools, tests, and file edits.');
    actions.push('Give Codex exact files, acceptance criteria, and test commands.');
  }

  if (hasAny(text, ['small', 'quick', 'rename', 'format', 'lint', 'copy edit', 'mechanical'])) {
    primary = agents[1];
    fallback = agents[4];
    confidence = 86;
    reasons.push('The task looks bounded enough for a cheaper execution route.');
    actions.push('Start with the mini route and escalate only if tests expose ambiguity.');
  }

  if (hasAny(text, ['strategy', 'pitch', 'positioning', 'notes', 'memo', 'narrative', 'funding', 'incorporation', 'research'])) {
    primary = agents[2];
    fallback = agents[4];
    confidence = Math.max(confidence, 82);
    reasons.push('This needs synthesis, framing, and memory across notes.');
    actions.push('Ask Claude for structure first, then store the decision in your notes.');
  }

  if (hasAny(text, ['critical', 'legal', 'security', 'architecture review', 'investment decision', 'final review'])) {
    primary = agents[3];
    fallback = agents[2];
    confidence = 79;
    reasons.push('High-stakes review justifies a premium reasoning pass.');
    actions.push('Use Opus once, then execute follow-up changes with Codex.');
  }

  if (hasAny(text, ['classify', 'tag', 'extract', 'triage', 'sort', 'route', 'summarize these rows'])) {
    primary = agents[4];
    fallback = agents[1];
    confidence = 90;
    reasons.push('Cheap classifier path should handle extraction before any premium pass.');
    actions.push('Batch rows and ask only for structured output.');
  }

  if (reasons.length === 0) {
    reasons.push('General mixed task; start balanced and escalate only when the result is blocked.');
    actions.push('Split planning from execution to avoid burning a long session.');
  }

  actions.push('In Strict Plan Mode: avoid paid API credits unless the local plan route fails.');
  return { actions, confidence, fallback, primary, reasons };
};

export const sum = (items: number[]): number =>
  items.reduce((total, value) => total + value, 0);

export const compactNumber = (value: number): string =>
  Intl.NumberFormat('en', {
    maximumFractionDigits: value > 1000 ? 1 : 0,
    notation: value > 9999 ? 'compact' : 'standard',
  }).format(value);

export const money = (value: number): string =>
  Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: value < 10 ? 2 : 0,
    style: 'currency',
  }).format(value);

export const euro = (value: number): string =>
  Intl.NumberFormat('en-IE', {
    currency: 'EUR',
    maximumFractionDigits: value < 10 ? 2 : 0,
    style: 'currency',
  }).format(value);

export const daysBetween = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
};

export const classifyUsageSession = (session: UsageSession): TaskCategory => {
  const text = `${session.workspace} ${session.model}`.toLowerCase();
  if (hasAny(text, ['notes', 'vault', 'notes'])) return 'notes';
  if (hasAny(text, ['deck', 'slides', 'pitch', 'deeptech', 'funding', 'strategy'])) return 'strategy';
  if (hasAny(text, ['finance', 'billing', 'incorporation', 'oü', 'ou'])) return 'finance';
  if (hasAny(text, ['slack', 'automation', 'calendar', 'connector', 'api'])) return 'automation';
  if (hasAny(text, ['landing', 'marketing'])) return 'deck';
  if (hasAny(text, ['fe', 'be', 'repo', 'tech', 'app', 'backend', 'frontend', 'component'])) return 'engineering';
  return 'general';
};

export const toUsageEvents = (sessions: UsageSession[]): UsageEvent[] =>
  sessions.map((session) => ({
    category: classifyUsageSession(session),
    costEstimateUsd: session.costUsd,
    date: session.date,
    inputTokens: session.inputTokens + session.cachedInputTokens + session.cacheCreationInputTokens,
    model: session.model,
    outputTokens: session.outputTokens,
    provider: session.provider,
    source: `${session.provider} local logs`,
    tokens: session.totalTokens,
    tokensPerTurn: Math.round(session.totalTokens / Math.max(session.interactions, 1)),
    turns: session.interactions,
    workspace: session.workspace,
  }));

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const getLatestDate = (events: UsageEvent[]): string =>
  events.map((event) => event.date).sort((a, b) => a.localeCompare(b)).at(-1) ?? isoDate(new Date());

export const getStartDate = (latestDate: string, range: DateRange): string => {
  if (range === 'all') return '0000-01-01';
  const days = range === '7d' ? 6 : range === '30d' ? 29 : 89;
  const date = new Date(`${latestDate}T00:00:00`);
  date.setDate(date.getDate() - days);
  return isoDate(date);
};

export const filterUsageEvents = (
  events: UsageEvent[],
  filters: FilterState,
  latestDate = getLatestDate(events)
): UsageEvent[] => {
  const startDate = getStartDate(latestDate, filters.range);
  return events.filter((event) => {
    if (event.date < startDate) return false;
    if (filters.provider !== 'all' && event.provider !== filters.provider) return false;
    if (filters.model !== 'all' && event.model !== filters.model) return false;
    if (filters.workspace !== 'all' && event.workspace !== filters.workspace) return false;
    if (filters.category !== 'all' && event.category !== filters.category) return false;
    if (filters.source !== 'all' && event.source !== filters.source) return false;
    return true;
  });
};

const getWeekKey = (dateString: string): string => {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

const bucketKey = (date: string, grain: Grain): string => {
  if (grain === 'day') return date;
  if (grain === 'month') return date.slice(0, 7);
  return getWeekKey(date);
};

export const formatDateLabel = (value: string): string => {
  if (value.includes('-W')) return value;
  if (value.length === 7) {
    return new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit' }).format(
      new Date(`${value}-01T00:00:00`)
    );
  }

  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(
    new Date(`${value}T00:00:00`)
  );
};

export const buildUsageSeries = (events: UsageEvent[], grain: Grain): UsagePoint[] => {
  const buckets = new Map<string, UsagePoint>();

  for (const event of events) {
    const key = bucketKey(event.date, grain);
    const current = buckets.get(key) ?? {
      claudeTokens: 0,
      claudeTurns: 0,
      codexTokens: 0,
      codexTurns: 0,
      costEstimateUsd: 0,
      key,
      label: formatDateLabel(key),
      premiumTurns: 0,
      tokensPerTurn: 0,
      totalTokens: 0,
      turns: 0,
    };

    current.costEstimateUsd += event.costEstimateUsd;
    current.totalTokens += event.tokens;
    current.turns += event.turns;
    current.premiumTurns += event.model.includes('opus') || event.model.includes('gpt-5.5') ? event.turns : 0;
    if (event.provider === 'Claude') {
      current.claudeTokens += event.tokens;
      current.claudeTurns += event.turns;
    }
    if (event.provider === 'Codex') {
      current.codexTokens += event.tokens;
      current.codexTurns += event.turns;
    }
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .map((point) => ({
      ...point,
      costEstimateUsd: Number(point.costEstimateUsd.toFixed(4)),
      tokensPerTurn: Math.round(point.totalTokens / Math.max(point.turns, 1)),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
};

export type ProviderComparison = {
  activeDays: number;
  busiestDay: { date: string; label: string; turns: number } | null;
  claudeShare: number;
  claudeTokens: number;
  claudeTurns: number;
  codexShare: number;
  codexTokens: number;
  codexTurns: number;
  leanRatio: number;
  leaning: 'Claude' | 'Codex' | 'even';
  totalTurns: number;
};

// Compare the two assistants over a daily series. Both run on flat plans, so the
// axis is usage (turns), not dollars.
export const compareProviders = (series: UsagePoint[]): ProviderComparison => {
  const claudeTurns = sum(series.map((point) => point.claudeTurns));
  const codexTurns = sum(series.map((point) => point.codexTurns));
  const totalTurns = claudeTurns + codexTurns;
  const busiest = [...series]
    .filter((point) => point.turns > 0)
    .sort((a, b) => b.turns - a.turns)[0];

  const leanRatio = codexTurns > 0 ? claudeTurns / codexTurns : claudeTurns > 0 ? Infinity : 0;
  const claudeShare = totalTurns > 0 ? claudeTurns / totalTurns : 0;
  let leaning: ProviderComparison['leaning'] = 'even';
  if (claudeShare >= 0.6) leaning = 'Claude';
  else if (claudeShare <= 0.4) leaning = 'Codex';

  return {
    activeDays: series.filter((point) => point.turns > 0).length,
    busiestDay: busiest ? { date: busiest.key, label: busiest.label, turns: busiest.turns } : null,
    claudeShare,
    claudeTokens: sum(series.map((point) => point.claudeTokens)),
    claudeTurns,
    codexShare: totalTurns > 0 ? codexTurns / totalTurns : 0,
    codexTokens: sum(series.map((point) => point.codexTokens)),
    codexTurns,
    leanRatio,
    leaning,
    totalTurns,
  };
};

export const getOptions = (
  events: UsageEvent[],
  key: keyof Pick<UsageEvent, 'category' | 'model' | 'provider' | 'source' | 'workspace'>
): string[] =>
  [...new Set(events.map((event) => String(event[key])))].sort((a, b) => a.localeCompare(b));

export const groupTotals = (
  events: UsageEvent[],
  key: keyof Pick<UsageEvent, 'category' | 'model' | 'provider' | 'workspace'>
) => {
  const buckets = new Map<string, { costEstimateUsd: number; label: string; tokens: number; turns: number }>();
  for (const event of events) {
    const label = String(event[key]);
    const current = buckets.get(label) ?? { costEstimateUsd: 0, label, tokens: 0, turns: 0 };
    current.costEstimateUsd += event.costEstimateUsd;
    current.tokens += event.tokens;
    current.turns += event.turns;
    buckets.set(label, current);
  }

  return [...buckets.values()]
    .map((row) => ({ ...row, costEstimateUsd: Number(row.costEstimateUsd.toFixed(4)) }))
    .sort((a, b) => b.tokens - a.tokens);
};

export const calculatePlanPressure = (events: UsageEvent[], budgets: PlanBudget[]): PlanPressure[] => {
  const uniqueDays = Math.max(1, new Set(events.map((event) => event.date)).size);

  return budgets.map((budget) => {
    const providerEvents = events.filter((event) => event.provider === budget.provider);
    const observedCost = sum(providerEvents.map((event) => event.costEstimateUsd));
    const monthlyProxy = (observedCost / uniqueDays) * 30;
    const pressurePercent = Math.round((monthlyProxy / Math.max(budget.monthlyPriceUsd, 1)) * 100);
    const status = pressurePercent >= 100 ? 'over' : pressurePercent >= budget.warnAtPercent ? 'watch' : 'calm';

    return {
      budget,
      costEstimateUsd: Number(monthlyProxy.toFixed(2)),
      daysTracked: uniqueDays,
      pressurePercent,
      status,
      tokens: sum(providerEvents.map((event) => event.tokens)),
      turns: sum(providerEvents.map((event) => event.turns)),
    };
  });
};

export const inferPlansFromInvoices = (
  invoices: Invoice[],
  fallback: PlanBudget[]
): { plans: PlanBudget[]; sources: Record<Provider, 'invoices' | 'fallback'> } => {
  const sources: Record<Provider, 'invoices' | 'fallback'> = { Claude: 'fallback', Codex: 'fallback' };
  const plans: PlanBudget[] = fallback.map((budget) => {
    const providerInvoices = invoices
      .filter((invoice) => invoice.provider === budget.provider)
      .filter((invoice) => !/credits?/i.test(invoice.planName))
      .sort((left, right) => (left.date < right.date ? 1 : -1));

    const latest = providerInvoices[0];
    if (!latest) return budget;
    sources[budget.provider] = 'invoices';
    return {
      ...budget,
      planName: latest.planName,
      monthlyPriceUsd: Number(latest.amountSubtotal.toFixed(2)),
    };
  });

  return { plans, sources };
};

export const summarizeInvoices = (invoices: Invoice[]) => {
  const byProvider = new Map<Provider, { count: number; total: number; lastDate: string; currency: string }>();
  for (const invoice of invoices) {
    const current = byProvider.get(invoice.provider) ?? {
      count: 0,
      total: 0,
      lastDate: '',
      currency: invoice.currency,
    };
    current.count += 1;
    current.total += invoice.amountTotal;
    if (invoice.date > current.lastDate) current.lastDate = invoice.date;
    current.currency = invoice.currency;
    byProvider.set(invoice.provider, current);
  }
  return [...byProvider.entries()].map(([provider, value]) => ({
    provider,
    count: value.count,
    total: Number(value.total.toFixed(2)),
    lastDate: value.lastDate,
    currency: value.currency,
  }));
};

export const getStrictPlanWarnings = (pressures: PlanPressure[]): string[] => {
  const warnings: string[] = [];
  for (const pressure of pressures) {
    if (!pressure.budget.strictPlanMode) continue;
    const multiplier = pressure.pressurePercent / 100;
    if (multiplier >= 10) {
      warnings.push(
        `${pressure.budget.provider}: getting ${multiplier.toFixed(0)}× value vs API pricing. The router will flag premium routes and prefer compacted context to keep you well inside plan windows.`
      );
    } else if (multiplier >= 1) {
      warnings.push(
        `${pressure.budget.provider}: at ${multiplier.toFixed(1)}× of API cost. Strict mode prefers cheaper routes by default; turn off in Settings → Plans if you want the router to free-roam.`
      );
    }
  }

  if (warnings.length === 0) {
    warnings.push(
      'Strict Plan Mode is on for the configured plans. Router will prefer flat-plan routes and avoid paid API credits unless you explicitly opt in.'
    );
  }

  return warnings;
};

export type ActiveFilter = {
  key: keyof FilterState;
  label: string;
  value: string;
};

const filterLabels: Record<keyof FilterState, string> = {
  category: 'Category',
  grain: 'Grain',
  model: 'Model',
  provider: 'Provider',
  range: 'Range',
  source: 'Source',
  tab: 'Tab',
  workspace: 'Workspace',
};

export const getActiveFilters = (filters: FilterState): ActiveFilter[] => {
  const active: ActiveFilter[] = [];
  for (const key of Object.keys(filterLabels) as Array<keyof FilterState>) {
    if (key === 'tab') continue;
    const value = filters[key];
    const fallback = defaultFilters[key];
    if (value !== fallback) {
      active.push({ key, label: filterLabels[key], value: String(value) });
    }
  }
  return active;
};

export type Freshness = {
  daysAgo: number;
  label: string;
  status: 'fresh' | 'aging' | 'stale';
};

export const describeFreshness = (generatedAt: string, now = new Date()): Freshness => {
  const generated = new Date(generatedAt);
  const diffMs = now.getTime() - generated.getTime();
  const daysAgo = Math.max(0, Math.floor(diffMs / 86_400_000));
  const status = daysAgo <= 1 ? 'fresh' : daysAgo <= 7 ? 'aging' : 'stale';
  const label =
    daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
  return { daysAgo, label, status };
};

export const summarizeFinance = (entries: FinanceEntry[]) => {
  const budget = sum(entries.map((entry) => entry.budgetEur));
  const actual = sum(entries.map((entry) => entry.actualEur));
  const missingInvoices = entries.filter((entry) => entry.invoiceStatus === 'missing').length;
  const highVolatility = entries.filter((entry) => entry.volatility === 'high').length;

  return {
    actual,
    budget,
    missingInvoices,
    remaining: budget - actual,
    highVolatility,
    usagePercent: Math.round((actual / Math.max(budget, 1)) * 100),
  };
};

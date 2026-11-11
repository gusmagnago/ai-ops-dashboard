import type { ConnectorState, FinanceEntry, InvoicesPayload, PlanBudget, PrebuiltPlan, UsagePayload, Workstream } from './types';

export const prebuiltPlans: PrebuiltPlan[] = [
  {
    monthlyPriceUsd: 20,
    name: 'Claude Pro — $20/mo',
    planName: 'Claude Pro',
    provider: 'Claude',
    resetCadence: '5h-window',
  },
  {
    monthlyPriceUsd: 100,
    name: 'Claude Max 5x — $100/mo',
    planName: 'Claude Max 5x',
    provider: 'Claude',
    resetCadence: 'weekly',
  },
  {
    monthlyPriceUsd: 200,
    name: 'Claude Max 20x — $200/mo',
    planName: 'Claude Max 20x',
    provider: 'Claude',
    resetCadence: 'weekly',
  },
  {
    monthlyPriceUsd: 20,
    name: 'ChatGPT Plus — $20/mo',
    planName: 'ChatGPT Plus',
    provider: 'Codex',
    resetCadence: 'monthly',
  },
  {
    monthlyPriceUsd: 200,
    name: 'ChatGPT Pro + Codex — $200/mo',
    planName: 'ChatGPT Pro + Codex',
    provider: 'Codex',
    resetCadence: 'monthly',
  },
];

const fallbackPayload: UsagePayload = {
  generatedAt: new Date().toISOString(),
  pricing: {
    lastVerified: '2026-05-27',
    links: [
      'https://developers.openai.com/api/docs/pricing',
      'https://help.openai.com/en/articles/20001106',
      'https://platform.claude.com/docs/en/about-claude/pricing',
    ],
    sourceNote: 'Sample anonymized data. Run npm run ingest to refresh from local logs.',
  },
  sessions: [
    {
      cacheCreationInputTokens: 0,
      cachedInputTokens: 180000,
      costUsd: 1.85,
      date: '2026-01-21',
      inputTokens: 260000,
      interactions: 12,
      model: 'gpt-5.3-codex',
      outputTokens: 42000,
      provider: 'Codex',
      totalTokens: 482000,
      workspace: 'example/product-app',
    },
    {
      cacheCreationInputTokens: 220000,
      cachedInputTokens: 460000,
      costUsd: 1.14,
      date: '2026-01-22',
      inputTokens: 80000,
      interactions: 16,
      model: 'claude-sonnet-4-6',
      outputTokens: 34000,
      provider: 'Claude',
      totalTokens: 794000,
      workspace: 'example/knowledge-base',
    },
  ],
  sources: [
    { available: false, label: 'Claude local logs', path: '~/.claude/projects' },
    { available: false, label: 'Codex local logs', path: '~/.codex/sessions' },
  ],
};

export const defaultPlanBudgets: PlanBudget[] = [
  {
    dailyCeilingUsd: 5,
    monthlyPriceUsd: 20,
    planName: 'Claude Pro',
    provider: 'Claude',
    resetCadence: '5h-window',
    strictPlanMode: true,
    warnAtPercent: 80,
  },
  {
    dailyCeilingUsd: 5,
    monthlyPriceUsd: 20,
    planName: 'ChatGPT Plus',
    provider: 'Codex',
    resetCadence: 'monthly',
    strictPlanMode: true,
    warnAtPercent: 80,
  },
];

const fallbackFinanceEntries: FinanceEntry[] = [];

export const financeEntries: FinanceEntry[] = fallbackFinanceEntries;

const fallbackWorkstreams: Workstream[] = [
  {
    items: [
      { label: 'Run npm run ingest to load your local Claude and Codex logs', priority: 'high', status: 'next' },
      { label: 'Drop a finance CSV into npm run ingest:finance', priority: 'normal', status: 'open' },
      { label: 'Create public/data/workstreams.json to replace this sample', priority: 'normal', status: 'open' },
    ],
    name: 'Getting started',
    source: 'Sample data',
    summary: 'Replace this card by adding public/data/workstreams.json with your own work.',
  },
];

export const workstreams: Workstream[] = fallbackWorkstreams;

// Static servers (e.g. `vite preview`, SPA rewrites on hosts) can answer a
// missing file with 200 + index.html. Only treat a response as data when the
// server says it is JSON, so the loader falls through to the next candidate.
const isJsonResponse = (response: Response): boolean =>
  (response.headers.get('content-type') ?? '').toLowerCase().includes('application/json');

const fetchPayload = async (path: string): Promise<UsagePayload | null> => {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok || !isJsonResponse(response)) return null;
  return (await response.json()) as UsagePayload;
};

const asSample = (payload: UsagePayload): UsagePayload => ({ ...payload, origin: 'sample' });

export const isSamplePayload = (payload: UsagePayload): boolean => payload.origin === 'sample';

export const loadUsagePayload = async (): Promise<UsagePayload> => {
  try {
    const local = await fetchPayload('/data/usage.json');
    if (local) return { ...local, origin: 'local' };
    return asSample((await fetchPayload('/data/sample-usage.json')) ?? fallbackPayload);
  } catch {
    return asSample(fallbackPayload);
  }
};

// Used by the live-refresh loop. Fetches only the real aggregates and returns
// null on miss/parse failure, so a mid-write read never clobbers good data with
// the sample fallback.
export const refreshUsagePayload = async (): Promise<UsagePayload | null> => {
  try {
    const payload = await fetchPayload('/data/usage.json');
    if (!payload || !Array.isArray(payload.sessions)) return null;
    return { ...payload, origin: 'local' };
  } catch {
    return null;
  }
};

const isFinanceEntry = (value: unknown): value is FinanceEntry =>
  !!value &&
  typeof value === 'object' &&
  'service' in value &&
  'budgetEur' in value &&
  'actualEur' in value;

const fetchFinance = async (path: string): Promise<FinanceEntry[] | null> => {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json()) as { entries?: unknown };
    if (!Array.isArray(payload?.entries)) return null;
    const validated = payload.entries.filter(isFinanceEntry);
    return validated.length > 0 ? validated : null;
  } catch {
    return null;
  }
};

export const loadFinanceEntries = async (): Promise<FinanceEntry[]> =>
  (await fetchFinance('/data/finance.json')) ??
  (await fetchFinance('/data/sample-finance.json')) ??
  fallbackFinanceEntries;

const emptyInvoicesPayload: InvoicesPayload = {
  generatedAt: new Date().toISOString(),
  invoices: [],
  sources: [],
};

export const loadInvoicesPayload = async (): Promise<InvoicesPayload> => {
  try {
    const response = await fetch('/data/invoices.json', { cache: 'no-store' });
    if (!response.ok) return emptyInvoicesPayload;
    const payload = (await response.json()) as InvoicesPayload;
    return payload?.invoices ? payload : emptyInvoicesPayload;
  } catch {
    return emptyInvoicesPayload;
  }
};

export const defaultConnectors: ConnectorState[] = [
  {
    id: 'gmail',
    enabled: false,
    notes: 'Pull billing receipts from Anthropic and OpenAI. Run npm run ingest:invoices.',
    config: {
      anthropicSender: 'invoice+statements@mail.anthropic.com',
      openaiSender: 'noreply@tm.openai.com',
    },
  },
  {
    id: 'drive',
    enabled: false,
    notes: 'Upload exported reports to a shared Drive folder for the team.',
    config: {
      folderId: '',
      shareWith: '',
    },
  },
  {
    id: 'resend',
    enabled: false,
    notes: 'Email the weekly report automatically. Requires RESEND_API_KEY env var.',
    config: {
      apiKeyEnvVar: 'RESEND_API_KEY',
      defaultTo: '',
      defaultFrom: '',
    },
  },
];

const isWorkstream = (value: unknown): value is Workstream =>
  !!value &&
  typeof value === 'object' &&
  'name' in value &&
  'items' in value &&
  Array.isArray((value as Workstream).items);

const fetchWorkstreams = async (path: string): Promise<Workstream[] | null> => {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload = (await response.json()) as { workstreams?: unknown };
    if (!Array.isArray(payload?.workstreams)) return null;
    const validated = payload.workstreams.filter(isWorkstream);
    return validated.length > 0 ? validated : null;
  } catch {
    return null;
  }
};

export const loadWorkstreams = async (): Promise<Workstream[]> =>
  (await fetchWorkstreams('/data/workstreams.json')) ??
  (await fetchWorkstreams('/data/sample-workstreams.json')) ??
  fallbackWorkstreams;

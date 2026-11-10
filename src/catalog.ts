import type { ExtensionCatalogItem, Provider, TaskCategory } from './types';

export const extensionCatalog: ExtensionCatalogItem[] = [
  {
    category: 'code',
    id: 'github',
    installState: 'available',
    name: 'GitHub Plugin',
    notes: 'Use for PRs, CI, review threads, branch publishing, and repository coordination.',
    providerFit: ['Codex'],
    source: 'Codex plugin',
    taskFit: ['engineering', 'automation'],
  },
  {
    category: 'code',
    id: 'repo-conventions',
    installState: 'available',
    name: 'Repo Conventions Skill',
    notes: 'Personal skill describing your repo layout, lint rules, and test commands so agents work release-safely.',
    providerFit: ['Codex', 'Claude'],
    source: 'local skill',
    taskFit: ['engineering'],
  },
  {
    category: 'knowledge',
    id: 'openai-docs',
    installState: 'available',
    name: 'OpenAI Docs',
    notes: 'Use for current OpenAI/Codex API research, pricing, and model choice checks.',
    providerFit: ['Codex'],
    source: 'system skill',
    taskFit: ['automation', 'engineering', 'strategy'],
  },
  {
    category: 'automation',
    id: 'google-calendar',
    installState: 'available',
    name: 'Google Calendar',
    notes: 'Use for daily briefs, reminders, schedule automation, and focus-time planning.',
    providerFit: ['Any'],
    source: 'Codex plugin',
    taskFit: ['automation', 'notes', 'all'],
  },
  {
    category: 'knowledge',
    id: 'google-drive',
    installState: 'available',
    name: 'Google Drive',
    notes: 'Use for Docs, Sheets, Slides, Drive exports, and shared planning artifacts.',
    providerFit: ['Any'],
    source: 'Codex plugin',
    taskFit: ['deck', 'finance', 'strategy'],
  },
  {
    category: 'automation',
    id: 'twilio-communications',
    installState: 'available',
    name: 'Twilio Communications',
    notes: 'Use when messaging, reminders, WhatsApp, SMS, or verification costs need automation.',
    providerFit: ['Codex'],
    source: 'local skill',
    taskFit: ['automation', 'finance', 'engineering'],
  },
  {
    category: 'automation',
    id: 'resend',
    installState: 'available',
    name: 'Resend',
    notes: 'Use for transactional email, inbound email handling, and billing digest notifications.',
    providerFit: ['Codex'],
    source: 'local skill',
    taskFit: ['automation', 'engineering'],
  },
  {
    category: 'data',
    id: 'analytics-tracking',
    installState: 'available',
    name: 'Analytics Tracking',
    notes: 'Use for event taxonomy, product analytics, cost/user instrumentation, and dashboards.',
    providerFit: ['Any'],
    source: 'local skill',
    taskFit: ['finance', 'engineering', 'automation'],
  },
  {
    category: 'knowledge',
    id: 'research',
    installState: 'available',
    name: 'Research Skill',
    notes: 'Use for structured research passes: source gathering, synthesis, and citation discipline.',
    providerFit: ['Claude'],
    source: 'local skill',
    taskFit: ['strategy', 'notes'],
  },
  {
    category: 'knowledge',
    id: 'writing',
    installState: 'available',
    name: 'Writing Skill',
    notes: 'Use for long-form drafts, narrative editing, and structured decision memos.',
    providerFit: ['Claude'],
    source: 'local skill',
    taskFit: ['strategy', 'notes', 'deck'],
  },
  {
    category: 'finance',
    id: 'pricing-strategy',
    installState: 'available',
    name: 'Pricing Strategy',
    notes: 'Use for plan packaging, finance projections, monetization, and grant/funding tradeoffs.',
    providerFit: ['Claude'],
    source: 'local skill',
    taskFit: ['finance', 'strategy'],
  },
];

export const getRecommendedExtensions = (
  providerOrModel: Provider | string | 'all',
  taskCategory: TaskCategory | 'all'
): ExtensionCatalogItem[] => {
  const text = providerOrModel.toLowerCase();
  const provider: Provider | 'Any' =
    text.includes('codex') || text.includes('gpt') ? 'Codex' :
    text.includes('claude') || text.includes('opus') || text.includes('sonnet') || text.includes('haiku') ? 'Claude' :
    'Any';

  return extensionCatalog
    .map((item) => {
      const providerScore = item.providerFit.includes(provider)
        ? 3
        : item.providerFit.includes('Any') || provider === 'Any'
          ? 1
          : 0;
      const taskScore =
        item.taskFit.includes('all') || taskCategory === 'all' || item.taskFit.includes(taskCategory)
          ? 4
          : 0;
      const categoryScore =
        (['automation', 'engineering'].includes(taskCategory) && item.category === 'code') ||
        (['deck', 'strategy'].includes(taskCategory) && ['growth', 'knowledge'].includes(item.category)) ||
        (taskCategory === 'finance' && ['data', 'finance'].includes(item.category)) ||
        (taskCategory === 'notes' && ['automation', 'knowledge'].includes(item.category))
          ? 2
          : 0;
      const installScore = item.installState === 'installed' ? 1 : 0;
      return { item, score: providerScore + taskScore + categoryScore + installScore };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .map(({ item }) => item);
};

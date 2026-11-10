import { describe, expect, it } from 'vitest';

import {
  analyzeCategoryRouting,
  buildUsageSeries,
  calculatePlanPressure,
  compareProviders,
  computeAgentEconomics,
  defaultFilters,
  describeFreshness,
  filterUsageEvents,
  getActiveFilters,
  inferCategory,
  summarizeFinance,
  summarizeProductivity,
  toUsageEvents,
} from './engine';
import type { FinanceEntry, PlanBudget, UsageSession } from './types';

const sessions: UsageSession[] = [
  {
    cacheCreationInputTokens: 0,
    cachedInputTokens: 0,
    costUsd: 10,
    date: '2026-05-01',
    inputTokens: 1000,
    interactions: 2,
    model: 'claude-sonnet-4-6',
    outputTokens: 500,
    provider: 'Claude',
    totalTokens: 1500,
    workspace: 'Documents/Notes Vault',
  },
  {
    cacheCreationInputTokens: 0,
    cachedInputTokens: 0,
    costUsd: 5,
    date: '2026-05-02',
    inputTokens: 1000,
    interactions: 1,
    model: 'gpt-5.3-codex',
    outputTokens: 250,
    provider: 'Codex',
    totalTokens: 1250,
    workspace: 'example/repo',
  },
];

describe('AI Ops engine', () => {
  it('converts sessions into privacy-preserving usage events', () => {
    const events = toUsageEvents(sessions);

    expect(events[0]).toMatchObject({
      category: 'notes',
      costEstimateUsd: 10,
      provider: 'Claude',
      source: 'Claude local logs',
      turns: 2,
    });
    expect(Object.keys(events[0])).not.toContain('prompt');
    expect(Object.keys(events[0])).not.toContain('output');
  });

  it('compares Claude vs Codex usage on a daily series', () => {
    const events = toUsageEvents(sessions);
    const series = buildUsageSeries(events, 'day');
    const comparison = compareProviders(series);

    expect(comparison.claudeTurns).toBe(2);
    expect(comparison.codexTurns).toBe(1);
    expect(comparison.totalTurns).toBe(3);
    expect(comparison.leanRatio).toBeCloseTo(2);
    expect(comparison.leaning).toBe('Claude');
    expect(comparison.activeDays).toBe(2);
    expect(comparison.busiestDay?.turns).toBe(2);
    expect(comparison.claudeShare + comparison.codexShare).toBeCloseTo(1);
  });

  it('filters events by provider and URL-style state', () => {
    const events = toUsageEvents(sessions);
    const filtered = filterUsageEvents(
      events,
      { ...defaultFilters, provider: 'Codex', range: '30d' },
      '2026-05-28'
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].provider).toBe('Codex');
  });

  it('calculates monthly plan pressure from the selected period proxy', () => {
    const events = toUsageEvents(sessions);
    const budgets: PlanBudget[] = [
      {
        dailyCeilingUsd: 10,
        monthlyPriceUsd: 100,
        planName: 'Claude test',
        provider: 'Claude',
        resetCadence: 'monthly',
        strictPlanMode: true,
        warnAtPercent: 80,
      },
      {
        dailyCeilingUsd: 20,
        monthlyPriceUsd: 200,
        planName: 'Codex test',
        provider: 'Codex',
        resetCadence: 'monthly',
        strictPlanMode: true,
        warnAtPercent: 80,
      },
    ];

    const pressure = calculatePlanPressure(events, budgets);

    expect(pressure[0].budget.provider).toBe('Claude');
    expect(pressure[0].pressurePercent).toBe(150);
    expect(pressure[0].status).toBe('over');
  });

  it('summarizes finance baselines', () => {
    const entries: FinanceEntry[] = [
      {
        actualEur: 10,
        budgetEur: 20,
        category: 'tooling',
        invoiceStatus: 'received',
        month: '2026-05',
        nextAction: 'Keep watching.',
        service: 'Example fixed',
        source: 'test',
        volatility: 'fixed',
      },
      {
        actualEur: 0,
        budgetEur: 30,
        category: 'variable',
        invoiceStatus: 'missing',
        month: '2026-05',
        nextAction: 'Connect source.',
        service: 'Example variable',
        source: 'test',
        volatility: 'high',
      },
    ];

    expect(summarizeFinance(entries)).toMatchObject({
      actual: 10,
      budget: 50,
      highVolatility: 1,
      missingInvoices: 1,
      remaining: 40,
      usagePercent: 20,
    });
  });
});

describe('getActiveFilters', () => {
  it('returns nothing when filters match defaults', () => {
    expect(getActiveFilters(defaultFilters)).toEqual([]);
  });

  it('skips the tab key and reports non-default filters', () => {
    const active = getActiveFilters({
      ...defaultFilters,
      tab: 'router',
      provider: 'Claude',
      range: '7d',
    });
    expect(active.map((f) => f.key)).toEqual(['provider', 'range']);
    expect(active.find((f) => f.key === 'provider')?.value).toBe('Claude');
  });
});

describe('inferCategory', () => {
  it('maps repo terms to engineering', () => {
    expect(inferCategory('Refactor the react component and add a test')).toBe('engineering');
  });

  it('maps notes terms to notes', () => {
    expect(inferCategory('Sync vault notes')).toBe('notes');
  });

  it('falls back to general', () => {
    expect(inferCategory('Do the thing')).toBe('general');
  });
});

describe('computeAgentEconomics + analyzeCategoryRouting', () => {
  const events = toUsageEvents([
    ...Array.from({ length: 8 }, (_unused, index) => ({
      cacheCreationInputTokens: 0,
      cachedInputTokens: 0,
      costUsd: 1,
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      inputTokens: 1000,
      interactions: 10,
      model: 'gpt-5.3-codex',
      outputTokens: 200,
      provider: 'Codex' as const,
      totalTokens: 1200,
      workspace: 'example/backend',
    })),
    ...Array.from({ length: 8 }, (_unused, index) => ({
      cacheCreationInputTokens: 0,
      cachedInputTokens: 0,
      costUsd: 0.1,
      date: `2026-05-${String(index + 9).padStart(2, '0')}`,
      inputTokens: 500,
      interactions: 10,
      model: 'gpt-5.1-codex-mini',
      outputTokens: 100,
      provider: 'Codex' as const,
      totalTokens: 600,
      workspace: 'example/backend',
    })),
  ]);

  it('groups observed cost-per-turn per agent', () => {
    const econ = computeAgentEconomics(events);
    const frontier = econ.find((row) => row.agentId === 'codex-frontier');
    const mini = econ.find((row) => row.agentId === 'codex-mini');
    expect(frontier?.observedTurns).toBe(80);
    expect(mini?.observedTurns).toBe(80);
    expect(frontier?.costPerTurn).toBeGreaterThan(mini?.costPerTurn ?? 0);
  });

  it('reports projected savings when a cheaper viable agent exists', () => {
    const insight = analyzeCategoryRouting(events, 'engineering');
    expect(insight.observedTurns).toBe(160);
    expect(insight.bestValue?.agentId).toBe('codex-mini');
    expect(insight.savings).toBeGreaterThan(0);
    expect(insight.confidence).toBe('high');
  });

  it('reports low confidence and no savings when history is empty', () => {
    const insight = analyzeCategoryRouting([], 'engineering');
    expect(insight.observedTurns).toBe(0);
    expect(insight.bestValue).toBeNull();
    expect(insight.savings).toBe(0);
    expect(insight.confidence).toBe('low');
  });
});

describe('summarizeProductivity', () => {
  it('aggregates active days, top workspaces, and the heaviest day', () => {
    const events = toUsageEvents([
      {
        cacheCreationInputTokens: 0,
        cachedInputTokens: 0,
        costUsd: 1,
        date: '2026-05-01',
        inputTokens: 100,
        interactions: 5,
        model: 'claude-sonnet-4-6',
        outputTokens: 50,
        provider: 'Claude' as const,
        totalTokens: 200,
        workspace: 'example/backend',
      },
      {
        cacheCreationInputTokens: 0,
        cachedInputTokens: 0,
        costUsd: 4,
        date: '2026-05-02',
        inputTokens: 200,
        interactions: 20,
        model: 'claude-opus-4-7',
        outputTokens: 100,
        provider: 'Claude' as const,
        totalTokens: 500,
        workspace: 'example/frontend',
      },
    ]);
    const stats = summarizeProductivity(events);
    expect(stats.activeDays).toBe(2);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalTurns).toBe(25);
    expect(stats.topWorkspaces[0].workspace).toBe('example/frontend');
    expect(stats.longestDay?.date).toBe('2026-05-02');
    expect(stats.premiumTurnRatio).toBeCloseTo(20 / 25);
  });
});

describe('describeFreshness', () => {
  it('flags today as fresh', () => {
    const now = new Date('2026-05-28T12:00:00Z');
    const result = describeFreshness('2026-05-28T08:00:00Z', now);
    expect(result.status).toBe('fresh');
    expect(result.label).toBe('Today');
  });

  it('flags week-old data as aging', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    const result = describeFreshness('2026-05-23T00:00:00Z', now);
    expect(result.status).toBe('aging');
    expect(result.daysAgo).toBe(5);
  });

  it('flags 10+ day-old data as stale', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    const result = describeFreshness('2026-05-15T00:00:00Z', now);
    expect(result.status).toBe('stale');
  });
});

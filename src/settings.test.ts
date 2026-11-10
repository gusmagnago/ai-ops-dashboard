import { describe, expect, it } from 'vitest';

import {
  defaultSettings,
  legacyBudgetStorageKey,
  loadSettings,
  mergeSettings,
  resolveTheme,
  settingsStorageKey,
  type SettingsStorage,
} from './settings';
import type { PlanBudget } from './types';

const createStorage = (initial: Record<string, string> = {}): SettingsStorage => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
};

describe('settings persistence', () => {
  it('migrates legacy plan budgets into v3 settings', () => {
    const legacyBudgets: PlanBudget[] = [
      {
        dailyCeilingUsd: 8,
        monthlyPriceUsd: 42,
        planName: 'Claude Max test',
        provider: 'Claude',
        resetCadence: 'monthly',
        strictPlanMode: true,
        warnAtPercent: 75,
      },
    ];
    const storage = createStorage({
      [legacyBudgetStorageKey]: JSON.stringify(legacyBudgets),
    });

    const settings = loadSettings(storage);

    expect(settings.version).toBe(3);
    expect(settings.planBudgets).toEqual(legacyBudgets);
    expect(storage.getItem(settingsStorageKey)).toContain('Claude Max test');
  });

  it('sanitizes invalid saved settings while preserving supported values', () => {
    const settings = mergeSettings({
      defaultFilters: { ...defaultSettings.defaultFilters, tab: 'settings' as never },
      table: {
        ...defaultSettings.table,
        exportFormat: 'json',
        pageSize: 999,
      },
      theme: 'neon' as never,
    });

    expect(settings.defaultFilters.tab).toBe('daily');
    expect(settings.table.exportFormat).toBe('json');
    expect(settings.table.pageSize).toBe(25);
    expect(settings.theme).toBe('system');
  });

  it('resolves system theme without touching the DOM', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

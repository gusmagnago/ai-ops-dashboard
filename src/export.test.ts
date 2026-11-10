import { describe, expect, it } from 'vitest';

import {
  exportUsageRows,
  filterUsageRowsForTable,
  serializeCsv,
  shouldResetPageOnFilterChange,
  sortUsageRowsForTable,
  type UsageExportRow,
} from './export';
import type { UsageEvent } from './types';

const rows: UsageEvent[] = [
  {
    category: 'engineering',
    costEstimateUsd: 1.23456789,
    date: '2026-05-28',
    inputTokens: 1000,
    model: 'gpt-5.3-codex',
    outputTokens: 200,
    provider: 'Codex',
    source: 'Codex local logs',
    tokens: 1200,
    tokensPerTurn: 600,
    turns: 2,
    workspace: 'example/repo',
  },
  {
    category: 'strategy',
    costEstimateUsd: 9.87654321,
    date: '2026-05-27',
    inputTokens: 5000,
    model: 'claude-sonnet-4-6',
    outputTokens: 900,
    provider: 'Claude',
    source: 'Claude local logs',
    tokens: 5900,
    tokensPerTurn: 1475,
    turns: 4,
    workspace: 'Documents/Notes Vault',
  },
];

describe('usage exports', () => {
  it('escapes commas, quotes, and newlines in CSV output', () => {
    const csvRows: UsageExportRow[] = [
      {
        apiProxyUsd: 1.2,
        category: 'strategy',
        date: '2026-05-28',
        model: 'claude "sonnet"',
        provider: 'Claude',
        source: 'Claude local logs',
        tokens: 42,
        tokensPerTurn: 21,
        turns: 2,
        workspace: 'Notes, Vault\nExample',
      },
    ];

    expect(serializeCsv(csvRows)).toContain('"claude ""sonnet"""');
    expect(serializeCsv(csvRows)).toContain('"Notes, Vault\nExample"');
  });

  it('exports JSON with aggregate fields only', () => {
    const artifact = exportUsageRows(rows, 'json', new Date('2026-05-28T12:00:00Z'));
    const parsed = JSON.parse(artifact.content) as Array<Record<string, unknown>>;

    expect(artifact.filename).toBe('ai-ops-usage-2026-05-28.json');
    expect(parsed[0]).toMatchObject({
      apiProxyUsd: 1.234568,
      provider: 'Codex',
      tokens: 1200,
    });
    expect(Object.keys(parsed[0])).not.toContain('inputTokens');
    expect(Object.keys(parsed[0])).not.toContain('outputTokens');
    expect(Object.keys(parsed[0])).not.toContain('costEstimateUsd');
    expect(Object.keys(parsed[0])).not.toContain('prompt');
  });

  it('filters and searches table rows predictably', () => {
    const filtered = filterUsageRowsForTable(rows, {
      provider: 'Claude',
      search: 'notes',
      source: 'Claude local logs',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].model).toBe('claude-sonnet-4-6');
  });

  it('sorts table rows by numeric and string columns', () => {
    expect(sortUsageRowsForTable(rows, { desc: true, id: 'tokens' })[0].provider).toBe('Claude');
    expect(sortUsageRowsForTable(rows, { desc: false, id: 'provider' })[0].provider).toBe('Claude');
  });

  it('detects pagination reset when filters change', () => {
    expect(shouldResetPageOnFilterChange({ provider: 'Claude' }, { provider: 'Codex' })).toBe(true);
    expect(shouldResetPageOnFilterChange({ provider: 'Claude' }, { provider: 'Claude' })).toBe(false);
  });
});

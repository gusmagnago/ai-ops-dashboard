import type { ExportFormat, TaskCategory, UsageColumnId, UsageEvent } from './types';

export type UsageExportRow = {
  apiProxyUsd: number;
  category: TaskCategory;
  date: string;
  model: string;
  provider: string;
  source: string;
  tokens: number;
  tokensPerTurn: number;
  turns: number;
  workspace: string;
};

export type TableFilterCriteria = {
  category?: string;
  model?: string;
  provider?: string;
  search?: string;
  source?: string;
  workspace?: string;
};

export type ExportArtifact = {
  content: string;
  filename: string;
  mimeType: string;
};

export type UsageTableSort = {
  desc?: boolean;
  id: UsageColumnId;
};

const exportColumns: Array<keyof UsageExportRow> = [
  'date',
  'provider',
  'model',
  'workspace',
  'category',
  'turns',
  'tokens',
  'tokensPerTurn',
  'apiProxyUsd',
  'source',
];

export const toUsageExportRows = (rows: UsageEvent[]): UsageExportRow[] =>
  rows.map((row) => ({
    apiProxyUsd: Number(row.costEstimateUsd.toFixed(6)),
    category: row.category,
    date: row.date,
    model: row.model,
    provider: row.provider,
    source: row.source,
    tokens: row.tokens,
    tokensPerTurn: row.tokensPerTurn,
    turns: row.turns,
    workspace: row.workspace,
  }));

const serializeValue = (value: unknown): string => {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

export const serializeCsv = (rows: UsageExportRow[]): string => {
  const header = exportColumns.join(',');
  const body = rows.map((row) => exportColumns.map((column) => serializeValue(row[column])).join(','));
  return [header, ...body].join('\n');
};

export const exportUsageRows = (
  rows: UsageEvent[],
  format: ExportFormat,
  now = new Date()
): ExportArtifact => {
  const safeRows = toUsageExportRows(rows);
  const date = now.toISOString().slice(0, 10);
  if (format === 'json') {
    return {
      content: `${JSON.stringify(safeRows, null, 2)}\n`,
      filename: `ai-ops-usage-${date}.json`,
      mimeType: 'application/json',
    };
  }

  return {
    content: `${serializeCsv(safeRows)}\n`,
    filename: `ai-ops-usage-${date}.csv`,
    mimeType: 'text/csv;charset=utf-8',
  };
};

const matches = (value: string, expected?: string): boolean =>
  !expected || expected === 'all' || value === expected;

export const filterUsageRowsForTable = (
  rows: UsageEvent[],
  criteria: TableFilterCriteria
): UsageEvent[] => {
  const search = criteria.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (!matches(row.provider, criteria.provider)) return false;
    if (!matches(row.model, criteria.model)) return false;
    if (!matches(row.workspace, criteria.workspace)) return false;
    if (!matches(row.category, criteria.category)) return false;
    if (!matches(row.source, criteria.source)) return false;
    if (!search) return true;

    return [
      row.date,
      row.provider,
      row.model,
      row.workspace,
      row.category,
      row.source,
      String(row.turns),
      String(row.tokens),
      String(row.costEstimateUsd),
    ].some((value) => value.toLowerCase().includes(search));
  });
};

const sortValue = (row: UsageEvent, id: UsageColumnId): number | string => {
  if (id === 'apiProxy') return row.costEstimateUsd;
  return row[id];
};

export const sortUsageRowsForTable = (
  rows: UsageEvent[],
  sort: UsageTableSort
): UsageEvent[] =>
  [...rows].sort((left, right) => {
    const leftValue = sortValue(left, sort.id);
    const rightValue = sortValue(right, sort.id);
    const direction = sort.desc ? -1 : 1;

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction;
    }

    return String(leftValue).localeCompare(String(rightValue)) * direction;
  });

export const filterSignature = (criteria: TableFilterCriteria): string =>
  JSON.stringify({
    category: criteria.category ?? 'all',
    model: criteria.model ?? 'all',
    provider: criteria.provider ?? 'all',
    search: criteria.search ?? '',
    source: criteria.source ?? 'all',
    workspace: criteria.workspace ?? 'all',
  });

export const shouldResetPageOnFilterChange = (
  previousCriteria: TableFilterCriteria,
  nextCriteria: TableFilterCriteria
): boolean => filterSignature(previousCriteria) !== filterSignature(nextCriteria);

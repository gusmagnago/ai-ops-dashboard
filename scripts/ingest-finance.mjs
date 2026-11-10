#!/usr/bin/env node
// Ingest a finance CSV export into public/data/finance.json.
// Expected headers (any order, case-insensitive):
//   service, budget_eur, actual_eur, category, invoice_status, volatility,
//   month, source, next_action, invoice_link
//
// Rows missing required fields are skipped with a warning.
// The output file is gitignored by default; it is local-only.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

const args = argv.slice(2);
const inputArg = args.find((arg) => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');

if (!inputArg) {
  console.error('Usage: node scripts/ingest-finance.mjs <path-to-csv> [--dry-run]');
  exit(1);
}

const inputPath = resolve(cwd(), inputArg);
const outputPath = resolve(cwd(), 'public/data/finance.json');

if (!existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  exit(1);
}

const parseCsvLine = (line) => {
  const cells = [];
  let buffer = '';
  let insideQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        buffer += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      cells.push(buffer);
      buffer = '';
    } else {
      buffer += char;
    }
  }
  cells.push(buffer);
  return cells.map((cell) => cell.trim());
};

const allowedCategories = new Set(['infrastructure', 'tooling', 'incorporation', 'variable']);
const allowedStatus = new Set(['baseline', 'missing', 'received', 'watch']);
const allowedVolatility = new Set(['fixed', 'medium', 'high']);

const normalizeKey = (key) => key.trim().toLowerCase().replace(/[\s-]+/g, '_');
const toNumber = (value) => {
  const cleaned = String(value ?? '').replace(/[€$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const csv = readFileSync(inputPath, 'utf-8');
const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
if (lines.length < 2) {
  console.error('CSV has no data rows.');
  exit(1);
}

const headers = parseCsvLine(lines[0]).map(normalizeKey);
const entries = [];
let skipped = 0;

for (let index = 1; index < lines.length; index += 1) {
  const cells = parseCsvLine(lines[index]);
  const record = Object.fromEntries(headers.map((header, position) => [header, cells[position] ?? '']));

  if (!record.service || !record.month) {
    skipped += 1;
    continue;
  }

  const category = allowedCategories.has(record.category) ? record.category : 'tooling';
  const invoiceStatus = allowedStatus.has(record.invoice_status) ? record.invoice_status : 'watch';
  const volatility = allowedVolatility.has(record.volatility) ? record.volatility : 'medium';

  entries.push({
    actualEur: toNumber(record.actual_eur),
    budgetEur: toNumber(record.budget_eur),
    category,
    invoiceLink: record.invoice_link || undefined,
    invoiceStatus,
    month: record.month,
    nextAction: record.next_action || '',
    service: record.service,
    source: record.source || 'CSV import',
    volatility,
  });
}

const payload = {
  generatedAt: new Date().toISOString(),
  entries,
};

console.log(`Parsed ${entries.length} entries from ${inputPath}.`);
if (skipped > 0) console.warn(`Skipped ${skipped} malformed rows.`);

if (dryRun) {
  console.log('--dry-run: not writing file.');
  console.log(JSON.stringify(payload, null, 2));
  exit(0);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${outputPath}.`);

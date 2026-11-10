#!/usr/bin/env node
/**
 * Parse billing receipts into public/data/invoices.json.
 *
 * Sources (in priority order):
 *   1. --csv <path>     — CSV pasted from claude.ai or chatgpt billing page.
 *   2. --mbox <path>    — Gmail mbox export filtered to receipts.
 *   3. --html <dir>     — directory of saved HTML receipt files.
 *   4. (no flag)        — reads ~/.ai-ops/invoices/*.{html,eml} if present.
 *
 * The Gmail/MCP path is not invoked here because Vite SPAs can't call MCPs.
 * Either ask Claude Code to run `mcp__claude_ai_Gmail__search_threads` and
 * commit the resulting JSON, or export an mbox via Google Takeout.
 *
 * CSV format (one row per invoice):
 *   provider,plan,date,subtotal,tax,total,currency,receipt_number,description
 *
 * Example:
 *   Claude,Claude Pro,2026-05-11,18.00,4.32,22.32,EUR,2396-7395-5023,Monthly
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '..', 'public', 'data', 'invoices.json');

const args = parseArgs(process.argv.slice(2));

const parsers = {
  csv: parseCsv,
  mbox: parseMbox,
  html: parseHtmlDir,
};

const main = async () => {
  let invoices = [];
  let sources = [];

  for (const [flag, parser] of Object.entries(parsers)) {
    const value = args[flag];
    if (!value) continue;
    try {
      const { invoices: parsed, source } = await parser(value);
      invoices = invoices.concat(parsed);
      if (source) sources.push(source);
    } catch (error) {
      console.error(`Skipping --${flag} ${value}: ${error.message}`);
    }
  }

  if (invoices.length === 0) {
    const defaultDir = path.join(os.homedir(), '.ai-ops', 'invoices');
    try {
      const { invoices: parsed, source } = await parseHtmlDir(defaultDir);
      invoices = invoices.concat(parsed);
      if (source) sources.push(source);
    } catch {
      // ignore
    }
  }

  if (invoices.length === 0) {
    console.error('No invoices parsed. Pass --csv <file>, --mbox <file>, --html <dir>, or add files to ~/.ai-ops/invoices/.');
    process.exitCode = 1;
    return;
  }

  invoices.sort((a, b) => (a.date < b.date ? 1 : -1));

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: sources.length > 0 ? sources : [{ kind: 'csv', label: 'Local ingest' }],
    invoices,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`✓ Wrote ${invoices.length} invoices to ${path.relative(process.cwd(), outputPath)}`);
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;
    const key = flag.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function parseCsv(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const rows = text.trim().split(/\r?\n/);
  const invoices = [];
  for (const row of rows) {
    if (!row || /^provider/i.test(row)) continue;
    const cols = splitCsvRow(row);
    if (cols.length < 6) continue;
    const [provider, plan, date, subtotal, tax, total, currency = 'USD', receipt = '', description = ''] = cols;
    invoices.push({
      provider: provider.trim(),
      planName: plan.trim(),
      description: description.trim() || `${plan.trim()} · receipt`,
      date: normalizeDate(date.trim()),
      amountSubtotal: parseAmount(subtotal),
      amountTaxes: parseAmount(tax),
      amountTotal: parseAmount(total),
      currency: currency.trim().toUpperCase() || 'USD',
      receiptNumber: receipt.trim() || undefined,
      source: 'csv',
      sourceRef: path.basename(filePath),
    });
  }
  return {
    invoices,
    source: { kind: 'csv', label: `CSV: ${path.basename(filePath)}`, lastSync: new Date().toISOString() },
  };
}

function splitCsvRow(row) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

function parseAmount(value) {
  if (typeof value !== 'string') return 0;
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/(?<=\d),(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function normalizeDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

async function parseMbox(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const messages = text.split(/^From .*\n/m).filter(Boolean);
  const invoices = [];
  for (const raw of messages) {
    const parsed = parseAnthropicReceipt(raw) || parseOpenAIReceipt(raw);
    if (parsed) invoices.push(parsed);
  }
  return {
    invoices,
    source: { kind: 'gmail', label: `mbox: ${path.basename(filePath)}`, lastSync: new Date().toISOString() },
  };
}

async function parseHtmlDir(dir) {
  const entries = await fs.readdir(dir);
  const invoices = [];
  for (const entry of entries) {
    if (!/\.(html?|eml|txt)$/i.test(entry)) continue;
    const raw = await fs.readFile(path.join(dir, entry), 'utf8');
    const parsed = parseAnthropicReceipt(raw, entry) || parseOpenAIReceipt(raw, entry);
    if (parsed) invoices.push(parsed);
  }
  return {
    invoices,
    source: { kind: 'gmail', label: `dir: ${dir}`, lastSync: new Date().toISOString() },
  };
}

function parseAnthropicReceipt(raw, ref) {
  if (!/anthropic/i.test(raw)) return null;
  const dateMatch = raw.match(/Date paid[\s\S]{0,200}?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  const totalMatch = raw.match(/Amount paid[\s\S]{0,400}?[€$£]([\d.,]+)/);
  const subtotalMatch = raw.match(/Subtotal[\s\S]{0,200}?[€$£]([\d.,]+)/);
  const taxMatch = raw.match(/(VAT|Tax)[\s\S]{0,200}?[€$£]([\d.,]+)/);
  const receiptMatch = raw.match(/Receipt #([\d-]+)/);
  const currencyMatch = raw.match(/Amount paid[\s\S]{0,400}?([€$£])/);
  const planMatch = raw.match(/(Claude (?:Pro|Max|Team|Enterprise)[^<\n]{0,40})/);
  if (!totalMatch) return null;
  const symbol = currencyMatch?.[1] ?? '€';
  return {
    provider: 'Claude',
    planName: planMatch?.[1]?.trim() ?? 'Claude',
    description: 'Anthropic receipt',
    date: dateMatch ? normalizeDate(dateMatch[1]) : new Date().toISOString().slice(0, 10),
    amountSubtotal: subtotalMatch ? parseAmount(subtotalMatch[1]) : parseAmount(totalMatch[1]),
    amountTaxes: taxMatch ? parseAmount(taxMatch[2]) : 0,
    amountTotal: parseAmount(totalMatch[1]),
    currency: currencySymbolToCode(symbol),
    receiptNumber: receiptMatch?.[1],
    source: 'gmail',
    sourceRef: ref,
  };
}

function parseOpenAIReceipt(raw, ref) {
  if (!/openai|chatgpt/i.test(raw)) return null;
  const dateMatch = raw.match(/(Paid|Date paid)[\s\S]{0,200}?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  const totalMatch = raw.match(/Amount (?:paid|due)[\s\S]{0,400}?[€$£]([\d.,]+)/);
  const planMatch = raw.match(/(ChatGPT (?:Plus|Pro|Team|Enterprise)[^<\n]{0,40})/);
  if (!totalMatch) return null;
  return {
    provider: 'Codex',
    planName: planMatch?.[1]?.trim() ?? 'ChatGPT',
    description: 'OpenAI receipt',
    date: dateMatch ? normalizeDate(dateMatch[2]) : new Date().toISOString().slice(0, 10),
    amountSubtotal: parseAmount(totalMatch[1]),
    amountTaxes: 0,
    amountTotal: parseAmount(totalMatch[1]),
    currency: 'USD',
    source: 'gmail',
    sourceRef: ref,
  };
}

function currencySymbolToCode(symbol) {
  if (symbol === '€') return 'EUR';
  if (symbol === '£') return 'GBP';
  return 'USD';
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

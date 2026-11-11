#!/usr/bin/env node
// Generates public/data/sample-usage.json: one year of synthetic, anonymized
// usage aggregates for the public demo. Deterministic (seeded PRNG), so
// re-running produces an identical file and diffs stay reviewable.
//
// No real data is read. Workspaces are `example/*` placeholders and every
// number is drawn from the ranges below. The app shifts these dates at load
// time so the latest one lands on "today" (see shiftSampleDates in src/data.ts).
//
// Usage: node scripts/generate-sample-usage.mjs

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUTPUT = fileURLToPath(new URL('../public/data/sample-usage.json', import.meta.url));
const END_DATE = '2026-05-25';
const DAYS = 365;
const SEED = 20260525;

// USD per 1M tokens. Mirrors the subset of scripts/ingest-usage.mjs priceTable
// used here (verified 2026-05-27).
const prices = {
  'claude-haiku-4-5': { cacheRead: 0.1, cacheWrite: 1.25, input: 1, output: 5 },
  'claude-opus-4-7': { cacheRead: 0.5, cacheWrite: 6.25, input: 5, output: 25 },
  'claude-sonnet-4-6': { cacheRead: 0.3, cacheWrite: 3.75, input: 3, output: 15 },
  'gpt-5.3-codex': { cacheRead: 0.175, cacheWrite: 0, input: 1.75, output: 14 },
  'gpt-5.4-mini': { cacheRead: 0.075, cacheWrite: 0, input: 0.75, output: 6 },
  'gpt-5.5': { cacheRead: 0.5, cacheWrite: 0, input: 5, output: 30 },
};

// [value, weight]
const models = {
  Claude: [
    ['claude-sonnet-4-6', 6],
    ['claude-opus-4-7', 2],
    ['claude-haiku-4-5', 2],
  ],
  Codex: [
    ['gpt-5.3-codex', 6],
    ['gpt-5.5', 2],
    ['gpt-5.4-mini', 2],
  ],
};

// Names chosen so classifyUsageSession spreads them across categories.
const workspaces = [
  ['example/product-app', 6],
  ['example/backend-api', 4],
  ['example/knowledge-vault', 3],
  ['example/multi-file-refactor', 3],
  ['example/architecture-review', 2],
  ['example/task-triage', 2],
  ['example/pitch-deck', 1],
  ['example/billing-ops', 1],
  ['example/slack-automation', 1],
  ['example/landing-page', 1],
];

// Mulberry32: tiny, fast, good enough for demo data.
const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const random = createRandom(SEED);
const between = (min, max) => min + random() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));
const roundTo = (value, step) => Math.round(value / step) * step;
const pick = (entries) => {
  const total = entries.reduce((acc, [, weight]) => acc + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries.at(-1)[0];
};

const addDays = (isoDate, days) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const estimateCost = (model, { cacheCreationInputTokens, cachedInputTokens, inputTokens, outputTokens }) => {
  const price = prices[model];
  const cost =
    (inputTokens * price.input +
      cachedInputTokens * price.cacheRead +
      cacheCreationInputTokens * price.cacheWrite +
      outputTokens * price.output) /
    1_000_000;
  return Number(cost.toFixed(2));
};

const buildSession = (date, provider, intensity) => {
  const model = pick(models[provider]);
  const interactions = Math.max(2, Math.round(intBetween(4, 28) * intensity));
  const perTurn = model.includes('haiku') || model.includes('mini') ? between(6_000, 14_000) : between(18_000, 45_000);
  const contextTokens = interactions * perTurn;

  const isClaude = provider === 'Claude';
  const cachedInputTokens = roundTo(contextTokens * between(0.35, 0.6), 1000);
  const cacheCreationInputTokens = isClaude ? roundTo(contextTokens * between(0.05, 0.2), 1000) : 0;
  const inputTokens = roundTo(Math.max(contextTokens - cachedInputTokens - cacheCreationInputTokens, 10_000), 1000);
  const outputTokens = roundTo(contextTokens * between(0.06, 0.12), 1000);
  const reasoningOutputTokens = !isClaude && model === 'gpt-5.5' ? roundTo(outputTokens * between(0.15, 0.3), 1000) : 0;

  const tokens = { cacheCreationInputTokens, cachedInputTokens, inputTokens, outputTokens };
  return {
    ...tokens,
    costUsd: estimateCost(model, tokens),
    date,
    interactions,
    model,
    provider,
    ...(reasoningOutputTokens > 0 ? { reasoningOutputTokens } : {}),
    totalTokens: inputTokens + cachedInputTokens + cacheCreationInputTokens + outputTokens,
    workspace: pick(workspaces),
  };
};

const sessions = [];
for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
  const date = addDays(END_DATE, -offset);
  const progress = 1 - offset / (DAYS - 1); // 0 → 1 across the year
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;

  // Usage grows over the year; weekends are light; ~2 weeks of holiday dips.
  const isHoliday = random() < 0.04;
  const intensity = 0.55 + progress * 0.6;
  const count = isHoliday ? 0 : isWeekend ? (random() < 0.35 ? 1 : 0) : intBetween(1, 2 + Math.round(progress * 2));

  // Work drifts from a Codex-leaning split toward Claude over the year.
  const claudeShare = 0.42 + progress * 0.2;
  for (let index = 0; index < count; index += 1) {
    sessions.push(buildSession(date, random() < claudeShare ? 'Claude' : 'Codex', intensity));
  }
}

const payload = {
  generatedAt: `${addDays(END_DATE, 3)}T08:00:00.000Z`,
  pricing: {
    lastVerified: '2026-05-27',
    links: [
      'https://developers.openai.com/api/docs/pricing',
      'https://help.openai.com/en/articles/20001106',
      'https://platform.claude.com/docs/en/about-claude/pricing',
    ],
    sourceNote: 'Sample anonymized data for repository sharing. Run npm run ingest to generate local real aggregates.',
  },
  sources: [
    { available: false, label: 'Claude local logs', path: '~/.claude/projects' },
    { available: false, label: 'Codex local logs', path: '~/.codex/sessions' },
  ],
};

// One session per line keeps the file compact and diffs line-oriented.
const sessionLines = sessions.map((session) => `    ${JSON.stringify(session)}`).join(',\n');
const head = JSON.stringify(payload, null, 2).replace(/\n}$/, '');
const output = `${head},\n  "sessions": [\n${sessionLines}\n  ]\n}\n`;

await writeFile(OUTPUT, output);
console.log(`Wrote ${sessions.length} sessions (${DAYS} days ending ${END_DATE}) to public/data/sample-usage.json`);

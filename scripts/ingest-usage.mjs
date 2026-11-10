import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, watch as watchFs, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

const outputPath = join(process.cwd(), 'public/data/usage.json');

const listJsonlFiles = (root) => {
  if (!existsSync(root)) return [];

  const files = [];
  const walk = (currentPath) => {
    for (const entry of readdirSync(currentPath)) {
      const nextPath = join(currentPath, entry);
      const stats = statSync(nextPath);
      if (stats.isDirectory()) {
        walk(nextPath);
      } else if (entry.endsWith('.jsonl')) {
        files.push(nextPath);
      }
    }
  };

  walk(root);
  return files;
};

const priceTable = {
  // OpenAI API prices checked against official API docs on 2026-05-27.
  // Codex app credit accounting can differ by plan, so these are estimation rates.
  'gpt-5.2-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.3-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5.5': { input: 5, cachedInput: 0.5, output: 30 },
  'gpt-5.4': { input: 2.5, cachedInput: 0.25, output: 15 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 6 },
  'gpt-5.1-codex-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  // Anthropic prices checked against official Claude pricing docs on 2026-05-27.
  'claude-opus-4-7': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-opus-4-6': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-opus-4-5': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-sonnet-4-6': { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3, output: 15 },
  'claude-sonnet-4-5': { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3, output: 15 },
  'claude-haiku-4-5': { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 },
};

const emptyUsage = {
  generatedAt: new Date().toISOString(),
  sources: [],
  sessions: [],
  pricing: {
    sourceNote:
      'Estimates only. Verify against provider dashboards before financial decisions.',
    lastVerified: '2026-05-27',
    links: [
      'https://developers.openai.com/api/docs/pricing',
      'https://help.openai.com/en/articles/20001106',
      'https://platform.claude.com/docs/en/about-claude/pricing',
    ],
  },
};

const toWorkspaceName = (cwd = '') => {
  if (!cwd) return 'unknown';
  return cwd
    .replace(`${homedir()}/`, '')
    .replace(/^\//, '')
    .split('/')
    .slice(-2)
    .join('/');
};

const normalizeModel = (model = '') => {
  const lower = model.toLowerCase();
  if (lower.includes('claude-haiku-4-5')) return 'claude-haiku-4-5';
  if (lower.includes('claude-sonnet-4-6')) return 'claude-sonnet-4-6';
  if (lower.includes('claude-sonnet-4-5')) return 'claude-sonnet-4-5';
  if (lower.includes('claude-opus-4-7')) return 'claude-opus-4-7';
  if (lower.includes('claude-opus-4-6')) return 'claude-opus-4-6';
  if (lower.includes('claude-opus-4-5')) return 'claude-opus-4-5';
  if (lower.includes('gpt-5.3-codex')) return 'gpt-5.3-codex';
  if (lower.includes('gpt-5.2-codex')) return 'gpt-5.2-codex';
  if (lower.includes('gpt-5.5')) return 'gpt-5.5';
  if (lower.includes('gpt-5.4-mini')) return 'gpt-5.4-mini';
  if (lower.includes('gpt-5.4')) return 'gpt-5.4';
  if (lower.includes('gpt-5.1-codex-mini')) return 'gpt-5.1-codex-mini';
  if (lower.includes('gpt-5-mini')) return 'gpt-5-mini';
  return model || 'unknown';
};

const estimateCost = ({ cachedInputTokens = 0, cacheCreationInputTokens = 0, inputTokens = 0, model, outputTokens = 0 }) => {
  const price = priceTable[normalizeModel(model)];
  if (!price) return 0;

  const billableInput = Math.max(inputTokens - cachedInputTokens, 0);
  const cacheWriteRate = price.cacheWrite5m ?? price.input;
  const cacheReadRate = price.cacheRead ?? price.cachedInput ?? price.input;

  const inputCost = (billableInput / 1_000_000) * price.input;
  const cachedCost = (cachedInputTokens / 1_000_000) * cacheReadRate;
  const cacheWriteCost = (cacheCreationInputTokens / 1_000_000) * cacheWriteRate;
  const outputCost = (outputTokens / 1_000_000) * price.output;

  return Number((inputCost + cachedCost + cacheWriteCost + outputCost).toFixed(6));
};

const readJsonl = async function* (filePath) {
  const rl = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(filePath, { encoding: 'utf8' }),
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch {
      continue;
    }
  }
};

const ingestClaude = async () => {
  const root = join(homedir(), '.claude/projects');
  const sessions = [];

  for (const filePath of listJsonlFiles(root)) {
    const buckets = new Map();
    let workspace = 'Claude';

    for await (const item of readJsonl(filePath)) {
      if (typeof item.cwd === 'string') workspace = toWorkspaceName(item.cwd);

      const message = item.message;
      if (!message?.usage || !message?.model || !item.timestamp) continue;

      const date = item.timestamp.slice(0, 10);
      const key = `${date}:${workspace}:${message.model}`;
      const current = buckets.get(key) ?? {
        cachedInputTokens: 0,
        cacheCreationInputTokens: 0,
        date,
        inputTokens: 0,
        interactions: 0,
        model: normalizeModel(message.model),
        outputTokens: 0,
        provider: 'Claude',
        workspace,
      };

      current.inputTokens += message.usage.input_tokens ?? 0;
      current.cachedInputTokens += message.usage.cache_read_input_tokens ?? 0;
      current.cacheCreationInputTokens += message.usage.cache_creation_input_tokens ?? 0;
      current.outputTokens += message.usage.output_tokens ?? 0;
      current.interactions += 1;
      buckets.set(key, current);
    }

    sessions.push(...buckets.values());
  }

  return sessions;
};

// Codex logs carry a `rate_limits` block per turn — the real plan-pressure
// signal for a flat ChatGPT subscription (% of each quota window used). We keep
// only the most recent snapshot. This is aggregate metadata, never prompt text.
const windowLabel = (minutes) => {
  if (minutes === 300) return '5-hour';
  if (minutes === 10080) return 'weekly';
  if (minutes % 1440 === 0) return `${minutes / 1440}-day`;
  if (minutes % 60 === 0) return `${minutes / 60}-hour`;
  return `${minutes}-min`;
};

const toIsoOrNull = (epochSeconds) =>
  typeof epochSeconds === 'number' ? new Date(epochSeconds * 1000).toISOString() : null;

const normalizeRateLimits = (raw, capturedAt) => {
  if (!raw) return null;
  const windows = [];
  for (const id of ['primary', 'secondary']) {
    const w = raw[id];
    if (!w || typeof w.used_percent !== 'number') continue;
    windows.push({
      id,
      label: windowLabel(w.window_minutes),
      usedPercent: w.used_percent,
      windowMinutes: w.window_minutes ?? 0,
      resetsAt: toIsoOrNull(w.resets_at),
    });
  }
  if (windows.length === 0) return null;
  return { provider: 'Codex', planType: raw.plan_type ?? 'unknown', capturedAt, windows };
};

const ingestCodex = async () => {
  const root = join(homedir(), '.codex/sessions');
  const sessions = [];
  let planStatus = null;

  for (const filePath of listJsonlFiles(root)) {
    let currentModel = 'gpt-5.3-codex';
    let workspace = 'Codex';
    const buckets = new Map();

    for await (const item of readJsonl(filePath)) {
      const payload = item.payload ?? {};
      if (item.type === 'turn_context') {
        currentModel = normalizeModel(payload.model ?? currentModel);
        workspace = toWorkspaceName(payload.cwd ?? workspace);
      }

      if (payload.rate_limits && item.timestamp) {
        const snapshot = normalizeRateLimits(payload.rate_limits, item.timestamp);
        if (snapshot && (!planStatus || snapshot.capturedAt > planStatus.capturedAt)) {
          planStatus = snapshot;
        }
      }

      const usage = payload.info?.last_token_usage;
      if (!usage || !item.timestamp) continue;

      const date = item.timestamp.slice(0, 10);
      const key = `${date}:${workspace}:${currentModel}`;
      const current = buckets.get(key) ?? {
        cachedInputTokens: 0,
        cacheCreationInputTokens: 0,
        date,
        inputTokens: 0,
        interactions: 0,
        model: normalizeModel(currentModel),
        outputTokens: 0,
        provider: 'Codex',
        reasoningOutputTokens: 0,
        workspace,
      };

      current.inputTokens += usage.input_tokens ?? 0;
      current.cachedInputTokens += usage.cached_input_tokens ?? 0;
      current.outputTokens += usage.output_tokens ?? 0;
      current.reasoningOutputTokens += usage.reasoning_output_tokens ?? 0;
      current.interactions += 1;
      buckets.set(key, current);
    }

    sessions.push(...buckets.values());
  }

  return { sessions, planStatus };
};

const addCosts = (session) => ({
  ...session,
  costUsd: estimateCost(session),
  totalTokens:
    session.inputTokens +
    session.cachedInputTokens +
    session.cacheCreationInputTokens +
    session.outputTokens,
});

const main = async () => {
  const sources = [
    { label: 'Claude local logs', path: join(homedir(), '.claude/projects'), available: existsSync(join(homedir(), '.claude/projects')) },
    { label: 'Codex local logs', path: join(homedir(), '.codex/sessions'), available: existsSync(join(homedir(), '.codex/sessions')) },
  ];

  const codex = await ingestCodex();
  const sessions = [
    ...(await ingestClaude()),
    ...codex.sessions,
  ]
    .map(addCosts)
    .filter((session) => session.interactions > 0 && session.totalTokens > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const limits = {};
  if (codex.planStatus) limits.codex = codex.planStatus;

  const payload = {
    ...emptyUsage,
    generatedAt: new Date().toISOString(),
    sessions,
    sources,
    limits,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${sessions.length} aggregate rows to ${outputPath}`);
  if (codex.planStatus) {
    const w = codex.planStatus.windows.map((x) => `${x.label} ${x.usedPercent}%`).join(', ');
    console.log(`Codex plan (${codex.planStatus.planType}): ${w}`);
  }
};

// Run once, or stay resident and re-ingest whenever the local logs change.
// Watch mode makes the dashboard feel live: use Codex/Claude, and the next
// fetch in the browser picks up fresh aggregates within a couple of seconds.
const watchMode = process.argv.includes('--watch');

let running = false;
let pending = false;
const run = async () => {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    await main();
  } catch (error) {
    console.error(error);
  }
  running = false;
  if (pending) {
    pending = false;
    void run();
  }
};

if (!watchMode) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  const roots = [
    join(homedir(), '.claude/projects'),
    join(homedir(), '.codex/sessions'),
  ].filter(existsSync);

  await run();

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), 1500);
  };

  for (const root of roots) {
    try {
      watchFs(root, { recursive: true }, schedule);
      console.log(`Watching ${root}`);
    } catch (error) {
      console.warn(`Cannot watch ${root}: ${error.message}`);
    }
  }
  console.log('Watch mode active — re-ingesting on log changes. Ctrl+C to stop.');
}

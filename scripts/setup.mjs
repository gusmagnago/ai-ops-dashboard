#!/usr/bin/env node
// Onboarding wizard for ai-ops-dashboard. Asks a few questions, writes
// ai-ops.config.json, then offers to run the first usage ingest. Modeled on
// `gh auth login`: short, sensible defaults, nothing destructive without a
// confirmation.
//
// Usage:
//   node scripts/setup.mjs            # interactive
//   node scripts/setup.mjs --defaults # accept all defaults, no prompts

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv, cwd, exit, stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { loadConfig, defaultConfig, configPath, contextDir, CONFIG_FILENAME } from './lib/context-config.mjs';

const args = argv.slice(2);
const useDefaults = args.includes('--defaults');

const existing = loadConfig();
const base = existing.hasConfigFile ? existing : defaultConfig();

const rl = useDefaults ? null : createInterface({ input: stdin, output: stdout });

const ask = async (question, fallback) => {
  if (useDefaults || !rl) return fallback;
  const suffix = fallback ? ` (${fallback})` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback;
};

const askYesNo = async (question, fallbackYes = true) => {
  if (useDefaults || !rl) return fallbackYes;
  const hint = fallbackYes ? 'Y/n' : 'y/N';
  const answer = (await rl.question(`${question} [${hint}]: `)).trim().toLowerCase();
  if (!answer) return fallbackYes;
  return answer.startsWith('y');
};

console.log('\nai-ops-dashboard setup\n----------------------');
if (existing.hasConfigFile) {
  console.log(`Found existing ${CONFIG_FILENAME}; values shown as defaults.\n`);
}

// 1. Which assistants -------------------------------------------------------
const providers = [];
if (await askYesNo('Do you use Claude / Claude Code?', base.providers.includes('claude'))) {
  providers.push('claude');
}
if (await askYesNo('Do you use Codex / ChatGPT?', base.providers.includes('codex'))) {
  providers.push('codex');
}
if (providers.length === 0) providers.push('claude');

// 2. Vault path -------------------------------------------------------------
const vaultPath = await ask('Path to your notes vault (Obsidian)', base.vaultPath);
const aiContextDir = await ask('AI-context notes dir (relative to vault)', base.aiContextDir);

// 3. Finance ----------------------------------------------------------------
const currency = await ask('Preferred currency', base.finance.currency);
const digestEmail = await ask('Email for the finance digest (optional)', base.finance.digestEmail);

// 4. Sync targets -----------------------------------------------------------
console.log(
  '\nSync targets receive the shared context index (CLAUDE.md / AGENTS.md files).',
);
console.log(`Current: ${base.syncTargets.join(', ') || '(none)'}`);
let syncTargets = base.syncTargets;
if (await askYesNo('Edit sync targets?', false)) {
  const raw = await ask('Comma-separated file paths', base.syncTargets.join(', '));
  syncTargets = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const config = {
  vaultPath,
  aiContextDir,
  providers,
  syncTargets,
  excludeAreas: base.excludeAreas,
  finance: { currency, digestEmail },
};

// --- write config ----------------------------------------------------------
const path = configPath();
console.log(`\nWriting ${CONFIG_FILENAME}:`);
console.log(JSON.stringify(config, null, 2));

if (await askYesNo('\nSave this config?', true)) {
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`✓ Wrote ${path}`);
  ensureGitignored();
} else {
  console.log('Aborted; nothing written.');
  if (rl) rl.close();
  exit(0);
}

// --- sanity check vault ----------------------------------------------------
if (vaultPath && !existsSync(contextDir(config))) {
  console.warn(`\n⚠ AI-context dir not found yet: ${contextDir(config)}`);
  console.warn('  Sync will skip until the path exists.');
}

// --- offer first ingest ----------------------------------------------------
if (await askYesNo('\nRun the first usage ingest now? (npm run ingest)', true)) {
  if (rl) rl.close();
  const result = spawnSync('node', ['scripts/ingest-usage.mjs'], { stdio: 'inherit', cwd: cwd() });
  exit(result.status ?? 0);
}

console.log('\nDone. Next: `npm run sync` to publish context, `npm run dev` to launch.');
if (rl) rl.close();

// --- helpers ---------------------------------------------------------------
function ensureGitignored() {
  const gitignorePath = resolve(cwd(), '.gitignore');
  if (!existsSync(gitignorePath)) return;
  const content = readFileSync(gitignorePath, 'utf-8');
  if (content.split('\n').some((line) => line.trim() === CONFIG_FILENAME)) return;
  const sep = content.endsWith('\n') ? '' : '\n';
  writeFileSync(gitignorePath, `${content}${sep}${CONFIG_FILENAME}\n`);
  console.log(`✓ Added ${CONFIG_FILENAME} to .gitignore`);
}

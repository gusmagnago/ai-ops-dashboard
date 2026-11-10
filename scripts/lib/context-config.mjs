// Shared config loader for the sync + setup commands.
//
// Config precedence (highest first):
//   1. ai-ops.config.json at the repo root (written by `npm run setup`)
//   2. environment variables (AI_OPS_VAULT_PATH, etc.)
//   3. built-in defaults
//
// The config file is gitignored: it points at local paths and personal
// preferences, never secrets. See ai-ops.config.example.json.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd, env } from 'node:process';

export const CONFIG_FILENAME = 'ai-ops.config.json';

const DEFAULTS = {
  // Absolute path to the Obsidian vault (or any notes root).
  vaultPath: '',
  // Directory, relative to vaultPath, holding the shared AI-context notes.
  aiContextDir: 'AI Context',
  // Which assistants you route work to. Drives wording in synced blocks.
  providers: ['claude', 'codex'],
  // Files that should receive the synced context index. Relative paths are
  // resolved from the repo root; absolute paths are used as-is.
  // Empty by default: syncing into a tracked file (like this repo's CLAUDE.md)
  // would commit your vault paths and note titles. Opt in via `npm run setup`.
  syncTargets: [],
  // Note areas (frontmatter `area:`) kept out of committed index blocks.
  excludeAreas: ['credentials'],
  // Finance digest preferences.
  finance: {
    currency: 'EUR',
    digestEmail: '',
  },
};

export const configPath = () => resolve(cwd(), CONFIG_FILENAME);

const fromEnv = () => {
  const out = {};
  if (env.AI_OPS_VAULT_PATH) out.vaultPath = env.AI_OPS_VAULT_PATH;
  if (env.OBSIDIAN_VAULT_PATH && !out.vaultPath) out.vaultPath = env.OBSIDIAN_VAULT_PATH;
  if (env.AI_OPS_CONTEXT_DIR) out.aiContextDir = env.AI_OPS_CONTEXT_DIR;
  return out;
};

const mergeFinance = (base, override) => ({ ...base, ...(override ?? {}) });

export const loadConfig = () => {
  let fileConfig = {};
  const path = configPath();
  if (existsSync(path)) {
    try {
      fileConfig = JSON.parse(readFileSync(path, 'utf-8'));
    } catch (error) {
      throw new Error(`Could not parse ${CONFIG_FILENAME}: ${error.message}`);
    }
  }

  const merged = {
    ...DEFAULTS,
    ...fromEnv(),
    ...fileConfig,
  };
  merged.finance = mergeFinance(DEFAULTS.finance, fileConfig.finance);
  merged.providers = fileConfig.providers ?? DEFAULTS.providers;
  merged.syncTargets = fileConfig.syncTargets ?? DEFAULTS.syncTargets;
  merged.excludeAreas = fileConfig.excludeAreas ?? DEFAULTS.excludeAreas;
  merged.hasConfigFile = existsSync(path);
  return merged;
};

export const defaultConfig = () => ({ ...DEFAULTS, finance: { ...DEFAULTS.finance } });

// Resolve the absolute path to the AI-context notes directory.
export const contextDir = (config) => resolve(config.vaultPath, config.aiContextDir);

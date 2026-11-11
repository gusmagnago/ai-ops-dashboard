# CLAUDE.md

Brief for any AI coding assistant (Claude Code, Codex, Cursor, etc.) working on this repo.

## Project

AI Ops Dashboard is a local React/Vite console for tracking Claude Code vs Codex usage, subscription-plan pressure, routing decisions, productivity, and personal finance baselines.

Personal tool, released as MIT open source so other Claude+Codex users can adopt it. Treat any change as something a stranger may pull from `main`.

## Privacy Boundary

Preserve aggressively:

- Store only aggregate usage metadata: date, provider, model, workspace, category, token counts, turns, source label, and API-equivalent cost estimate.
- Do not store prompts, outputs, generated text, raw transcript contents, API keys, cookies, Slack secrets, billing tokens, or provider credentials.
- `public/data/usage.json`, `public/data/finance.json`, `public/data/workstreams.json`, `.env`, and `.env.local` are gitignored.
- `public/data/sample-*.json` files are the shareable fallbacks.
- API-equivalent cost is a proxy only. Subscription-plan pressure is the primary budget model.

## Commands

```bash
npm install
npm run setup                           # onboarding wizard → writes ai-ops.config.json
npm run sync                            # publish vault AI-context index into CLAUDE.md/AGENTS.md targets
npm run sync:check                      # CI-friendly: exit 1 if any target is stale
npm run ingest                          # refresh usage aggregates from local logs
npm run ingest:watch                    # re-ingest on log changes; app live-refreshes (poll + focus)
npm run ingest:finance <path-to-csv>    # import a finance CSV
npm run ingest:invoices -- --csv <path> # import billing receipts (CSV, --mbox or --html)
npm run sample:generate                 # regenerate public/data/sample-usage.json (seeded, deterministic)
npm run dev                             # vite on :5197
npm run test                            # vitest
npm run lint                            # eslint, zero warnings
npm run build                           # tsc + vite build
```

## Key Files

- `src/App.tsx` — main app, views, table, settings modal.
- `src/styles.css` — Apple-inspired visual system.
- `src/types.ts` — shared data models.
- `src/engine.ts` — usage filtering, grouping, plan pressure, routing logic, finance/productivity summaries, observed-cost router.
- `src/settings.ts` — V3 settings defaults, migration, persistence, theme application.
- `src/export.ts` — CSV/JSON export and table helpers.
- `src/catalog.ts` — extension/skills catalog and recommendation logic.
- `src/data.ts` — default budgets, sample loaders for finance/workstreams/usage.
- `scripts/ingest-usage.mjs` — local Claude/Codex aggregate ingestion.
- `scripts/ingest-finance.mjs` — finance CSV → JSON ingest.
- `scripts/generate-sample-usage.mjs` — seeded generator for the year of synthetic demo usage.
- `scripts/setup.mjs` — onboarding wizard; writes `ai-ops.config.json` (gitignored).
- `scripts/sync-context.mjs` — indexes vault `ai-context` notes into managed `<!-- ai-ops:context -->` blocks ("Claude teaches Codex").
- `scripts/lib/context-config.mjs` — shared config loader (config file → env → defaults).
- `ai-ops.config.example.json` — template for the local config.
- `README.md` — public-facing guide.
- `CHANGELOG.md` — release notes. Bump `package.json` version + add a section, then run the Release workflow on `main`.

## Design Direction

Apple/macOS/iOS-inspired:

- neutral surfaces, system typography, compact controls, readable hierarchy
- subtle glass/modal treatment only where it helps layering
- blue/tint accents, not green/solar/purple-heavy decoration
- information-dense dashboard, not a marketing hero page
- no decorative gradient/orb/bokeh backgrounds
- visible focus states, keyboard navigability, readable tables, reduced-motion support

## Review Priorities

When making changes, in order:

1. Find bugs, regressions, missing tests, privacy leaks, accessibility issues, or confusing product behavior.
2. Verify exports cannot include raw prompts/outputs/secrets.
3. Inspect table UX, settings modal keyboard behavior, URL filter persistence, mobile layout.
4. Improve only scoped issues that materially help the user test the product.

Avoid broad rewrites unless the review finds a real reason. Don't add backends. Don't add live plugin installation from the browser. Don't fetch from third-party APIs without a user-triggered click.

<!-- ai-ops:context:start -->
_Empty in the public repo. `npm run sync` fills this block locally when CLAUDE.md is listed in your syncTargets; see README → Shared context sync._
<!-- ai-ops:context:end -->

# AI Ops Dashboard

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Stack](https://img.shields.io/badge/stack-React%20%C2%B7%20Vite%20%C2%B7%20TypeScript-007aff)](#tech)
[![Runs locally](https://img.shields.io/badge/runs-locally-34c759)](#privacy)

A local console for anyone who runs **Claude Code** and **Codex** side by side. See your real usage, stay on top of plan pressure, and let your own history decide which agent should handle each new task.

No backend. No telemetry. No data leaves your machine.

## Features

- **Usage at a glance.** Tokens, turns, sessions, and cost-per-day grouped by provider, model, workspace, and category.
- **Plan-pressure proxy.** Know when your Claude Max or ChatGPT Pro usage is approaching the value of paid API credits, before you spill into them.
- **Observed-cost router.** Describe a task and the router looks at your real history per category, then tells you which agent has been cheapest per turn and how much you'd save by routing future work through it.
- **Productivity view.** Active days, sessions per day, top workspaces, heaviest single day, premium-turn ratio — all derived from your own logs.
- **Finance baselines.** Import a CSV of your monthly expenses and track budget vs actual alongside AI spend, in your own currency.
- **Drilldown table.** Search, filter, sort, paginate, toggle columns, export CSV or JSON.
- **Apple-style UI.** Neutral surfaces, light/dark/system theme, ⌘, to open Settings, keyboard-navigable, reduced-motion friendly.

## Install

```bash
git clone https://github.com/gusmagnago/ai-ops-dashboard.git
cd ai-ops-dashboard
npm install
npm run setup       # onboarding wizard (assistants, vault path, finance) — then runs ingest
npm run dev         # http://localhost:5197
```

`npm run setup` is optional but recommended: it walks you through which assistants you use, your notes-vault path, and finance preferences, writes a gitignored `ai-ops.config.json`, and offers to run the first ingest. Prefer to skip it? Run `npm run ingest && npm run dev` directly.

No local Claude or Codex logs yet? The dashboard boots with sample data so you can explore the UI right away.

## Shared context sync

If you keep durable AI-context notes in an Obsidian vault (or any notes folder), `npm run sync` reads the notes flagged `type: ai-context` and writes a compact index into a managed `<!-- ai-ops:context -->` block in your `CLAUDE.md` / `AGENTS.md` files. Claude Code and Codex then share one pointer list, while the full notes stay in the vault and are read on demand — "Claude teaches Codex".

```bash
npm run sync            # write the index into every configured syncTarget
npm run sync -- --dry-run   # preview the block, write nothing
npm run sync:check      # exit 1 if any target is stale (CI / pre-commit)
```

No targets are set by default: add them with `npm run setup`. Prefer files outside public repos, since the index includes your vault path and note titles.

Targets, vault path, and excluded note areas (e.g. `credentials`, kept out by default) are configured in `ai-ops.config.json` — see `ai-ops.config.example.json`. Only titles, one-line summaries, status, and vault paths are written; note bodies and secrets never are.

## Daily workflow

```bash
npm run ingest                          # refresh usage from your local logs
npm run ingest:finance my-budget.csv    # import a finance CSV
npm run dev                             # open the dashboard
```

Want it to feel live? Run `npm run ingest:watch` alongside `npm run dev`. It watches `~/.claude/projects` and `~/.codex/sessions`, re-ingests a couple of seconds after you use either tool, and the dashboard picks up the new aggregates automatically (it re-fetches every 30s and on window focus). No backend, no telemetry — just the local file being rewritten.

Open `http://localhost:5197`, hit **⌘,** (or Ctrl+, on Windows/Linux) to open Settings, pick your currency, plan, and table defaults.

## Configuration

### Files

| Path | Purpose | Tracked in git |
|---|---|---|
| `public/data/usage.json` | Your real ingested usage | no (gitignored) |
| `public/data/finance.json` | Your finance baselines | no (gitignored) |
| `public/data/workstreams.json` | Your current focus areas (optional) | no (gitignored) |
| `public/data/sample-*.json` | Shareable fallbacks that ship with the repo | yes |
| `ai-ops.config.json` | Local setup/sync config (vault path, targets) | no (gitignored) |
| `localStorage` → `ai-ops-settings-v3` | Your in-app preferences | local browser only |

### Finance CSV format

Any column order, case-insensitive headers.

```
service, budget_eur, actual_eur, category, invoice_status, volatility, month, source, next_action, invoice_link
```

- `category`: `infrastructure` · `tooling` · `incorporation` · `variable`
- `invoice_status`: `baseline` · `missing` · `received` · `watch`
- `volatility`: `fixed` · `medium` · `high`

```bash
npm run ingest:finance ~/Downloads/my-finance.csv
```

### Workstreams JSON

Create `public/data/workstreams.json` to replace the sample Productivity card with your own work:

```json
{
  "workstreams": [
    {
      "name": "My current focus",
      "source": "Personal notes",
      "summary": "What this workstream is about.",
      "items": [
        { "label": "Thing to do", "priority": "high", "status": "next" }
      ]
    }
  ]
}
```

Priorities: `urgent` · `high` · `normal` · `life`. Statuses: `done` · `next` · `open`.

## Privacy

- No backend, no telemetry, no analytics, no third-party requests by default.
- The only network call is an optional **Refresh FX rate** button in General — and only when you click it.
- Stored on disk: aggregate rows only — date, provider, model, workspace, token counts, turns, and an API-equivalent cost proxy.
- Never stored: prompts, generated text, transcripts, API keys, cookies, billing tokens, or any secrets.

## Tech

- React 18 + Vite 5 + TypeScript
- TanStack Table v8
- Recharts (lazy-loaded, ~540 KB chunk only when a chart renders)
- Lucide React icons
- Vitest, ESLint

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5197 |
| `npm run build` | Production build to `./dist` |
| `npm run test` | Vitest suite |
| `npm run lint` | ESLint, zero warnings |
| `npm run ingest` | Refresh usage aggregates from `~/.claude` and `~/.codex` |
| `npm run ingest:watch` | Re-ingest on log changes; dashboard live-refreshes |
| `npm run ingest:finance <csv>` | Import a finance CSV |
| `npm run setup` | Onboarding wizard; writes `ai-ops.config.json` |
| `npm run sync` | Publish vault AI-context index into `CLAUDE.md`/`AGENTS.md` |
| `npm run sync:check` | Fail if any sync target is stale |

## Roadmap

- **v4** Settings UX overhaul, currency-aware formatting everywhere, pre-built plan dropdowns, Claude Code skill installer.
- **v5** Tauri desktop app with scheduled ingestion and a menu-bar widget.
- **Later** Cross-AI skill translator (Claude → Codex / ChatGPT / Cursor prompt output).

## Notes

- The API-equivalent cost is a **proxy**. Subscriptions don't itemize, so this number is for plan-pressure awareness, not invoicing.
- Provider pricing is baked into `scripts/ingest-usage.mjs` (last checked 2026-05-27). Update the table when providers change pricing.

## License

MIT © Gustavo Magnago. See [LICENSE](./LICENSE).

# pstack adoption review

Source: [`cursor/plugins/pstack`](https://github.com/cursor/plugins/tree/main/pstack), MIT. Reviewed from the public repository, not from Lauren Tan's private Grok Bot instructions.

## What was imported

- 58 skill directories from `pstack/skills/` into the local Rakazo skill library (`agent_skills`, `source=plugin`, `allSpaces=true`).
- All 24 `principle-*` skills.
- `poteto-mode` including its 23 playbooks and `references/`, plus text scripts where present.
- Imported as local data only; no pstack files were committed to this repository.

Not imported: the three `automations/benny` skills, and the `poteto-agent` / `comment-sicko` subagent definitions. Those need a separate mapping to Rakazo's runtime and are not drop-in compatible.

## Reuse vs. direct copy

| pstack mechanism | What it solves | Reuse in Rakazo | Do not copy directly | Priority |
|---|---|---|---|---|
| Verification skill + control CLI | Agent proves it really ran the app: click, type, a11y tree, screenshots, video, traces, profiles. | High. Build one for Rakazo Web/Electron and one for mobile where applicable. | pstack references Cursor's `control-ui`/`control-cli`; Rakazo needs its own `control-web`/`control-electron` CLI and seed/auth setup. | P0 |
| Feature Map | Compact, searchable map of features and how to reach them; saves context and gives agents a test route. | High. Generate for Rakazo web/Electron, keep in `docs/` or a skill reference. | Do not hand-maintain a giant map; generate it and run a maintenance skill. | P0 |
| `/poteto-mode` + 23 playbooks | Routes a task to investigation, bug-fix, feature, prototype, perf, review, shipping, etc. | Medium-high as design input. Start with 5 playbooks: investigate, bug-fix, feature, prototype, verify. | pstack assumes Cursor slash commands, custom modes, and a single coding agent. Rakazo routes through a dispatcher and specialist bots; playbooks must be rewritten as role prompts/tools. | P1 |
| 24 principles | Concise engineering rules: prove it works, build the lever, model the domain, trust boundaries, etc. | High. Encode the most important ones in `AGENTS.md`, lint rules, and specialist prompts. | Do not inject all 24 into every system prompt. Use a small core + reference-by-name. | P1 |
| `/architect`, `/arena`, `/swarm` | Parallel design candidates, multi-model review, coverage fan-out. | Medium. Useful for design work and verification sweeps. | Requires isolated worktrees/cloud agents and strong token budgets. Rakazo's shared desktop computer cannot safely run parallel writers. | P2 |
| `/show-me-your-work` | Append-only decision log: what was decided, why, evidence, outcome. | High. Keep a task-level ledger and attach it to the task/PR; TSV is optional. | Do not make a second source of truth beside Rakazo tasks/PR comments. | P1 |
| `poteto-agent` / `comment-sicko` | Delegate with a pinned playbook; read-only comment review. | Medium. Map to `run_subagent` and a review specialist. | Rakazo's subagent/fleet runtime differs; imported SKILL files do not create subagent types or spawn behavior. | P1 |
| Cloud agents / worktrees | Isolated machines for parallel coding, app runs, screenshots. | Medium. Use cloud_agent tools or per-bot worktrees. | Rakazo currently runs specialists on one shared desktop computer. Do not promise 20-200 parallel agents without isolation and cost controls. | P2 |
| Cursor Automations / Benny | Triage -> reproduce -> fix -> verify loops triggered by Slack/events. | Medium. Use Rakazo routines, tickets, and bot messages. | Cursor-specific automation runtime, Bugbot, Slack automations, and cloud snapshots are not available here. | P2 |
| Daily 1:1 ops bot | Keeps a bot fleet aligned, reviews playbooks, handles postmortems and onboarding. | High. Add an ops bot that reviews task outcomes and updates shared rules. | It adds LLM cost and a new failure mode; start weekly, not daily. | P1 |
| Shared PR/task board | Tracks CI, review findings, conflicts, and ready-to-review work. | High. Use Rakazo tasks/board; poll every 30 minutes. | Do not require Notion. Avoid auto-merge until review authority is explicit. | P1 |
| Nightly audits | Dead code, bundle size, perf, security, i18n, parity; produces small PRs. | High as a recurring routine. | Start with one audit and a strict diff/token budget; agents can create noise. | P1 |
| P0 urgency routine | Checks a long-running agent every 5 minutes and steers it. | Medium. Useful for truly urgent tasks. | Expensive and easy to overuse; never default. | P2 |
| `/setup-pstack` model routing | Maps code/judgment/review roles to different models. | Low. Rakazo already has per-bot models and thinking levels. | Skill contains Cursor-specific model selection and writes Cursor rules. | Later |
| Slack/Linear/Notion/Datadog evidence queries | `/why` gathers decision history from multiple systems. | Medium once integrations exist. | pstack assumes MCPs that Rakazo has not connected; missing evidence must stay unknown. | Later |
| 2,000 PRs/month, 200 agents | Proof point for deep verification plus parallelism. | Learn the operating principle, not the raw number. | Self-reported; depends on unlimited tokens, Cursor cloud, and a mature fleet. Not a target for this workspace. | — |

## Trade-offs we must not hide

- Rakazo's skill catalog currently injects at most 50 skills alphabetically into the prompt. With 142 user/plugin skills installed, many pstack skills will not be listed unless forced with `/Name` or curated. Importing 58 does not mean every bot sees all 58 descriptions.
- pstack's `disable-model-invocation: true` frontmatter is preserved in the content, but Rakazo does not use that flag to hide skills from the catalog. Principles and playbooks can therefore appear as ordinary skills.
- pstack's relative references like `../<name>/SKILL.md` assume a filesystem. Rakazo stores skill files in the database; `skill_read` can read the stored files, but relative-path resolution is not the same as Cursor's directory layout.
- pstack's scripts are stored as text; they are not installed or executed. Statechart's large test corpus and other binaries were intentionally skipped.
- The three Benny automation skills and the two pstack subagents were not imported; they need a Rakazo-specific design.

## Suggested rollout

1. **P0**: build a Rakazo verification CLI and a `verify` skill for Web/Electron; generate a Feature Map; prove one real end-to-end change with screenshots/video.
2. **P1**: add five playbooks (investigate, bug-fix, feature, prototype, verify), `/show-me-your-work` ledger, a shared task/PR board, and one ops bot.
3. **P1**: add one nightly audit routine with a strict budget.
4. **P2**: add `/architect` and `/swarm` only after per-bot/cloud isolation works.
5. **Do not** optimize for agent count or PR count. Optimize for verified outcomes per human review minute.

## Source

- https://x.com/poteto
- https://x.com/poteto/article/2094457600259842065
- https://x.com/poteto/article/2097732320606507506
- https://x.com/poteto/article/2069824386283319343
- https://x.com/poteto/article/2058975157503570132
- https://x.ai/bot/guides/grok-bot-for-engineering
- https://github.com/cursor/plugins/tree/main/pstack

## Implementation status (2026-11-04)

Done locally:

- Added a pstack operating block to all 11 existing bot Instructions; added Ops 管家 with its own playbook/1:1/postmortem rules.
- Added `scripts/verify-rakazo.mjs` and `docs/feature-map.md`; exposed `pnpm verify`.
- Added task-board and verification-gate rules to dispatcher and code agents.
- Created two paused Ops routines: task-board sweep every 30 minutes and nightly audit at 03:00 Asia/Shanghai. They are inactive by default.

Still pending:

- Project-specific verify CLIs and feature maps for repos other than Rakazo.
- Actual task-board automation and low-risk auto-merge policy; current rule is manual review with evidence.
- Per-bot worktrees/cloud isolation for parallel writers.
- Enabling the paused routines after a token/budget decision.

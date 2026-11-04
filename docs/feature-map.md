# Rakazo feature map

Use this with `scripts/verify-rakazo.mjs` before claiming a UI or behavior change works. It lists where a feature lives and the cheapest real verification path.

## Chat and transcript

- Shell/route: `apps/web/src/pages/Shell.tsx`, `apps/web/src/pages/shell/use-shell-navigation.ts`
- Transcript: `apps/web/src/pages/shell/transcript.tsx`, `message-view.tsx`, `chat-context.tsx`
- Composer: `apps/web/src/pages/shell/composer.tsx`, `use-composer-actions.ts`
- Live run state: `packages/core/src/events.ts`, `apps/web/src/lib/thread-events.ts`
- E2E: `apps/web/e2e/chat-header.spec.ts`, `chat-progress-messages.spec.ts`, `message-quote.spec.ts`, `message-jump.spec.ts`, `tool-activity.spec.ts`
- Verify: open `/app/<botId>`, send a message, confirm streaming text/reasoning/tool evidence and final reply.

## Bots and instructions

- Settings panel: `apps/web/src/pages/shell/bot-panel.tsx`, `apps/web/src/components/InstructionSettings.tsx`
- API: `apps/api/src/routes/bots.ts`, `apps/api/src/agent-skills.ts`
- Storage: `bots.instructions`, `bots.instructionHistory`
- E2E: `apps/web/e2e/bot-crud.spec.ts`, `new-bot-ux.spec.ts`, `readable-names.spec.ts`
- Verify: edit Instructions, blur, reopen, confirm persistence and history.

## Skills, memory, knowledge

- Skills: `apps/web/src/pages/KnowledgeSection.tsx`, `apps/api/src/agent-skills.ts`, `packages/adapters/src/skill-tools.ts`
- Memory: `packages/adapters/src/run-tools-memory.ts`, `packages/adapters/src/markdown-vault-memory-provider.ts`
- E2E: `apps/web/e2e/knowledge-panel.spec.ts`
- Verify: `skill_read` a named skill and one reference file; `kb_search` returns paths.

## Routines, tickets, board

- Routines: `apps/web/src/pages/RoutineEditor.tsx`, `apps/api/src/routes/routines.ts`
- Tickets/board: `apps/web/src/pages/Board.tsx`, `apps/api/src/routes/tickets.ts`
- E2E: `routine-crud.spec.ts`, `routine-execution.spec.ts`, `board.spec.ts`
- Verify: create a small routine/ticket, run/transition it, inspect history.

## Computer and providers

- Web UI: `apps/web/src/pages/shell/computer-panel.tsx`, `computer-view.tsx`, `use-computer.tsx`
- Provider: `packages/adapters/src/computer-lifecycle.ts`, `sandbox-factory.ts`
- E2E: `team-computer.spec.ts`, `computer-boot-leave.spec.ts`, `computer-update.spec.ts`
- Verify: run `shell` `pwd`, then `ls` and a screenshot; confirm host/provider state via `/internal/health`.

## Settings and integrations

- Models: `apps/web/src/pages/ModelSettingsOverlay.tsx`, `packages/adapters/src/run-model.ts`
- Voice: `apps/web/src/pages/VoiceSettingsOverlay.tsx`
- Messaging/email/MCP: `apps/web/src/pages/MessagingSettingsPanel.tsx`, `McpServersOverlay.tsx`
- E2E: `model-settings.spec.ts`, `model-header-discovery.spec.ts`, `messaging-settings.spec.ts`, `mcp-agents.spec.ts`

## Verification commands

```bash
node scripts/verify-rakazo.mjs doctor
node scripts/verify-rakazo.mjs screenshot http://127.0.0.1:5173/app/<botId> /tmp/proof.png
node scripts/verify-rakazo.mjs test packages/core/src/events.test.ts
node scripts/verify-rakazo.mjs e2e chat-header.spec.ts
node scripts/verify-rakazo.mjs check
```

Desktop E2E opens real Electron windows and steals focus on macOS. Do not run it as routine local verification; prefer web E2E and unit tests, and let CI run the desktop suite.

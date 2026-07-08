# RELEASE-RUNBOOK — loop hook-unblock (T6, GATE-HUMANO)

> Preparado em 2026-07-07. NADA aqui foi executado: bump, commit em main, tag,
> publicação e cache são decisões do operador. As mudanças do loop vivem na
> branch `loop/hook-unblock` (base: checkpoint S1 `df8d8b8` sobre `main`).

## O que este release conteria (v8.22.0 proposto, MINOR)

Pacote "hook-unblock" — 5 correções anti-deadlock/anti-atrito no enforcement,
cada uma com teste de regressão em `tests/regression/v8.22.0/`:

| Task | Mudança | Arquivos | Teste |
|---|---|---|---|
| T1 | Isenção "já despachado" no predicado de pendência viva (pendingAlreadyDispatched + dispatchTargetMatches; libera os 3 consumidores) | `.claude/hooks/edit-guard-hook.cjs` | F1 (11 cenários) |
| T2 | Isenção ANCORADA do plano de controle exec-window (open/close.cjs; anti-injeção) | `.claude/hooks/dispatch-pending-gate.cjs` | F2 (11) |
| T3 | Limpeza determinística de pending_blocks no retorno do subagente (clearSatisfiedPending, PostToolUse) | `.claude/hooks/step-ledger-stamp.cjs` | F3 (7) |
| T4 | Anti-falso-timeout: pending com DISPATCH_RESULT registrado no protocol-events é RESOLVIDO (pendingResolvedByEvents; gates + varredura do cleanup) | `.claude/hooks/edit-guard-hook.cjs`, `.claude/hooks/cleanup-orphan-sentinel-state-hook.cjs` | F4 (7) |
| T5 | Carimbo 'tdd' por evidência (TDD_APPROVAL em gate-decisions → concede + persiste + rastro STEP_STAMP_BY_EVIDENCE) | `.claude/hooks/step-ledger-gate.cjs` | F5 (5) |

Iron Law preservada: só `.claude/hooks/` + `tests/` (+ pasta do loop); Mandatory
Gates table e Gate Registry INTOCADAS (STEP_STAMP_BY_EVIDENCE é evento AUDIT em
protocol-events, não gate). Sem espelho `.codex` (esses hooks não espelham).

## Passo 0 — merge + bump lockstep (antes de qualquer canal)

1. Revisar os commits da branch `loop/hook-unblock` (diff completo) e mergear em `main`.
2. Bump lockstep em TODAS as superfícies (ver CLAUDE.md do repo, seção Release/Deploy):
   `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (version + `source.ref`),
   `.cursor-plugin/plugin.json`, `package.json` (version + description), `lib/index.cjs`,
   `hooks/hooks.json` (banner "vX loaded"), `README.md` (badge), `CLAUDE.md` (linha
   `Atualmente:` + nova linha na tabela), `CHANGELOG.md` (nova entrada).
3. Os 3 pinos de versão em testes: `tests/regression/v7.1.0/F7_version_sync.cjs` (VERSION/PREV),
   `tests/regression/v8.5.0/F6-registration-lockstep.test.cjs` (VERSION),
   `tests/regression/v8.8.0/F01_refactor_slice1.cjs` (PINNED_VERSION).
4. NÃO tocar `.claude/hooks/enforcement-surface-verify-hook.cjs` (os números lá são
   comentários de proveniência histórica).
5. `node scripts/run-tests.cjs` — baseline esperado: 8 falhas pré-existentes
   (3 Langfuse v7.3.0 + score-writer v7.6.0 + F4 v8.8.0 + 3 RED congelados v8.21.0 da
   fatia S2) + F07 v7.13.0 ocasionalmente flake sob suíte cheia (passa isolado).

## Os 4 canais (nesta ordem — pular um deixa o release pela metade)

1. **GitHub canônico** — commit + `git tag v8.22.0` + push de `main` e da tag.
2. **Cache global (o passo sempre esquecido)** — instalar a versão nova em
   `~/.claude/plugins/cache/FX-Studio-AI/pipeline-orchestrator/8.22.0/` e apontar
   `~/.claude/plugins/installed_plugins.json` (installPath/version/lastUpdated/gitCommitSha).
   É isto que faz o Claude Code carregar a versão nova em qualquer projeto.
3. **NPM** — `npm publish` de `@fx-studio-ai/pipeline-orchestrator` (token granular com
   Bypass 2FA obrigatório).
4. **Marketplace** — no clone `~/.claude/plugins/marketplaces/FX-Studio-AI`, editar
   `.claude-plugin/marketplace.json` (version + `source.ref` → `v8.22.0`) + commit + push.

Depois de tudo: `/reload-plugins` na sessão do Claude Code.

## Notas de risco para a revisão humana

- T1+T4 mudam o predicado `findLivePendingBlock`, consumido por 3 bloqueadores —
  os lados de BLOQUEIO estão pinados por F1 S2-S6/S11, F4 E2-E5 (postura fail-closed
  e tamper intocados), mas vale revisão humana do diff.
- T5 concede um passo por evidência de gate-decisions.jsonl (arquivo não-assinado):
  quem consegue escrever nele já consegue muito mais (é o mesmo piso cooperativo
  documentado do enforcement, cf. v8.15.0 LIMITAÇÃO CONHECIDA). PIPELINE_HMAC_STRICT
  não cobre gate-decisions; se isso incomodar, condicionar a evidência a
  PIPELINE_HMAC_STRICT=off ou exigir assinatura futura do log.
- Os hooks VIVOS rodam do cache instalado — nada desta branch muda o enforcement
  em execução até o canal 2 ser feito.

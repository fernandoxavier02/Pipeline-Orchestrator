# Tasks — Pipeline Orchestrator Paperclip (PIP) v0.2

**Status:** Draft v0.2 (revised after adversarial review loop 1, 22 findings)
**Date:** 2026-05-24
**Depends on:** `01-requirements.md`, `02-design.md` v0.2
**Scope:** v1.0 release.
**Methodology applied:** TDD-first per slice, ATDD acceptance criteria rastreadas pra design Sec X.Y, adversarial review por slice, regression tests acumulados.

**Revision notes vs v0.1.** Adversarial trouxe 22 findings. Mudanças estruturais nesta v0.2: (1) adicionada Slice 0 Spike pra resolver Q1/Q2/Q7/Q8/Q9 ANTES de qualquer código; (2) adicionada Slice 3 Cross-cutting infrastructure (secrets, logger, errors); (3) Execution state machine (Slice 7) limitada aos estados upstream do adversarial — slices 9 e 10 estendem a máquina retroativamente; (4) Slice 12 (original) quebrada em 13 (UI) e 14 (docs+publish); (5) DoD agora exige "TODOS os testes do projeto" verdes, não só os da slice; (6) Iron Law CI especificado com critério verificável (import paths + git remote + package.json deps); (7) ATDD agora cita seção exata do design; (8) variant matrix test parametrizada em slices que filtram por variant; (9) testes de concorrência adicionados pra state machine; (10) sanitização de diff_content + immutability test; (11) ownership do hash chain clarificado (Slice 4 implementa primitiva, Slice 12 subscriber/tool); (12) verdict policy explícita pra HIGH/CRITICAL open; (13) mock auth + clock pra waiver testing; (14) seção "Stop conditions" definindo o que fazer se DoD falhar.

**Erratum sobre o design.** Achado F1 + F21 do adversarial requerem atualização do design `02-design.md` Sec 3.4: adicionar coluna `schema_version_at_creation INTEGER NOT NULL` à tabela `runs`. Será aplicado antes da Slice 1 começar (parte do escopo da Slice 0).

---

## Contrato de execução por sprint e slice vertical

Para este plano, **1 sprint = 1 semana útil de trabalho focado**. Todas as tasks abaixo passam a obedecer ao seguinte contrato:

1. **Toda slice é quebrada em 1..N sprints.** O objetivo do sprint é sempre produzir um incremento integrado e verificável do slice, nunca apenas output intermediário solto.
2. **O próximo sprint só começa com o sprint atual limpo.** Isso significa: checkpoint verde, review adversarial sem findings/blockers abertos e regressão promovida.
3. **Toda sprint termina em loop adversarial.** Sequência obrigatória:

   ```text
   DDD boundary check
     -> ATDD acceptance lock
     -> BDD scenarios aprovados
     -> TDD RED -> GREEN -> REFACTOR
     -> checkpoint (build + tests)
     -> adversarial review
     -> fix
     -> re-checkpoint
     -> re-review
     -> regression promotion
   ```

4. **Finding corrigido gera teste.** Sempre que o loop adversarial encontrar bug, drift de contrato ou gap de comportamento, a correção só conta como concluída depois que existir teste de regressão cobrindo o caso.
5. **Slice vertical fecha com review total do slice.** Após o último sprint de um slice, roda-se uma revisão adversarial ampla do slice inteiro + suite completa de regressão do projeto. Só então a slice pode ser marcada como done.
6. **ATDD, BDD, TDD e DDD não são opcionais.**
   - **DDD**: define fronteiras e contratos antes de editar.
   - **ATDD**: trava o alvo aceito do sprint/slice.
   - **BDD**: descreve comportamento em Given/When/Then.
   - **TDD**: implementa via RED -> GREEN -> REFACTOR.
7. **Tudo acumula em regressão.** Ao fechar um slice, seus cenários aceitos e seus achados relevantes devem estar refletidos na suite de regressão acumulada.

### Template padrão de sprints por slice

Cada slice abaixo herda este template e pode ajustar a quantidade de sprints:

| Sprint | Objetivo | Saída obrigatória |
|---|---|---|
| Sprint A | Contrato do slice | DDD boundaries validadas + ATDD + BDD aprovados |
| Sprint B..N-1 | Implementação incremental | testes RED/GREEN, diff mínimo, checkpoint verde, adversarial limpo |
| Sprint N | Fechamento do slice | review total do slice, regressão acumulada verde, docs/rastreabilidade atualizadas |

## Visão geral do v1.0

| Fase | Slices | Foco | Esforço estimado |
|---|---|---|---|
| **0 — Spike** | 0 | Resolver Q1, Q2, Q7, Q8, Q9 do design | 1 semana |
| **A — Fundação** | 1, 2, 3, 4 | Scaffold, eventos, cross-cutting, DB | 4 semanas |
| **B — Domínio central** | 5, 6, 7, 8 | Workspace, Classification, Execution (upstream), TDD | 5-6 semanas |
| **C — Revisão + validação** | 9, 10, 11 | Adversarial (+ state machine extension), Fix Loop (+ extension), Validation | 4 semanas |
| **D — Observabilidade + ship** | 12, 13, 14 | Audit chain + UI + publish | 4-5 semanas |
| **Total v1.0** | **14 slices** | | **18-20 semanas** (~4.5 meses solo) |

**Equivalência de planejamento:** neste documento, **1 semana = 1 sprint**. Logo, o plano completo estima **18-20 sprints**, distribuídos entre 14 slices verticais.

**Importante:** v0.1 estimava 12-14 semanas. v0.2 estima 18-20 semanas após adversarial review surfacar gaps. Buffer de 30% adicionado a Slices críticas (7 e 13).

**Iron Law deste projeto:** zero importação, dependência ou compartilhamento de código com o plugin Claude Code original (`pipeline-orchestrator` v7.x em D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator). Verificado em CI por três checagens objetivas (Sec "Iron Law enforcement" abaixo).

---

## Iron Law enforcement (Sec dedicada, F4)

CI da PIP roda três checks pra garantir HC1:

1. **Import paths check** — scan recursivo de todo `src/` por imports/requires que contenham strings: `pipeline-orchestrator`, `@fx-studio-ai/pipeline-orchestrator`, qualquer path absoluto `D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/`. Falha se encontrar qualquer um.
2. **Package deps check** — parse `package.json` + lockfile, falha se houver dep direta ou transitiva em `@fx-studio-ai/pipeline-orchestrator` ou qualquer pacote nesse namespace exceto `@fx-studio-ai/pipeline-orchestrator-paperclip` (este).
3. **Git remote check** — `git remote -v` deve mostrar remote diferente do plugin original. Repos compartilham namespace `fx-studio-ai` mas slug deve ser diferente.

**Não é check de overlap de arquivos** — REPOS PODEM ter `package.json`, `README.md`, `LICENSE`, `tsconfig.json` com nomes iguais. O check é sobre *acoplamento*, não nomenclatura.

Script: `scripts/iron-law-check.sh`. Workflow: `.github/workflows/iron-law-check.yml` (rodando em todo push + PR).

---

## Stop conditions (NEW, F14)

O que fazer se uma slice falha:

| Situação | Ação |
|---|---|
| DoD não atinge após 2 tentativas | STOP. Re-spec da slice. Avaliar se requirements mudaram |
| Estimativa estourou 50% | Re-estimar restante das slices. Comunicar slippage |
| Test regression de slice anterior quebra | Imediato STOP. Bisect pra identificar slice culpada. Revert se necessário |
| Migration aplicada em dev precisa rollback | Usar `docs/migrations/NNN_rollback.sql` (cada migration carrega seu rollback opcional) |
| Q-aberto bloqueia progress | Pausar slice, abrir issue no Paperclip GitHub, escalar |
| Adversarial loop sem convergir após 3 ciclos | NÃO avançar de sprint. Abrir re-design formal da sprint/slice, corrigir o plano e permanecer no mesmo slice até zerar blockers |

---

## Side tracks paralelizáveis (NEW, F12)

Trabalho que NÃO bloqueia slice em curso e pode ser feito em paralelo:

- Markdown de `agents/*.md` e `skills/*/SKILL.md` (texto puro, sem código) — pode ser draftado em qualquer momento após Slice 0
- `docs/architecture.md`, `docs/user-guide.md` — escrita contínua a partir da Slice 1
- Iron Law CI workflow (Slice 1 entrega) — pode ser implementado em qualquer momento após Slice 0
- Fixtures de teste (mock LLM responses, mock Paperclip events) — coletadas continuamente
- Screenshots e demos pra README — quando UI funcional na Slice 13

---

## Slice 0 — Spike: Resolver questões abertas do design (NEW, F15+F17)

**Goal end-to-end.** Cinco questões abertas do design resolvidas com evidência (código de prova, doc de SDK ou resposta do time Paperclip). Decisões registradas em `docs/spike-results.md`. Slice 1 fica desbloqueada.

**Questões a resolver.**

| ID | Pergunta | Como resolver | Bloqueia |
|---|---|---|---|
| Q1 | Forma exata da API `plugin.db.query()` — sync, async, callback? | Ler SDK source, escrever exemplo mínimo, testar | Slices 1-14 (schema design) |
| Q2 | `ui.detailTab.register` injection mechanism — quais props recebe componente React? | Ler scaffolder output, exemplo do Paperclip | Slice 13 |
| Q7 | Paperclip suporta git worktrees nativos? | Ler docs Paperclip, perguntar no Discord/GitHub | Slice 5 (Workspace fallback) |
| Q8 | Backend do plugin DB — SQLite ou Postgres? | Ler docs Paperclip + ver default em scaffolder | Slice 1, 4 (schema) |
| Q9 | Mecanismo nativo de "second approver" no Paperclip pra waiver de CRITICAL? | Ler docs sobre roles/permissions, abrir issue se ausente | Slice 11 |

**Validação adicional do harness.**
- Instalar `@paperclipai/plugin-test-harness`
- Validar capacidades: mock de events, mock de db, mock de sub-issues, integração com instância Paperclip real
- Se harness insuficiente: bootstrar Paperclip local em CI (estimar custo)

**Files to create.**
- `docs/spike-results.md` — decisões consolidadas com evidência
- `spike/` (folder temporário com código de prova, dispensável após slice 1)

**Dependencies.** Nenhuma.

**DoD.**
- [ ] Todas 5 Qs respondidas com evidência (link/quote/exemplo)
- [ ] Harness validado ou plano-B documentado
- [ ] Doc `docs/spike-results.md` reviewable
- [ ] Design `02-design.md` Sec 3.4 atualizado com `schema_version_at_creation` na tabela `runs` (correção F21)

**Risks.** Q1 ou Q8 pode requerer fork de design fundamental. Stop condition: se Q1 forçar paradigma diferente (ex: callback-only), pausar e re-spec.

**Effort.** 1 semana.

---

## Fase A — Fundação

### Slice 1 — Repo scaffold + manifest + migrations infrastructure

**Goal end-to-end.** Plugin instalável: `pnpm paperclipai plugin install` funciona, worker inicializa, migration 001 cria 9 tabelas (incluindo `schema_migrations`), plugin aparece como instalado. Iron Law CI configurado.

**Resolve.** Implementa decisões da Slice 0.

**ATDD scenarios.** Implementa `02-design.md` Sec 3.3 (lifecycle) + Sec 3.4 (schema) + Sec 3.5 (migration policy parcial).

```gherkin
Scenario: Fresh install creates 9 tables
  Given um workspace Paperclip sem plugin instalado
  When eu rodo "pnpm paperclipai plugin install @fx-studio-ai/pipeline-orchestrator-paperclip"
  Then plugin aparece em "installed plugins"
  And worker lifecycle log mostra "install → init → ready"
  And schema_migrations contém row version=1, name='initial', applied_at preenchido
  And as 9 tabelas (schema_migrations, runs, workspaces, phases, batches, diff_snapshots, gate_decisions, findings, waivers) existem com schemas conforme 02-design.md Sec 3.4

Scenario: Reinstall preserves state
  Given plugin instalado com 1 Run no DB
  When re-instalo (sem upgrade)
  Then Run continua inalterado
  And lifecycle log mostra "init → ready" (sem install)

Scenario: Upgrade pauses active runs (F9)
  Given plugin v1.0.0 com 2 Runs state=active
  When upgrade pra v1.0.1 (que adiciona migration 002)
  Then antes de aplicar migration, Runs viram state=paused
  And após sucesso, Runs com schema_version_at_creation compatível voltam a state=active
  And Runs incompatíveis viram state=aborted reason='schema_migration_incompatible'

Scenario: Migration failure rolls back transaction
  Given migration 003 com SQL inválido
  When upgrade tentar aplicar
  Then transação rola, schema_migrations não recebe row 003
  And plugin reporta erro de upgrade
  And Runs permanecem state=paused (não voltam pra active)

Scenario: Iron Law CI verde
  Given push no repo PIP
  When CI roda
  Then iron-law-check job passa: zero imports do Claude plugin, zero deps no namespace original, git remote distinto
```

**TDD plan (red → green).**
1. `tests/unit/manifest.test.ts` — valida `plugin.json` contra schema PaperclipPluginManifestV1 (apiVersion=1, name, version "1.0.0", todas 11 capabilities da Sec 3.2)
2. `tests/integration/install-flow.test.ts` — usa harness pra simular install, valida `schema_migrations` + 9 tabelas
3. `tests/integration/reinstall-preserves-state.test.ts` — preserve test
4. `tests/integration/upgrade-pauses-runs.test.ts` (NEW, F9) — runs ativos pausam antes, retomam compatíveis, abortam incompatíveis
5. `tests/integration/migration-rollback.test.ts` (NEW, F9) — migration falha → transação rolba
6. `tests/unit/migration-loader.test.ts` — ordering, idempotência, reapply no-op
7. `tests/unit/iron-law-check.test.ts` (NEW, F4) — script detecta violações em fixtures (import sintético, dep sintética)

**Files to create.**
- `package.json`, `tsconfig.json`, `plugin.json`
- `src/worker.ts`
- `src/db/migrations/001_initial.sql` (9 tabelas + indexes da Sec 3.4 + `runs.schema_version_at_creation` post-Spike correction)
- `src/db/migration-loader.ts`, `src/db/schema-version.ts`
- `scripts/iron-law-check.sh`
- `.github/workflows/ci.yml`, `iron-law-check.yml`
- `README.md`, `LICENSE` (Apache-2.0)

**Dependencies.** Slice 0.

**DoD.**
- [ ] CI verde — TODOS os testes do projeto incluindo regressão (F13)
- [ ] Doc `docs/setup.md`
- [ ] Iron Law CI verde sob 3 fixtures sintéticas (violação detectada + sem violação aprovado)
- [ ] `pnpm paperclipai plugin verify` passa

**Risks.**
- Harness limitations descobertas na Slice 0 podem forçar refator
- Migration rollback de SQLite tem limitações (DDL não transaciona em algumas versões)

**Effort.** 1.5-2 semanas.

---

### Slice 2 — Event bus wrapper + canonical types + dedup

**Goal end-to-end.** Worker publica e subscribe a events. Idempotência via `dedup_key`. Convenção `gate_metadata` documentada.

**ATDD.** Implementa `02-design.md` Sec 2 Context 6 (GateDecisionLog convention) + Sec 5 D4 (dedup).

```gherkin
Scenario: Subscribe + receive
  Given worker rodando
  When publico evento de teste "ping" via plugin event bus
  Then worker recebe (handler invocado)

Scenario: Dedup_key prevents replay
  Given handler que cria Sub-Issue ao receber BatchStarted
  When mesmo BatchStarted (mesmo dedup_key) chega 3 vezes
  Then apenas 1 Sub-Issue criada, 1 row de Batch
```

**TDD plan.**
1. `tests/unit/event-types.test.ts` — types em `src/events/types.ts` cobrem todos eventos do design (Sec 2 enumera ~25)
2. `tests/unit/event-bus.test.ts` — publish/subscribe/unsubscribe/error handling
3. `tests/integration/dedup-key.test.ts` — N publishes mesmo dedup_key, 1 efeito
4. `tests/unit/gate-metadata.test.ts` — schema canônico (gate_name, hardness, decided_by required)
5. `tests/integration/concurrent-publish.test.ts` (NEW) — 100 publishes concorrentes mesmo dedup_key

**Files.**
- `src/events/types.ts`, `bus.ts`, `gate-metadata.ts`, `dedup-store.ts`

**Dependencies.** Slice 1.

**DoD.**
- [ ] CI verde com todos testes do projeto
- [ ] Doc `docs/events.md` com catálogo
- [ ] Race test estável (sem flake em 10 runs)

**Effort.** 1 semana.

---

### Slice 3 (NEW) — Cross-cutting infrastructure: secrets, logger, errors (F11)

**Goal end-to-end.** Wrappers reusáveis pra (a) Paperclip secrets API; (b) structured JSON logger com correlation_id auto-injetado; (c) typed error hierarchy. Slices subsequentes consomem em vez de improvisar.

**ATDD.** Implementa `02-design.md` Sec 7.2 (secrets) + Sec 7.4 (logging).

```gherkin
Scenario: Secret retrieval
  Given Paperclip workspace tem secret "OPENAI_API_KEY" configurado
  When código chama secrets.get("OPENAI_API_KEY")
  Then retorna valor; cache em memória pra evitar repeat IPC
  And nunca loga o valor

Scenario: Logger injects correlation_id
  Given handler processando event com correlation_id="abc123"
  When handler chama logger.info("processed batch", {batch_id: "x"})
  Then log line contém correlation_id="abc123" automaticamente

Scenario: Typed errors
  Given operação que falha por workspace lock conflict
  When tentativa
  Then throw new WorkspaceLockConflictError(...) com fields tipados (repo_url, base_branch, conflicting_run_id)
  And error é serializable (toJSON) pra event payload
```

**TDD plan.**
1. `tests/unit/shared/secrets.test.ts` — get/cache/refresh, never-log invariant
2. `tests/unit/shared/logger.test.ts` — JSON output, correlation_id auto-injection, log levels filter
3. `tests/unit/shared/errors.test.ts` — hierarchy (PIPError → categorias), toJSON, instanceof checks

**Files.**
- `src/shared/secrets.ts`
- `src/shared/logger.ts`
- `src/shared/errors.ts` (PIPError + WorkspaceLockConflictError, ClassificationRejectedError, BatchTransitionInvalidError, etc.)

**Dependencies.** Slices 1, 2.

**DoD.**
- [ ] CI verde
- [ ] Doc `docs/cross-cutting.md`

**Effort.** 1 semana.

---

### Slice 4 — DB access layer + hash-chain primitive (F10 clarified)

**Goal end-to-end.** API tipada pra 9 tabelas. Hash-chain primitiva (helper + verify) implementada. Slice 12 vai consumir essa primitiva pra subscriber + CLI tool — NÃO duplicar lógica.

**ATDD.** Implementa `02-design.md` Sec 3.4 (schema) + Sec 5 D9 (hash chain).

```gherkin
Scenario: Typed access to runs
  Given DB com 3 Runs
  When invoco runsRepo.findActive()
  Then array tipado de Run state=active

Scenario: DiffSnapshot immutability (NEW, F22)
  Given diff snapshot inserido com id X
  When tento update via repo
  Then erro DiffSnapshotImmutableError lançado
  And DB row inalterado

Scenario: Hash-chain valid
  Given gate_decisions vazia
  When inserto 5 entries via gateDecisionsRepo.append() pra mesmo run_id
  Then cada this_hash = SHA256(sequence||gate_name||decision||decided_by||timestamp||prev_hash||rationale)
  And verify retorna VALID

Scenario: Hash-chain tamper detection
  Given chain válida com 5 entries
  When modifico manualmente rationale da entry 3 no DB
  Then verify retorna INVALID at entry 3
```

**TDD plan.**
1-8. Repo tests por tabela (CRUD + queries)
9. `tests/unit/hash-chain.test.ts` — verify cases: válida, mutated, gap em sequence (ÚNICA LOCALIZAÇÃO; Slice 12 só testa wrapper)
10. `tests/unit/diff-immutability.test.ts` (NEW, F22) — update rejeitado
11. `tests/unit/json-codec.test.ts` — round-trip arrays, objects

**Files.**
- `src/db/repo/runs.ts, workspaces.ts, phases.ts, batches.ts, diff-snapshots.ts, gate-decisions.ts, findings.ts, waivers.ts, schema-migrations.ts` (9 repos)
- `src/db/hash-chain.ts` (primitive: compute, verify)
- `src/db/json-codec.ts`
- `src/shared/domain/` (aggregates DDD)

**Dependencies.** Slices 1, 2, 3.

**DoD.**
- [ ] CI verde, coverage ≥ 85% nesta layer
- [ ] Doc `docs/db-layer.md`

**Risks.** SQLite UPDATE rejection precisa de trigger SQL (DDL — nem todo backend suporta). Mitigação: enforcer em camada de app + integration test.

**Effort.** 1.5 semanas.

---

## Fase B — Domínio central

### Slice 5 — Workspace context + lock + DiffSnapshot capture

**Goal end-to-end.** Tool `pipeline-init-workspace` (NEW name, F5) cria Workspace, adquire lock. Erro claro se conflito. Tool dev `pipeline-debug-diff` captura DiffSnapshot.

**ATDD.** Implementa `02-design.md` Sec 2 Context 0 + Sec 4.1 cenário "Workspace lock conflict".

**TDD plan.**
1-4. Workspace provisioning + lock + diff capture (igual v0.1)
5. `tests/integration/diff-content-sanitization.test.ts` (NEW, F7) — diff com commit message embarcada → assert que diff_content armazenado preserva mas mark sanitization pendente em Slice 9

**Files.**
- `src/contexts/workspace/`
- `src/tools/pipeline-init-workspace.ts` (renamed, F5)
- `src/tools/pipeline-debug-diff.ts`

**Dependencies.** Slices 1-4.

**DoD.** CI verde, manual test em Paperclip, doc.

**Effort.** 1.5 semanas.

---

### Slice 6 — Classification context + classifier agent + manual override + variant matrix (F6)

**Goal end-to-end.** Tool `pipeline-classify` adiciona camada de Classification por cima do init-workspace (F5: tool é construído incrementalmente — Slice 5 entrega init, Slice 6 adiciona classification). Variant matrix testada pra todos os 8 variants.

**ATDD.** Implementa `02-design.md` Sec 4.1 todos cenários + Sec 3.6 variant catalog completo.

**TDD plan.**
1. `tests/unit/classification/classifier-agent.test.ts` — LLM mock retorna proposed classification
2. `tests/integration/classification-approval-flow.test.ts` — full happy path
3. `tests/integration/classification-rejection.test.ts` — reject → manual sub-issue
4. `tests/unit/classification/variant-selector.test.ts` — parametrizado sobre todas 8 variants:
   - `bugfix-light`, `bugfix-heavy`, `feature-light`, `feature-heavy`, `audit-readonly`, `spec-medium`, `spec-complexa`, `uxsim-readonly`
   - cada um testa: (type, complexity) → variant esperada
5. `tests/unit/classification/variant-phases.test.ts` (NEW, F6) — pra cada variant, valida lista de Phases ativas conforme Sec 3.6

**Files.**
- `src/contexts/classification/`
- `src/contexts/classification/variant-catalog.ts` (8 variants implementadas)
- `src/tools/pipeline-classify.ts` (extends init-workspace tool)
- `agents/classifier.md`
- `skills/classification/SKILL.md`

**Dependencies.** Slices 1-5.

**DoD.** Variant matrix 100% coverage.

**Effort.** 1.5 semanas.

---

### Slice 7 — Execution context com Batch state machine UPSTREAM ONLY (F3)

**Goal end-to-end.** Estados implementados nesta slice: `pending → implementing → checkpoint_running → checkpoint_passed → checkpoint_failed`. Estados downstream (`reviewing`, `review_passed`, `review_blocked`, `fixing`, `completed`, `aborted`) NÃO implementados aqui — adicionados nas Slices 9 e 10 com contract tests retroativos.

**Por que.** F3 — Execution consome `AdversarialReviewPassed` e `FixLoopResolved` mas esses eventos não existem ainda. Slice 7 só implementa o que consome `ClassificationApproved`. Slice 9 e 10 estendem.

**ATDD.** Implementa `02-design.md` Sec 4.4.1 (batch sizing) + parcial Sec 4.4.2 (apenas estados upstream).

**TDD plan.**
1. `tests/unit/execution/batch-sizing.test.ts` — sizing rule pra SIMPLES/MEDIA/COMPLEXA
2. `tests/unit/execution/state-machine-upstream.test.ts` — transições válidas/inválidas dos 5 estados upstream
3. `tests/integration/execution-on-classification-approved.test.ts` — emit event → criação de batches
4. `tests/integration/batch-transition-idempotent.test.ts` — dedup_key
5. `tests/integration/concurrent-conflicting-transitions.test.ts` (NEW, F8) — BatchCheckpointPassed + BatchCheckpointFailed simultâneos → primeiro vence, segundo rejeitado
6. `tests/integration/terminal-state-event-rejection.test.ts` (NEW, F8) — evento chegando pra batch já em estado terminal → logged + ignored, não crasha

**Files.**
- `src/contexts/execution/`
- `src/contexts/execution/batch-derivor.ts`
- `src/contexts/execution/state-machine.ts` (upstream only, marca downstream como "Slice 9/10 territory")
- `src/contexts/execution/batch-dispatcher.ts`
- `src/tools/pipeline-dispatch-batch.ts` (debug)

**Dependencies.** Slices 1-6.

**DoD.**
- [ ] CI verde, 100% coverage do state-machine upstream
- [ ] Doc `docs/execution.md` com state diagram + marker do que falta nas Slices 9/10
- [ ] Documented contract pra Slice 9/10 estender

**Risks.** Slice 9/10 podem descobrir que state machine precisa refator. Mitigação: design da máquina já feito em 02-design.md Sec 4.4.2, slice 7 apenas implementa parcial.

**Effort.** 2.5-3 semanas (revised up from 1.5w, F2).

---

### Slice 8 — TDD scenario flow + variant skip matrix (F6)

**Goal end-to-end.** TDD scenarios gerados, aprovados individualmente. Variants `audit-readonly`, `spec-*`, `uxsim-readonly` PULAM este step (F6).

**ATDD.** Implementa `02-design.md` Sec 4.3 + Sec 3.6 (variant-aware skipping).

**TDD plan.**
1. `tests/unit/tdd/scenario-generator.test.ts` — skill produces Given/When/Then markdown
2. `tests/integration/tdd-approval-gating.test.ts` — happy path
3. `tests/integration/tdd-rejection-revision.test.ts` — reject + revise
4. `tests/unit/tdd/skip-matrix.test.ts` (NEW, F6) — parametrizado sobre 8 variants, asserta quais PULAM TDD (audit/spec/uxsim) e quais EXECUTAM (bugfix/feature)

**Files.**
- `src/contexts/execution/tdd-scenario-gen.ts`
- `skills/tdd-scenario-gen/SKILL.md`

**Dependencies.** Slices 1-7.

**Effort.** 1-1.5 semanas.

---

## Fase C — Revisão + validação

### Slice 9 — Adversarial Review trio + state machine extension (estados reviewing/review_*) + variant skip (F6) + diff sanitization (F7)

**Goal end-to-end.** Trio paralelo zero-context. Variants sem adversarial pulam (audit/spec/uxsim). State machine de Execution estendida com `reviewing`, `review_passed`, `review_blocked`. DiffSnapshot sanitizado antes de passar pro reviewer (sem commit messages embedded).

**ATDD.** Implementa `02-design.md` Sec 4.5 + Sec 3.6 (skip matrix) + Sec 5 D7.

**TDD plan.**
1. `tests/unit/adversarial/trio-dispatcher.test.ts` — 3 sub-issues criadas com agents diferentes
2. `tests/integration/adversarial-zero-context.test.ts` — payload SOMENTE DiffSnapshot
3. `tests/integration/adversarial-all-clean.test.ts`
4. `tests/integration/adversarial-blocked.test.ts`
5. `tests/unit/adversarial/insufficient-context-finding.test.ts` — Finding tipo, NO clarification sub-issue
6. `tests/unit/adversarial/variant-skip.test.ts` (NEW, F6) — variants audit/spec/uxsim pulam trio
7. `tests/integration/diff-sanitization.test.ts` (NEW, F7) — diff com commit message "fix: implements F12 from RFC" → sanitizer remove commit-line context antes de enviar ao reviewer
8. `tests/integration/state-machine-downstream-1.test.ts` (NEW, F3) — estados reviewing/review_passed/review_blocked + transições válidas, contract com Slice 7

**Files.**
- `src/contexts/adversarial-review/`
- `src/contexts/adversarial-review/diff-sanitizer.ts` (NEW)
- 3 agents + 3 skills
- `src/contexts/execution/state-machine.ts` ESTENDIDO com novos estados

**Dependencies.** Slices 1-8.

**Effort.** 2 semanas.

---

### Slice 10 — Fix Loop context + state machine extension (estados fixing/aborted/completed)

**Goal end-to-end.** Fix Loop completo. State machine fecha (estados terminais `completed`, `aborted` + `fixing` intermediário).

**ATDD.** Implementa `02-design.md` Sec 2 Context 4 + Sec 4.4 cenário "Checkpoint blocks" + "Fix loop exhausted".

**TDD plan.** (igual v0.1) + `tests/integration/state-machine-downstream-2.test.ts` — fechamento da máquina, todas transições válidas/inválidas finais.

**Files.** (igual v0.1) + state machine completion.

**Dependencies.** Slices 1-9.

**Effort.** 1 semana.

---

### Slice 11 — Validation context + Verdict + Waiver policy + open finding rule (F19, F20)

**Goal end-to-end.** Verdict computado. CRITICAL waived → min CONDITIONAL. **Open HIGH/CRITICAL findings BLOCKEIAM validation** (Validation só roda quando todos resolved/waived) — F19.

**ATDD.** Implementa `02-design.md` Sec 4.7 todos cenários + nova regra: validation precondition.

```gherkin
Scenario (NEW, F19): Open HIGH/CRITICAL findings block validation
  Given Run com ExecutionComplete emitido
  And finding severity=HIGH state=open
  When Validation seria disparado
  Then Validation NÃO roda
  And uma sub-issue de "pending findings resolution" é criada
  And usuário deve resolved ou waived os findings open antes de Validation prosseguir

Scenario (NEW, F20): Waiver test com mock auth
  Given test setup com 2 user IDs (admin, dev) e clock mock
  When dev waiva CRITICAL com approver_id=admin
  Then waiver válido
  When dev waiva CRITICAL com approver_id=dev (self)
  Then rejeitado a menos que self-approve-cooldown habilitado E mock clock avançou 1h
```

**TDD plan.** Igual v0.1 + (NEW) `tests/unit/validation/open-findings-block.test.ts` + `tests/integration/waiver-mock-auth.test.ts`.

**Files.** Igual v0.1.

**Dependencies.** Slices 1-10.

**Effort.** 1 semana.

---

## Fase D — Observabilidade + ship

### Slice 12 — GateDecisionLog subscriber + verify tool wrapper (F10 clarified)

**Goal end-to-end.** Subscriber persiste todas decisions em `gate_decisions`. Tool `pipeline-verify-audit-chain` wraps primitiva de Slice 4. Lógica de hash chain NÃO duplicada — só wrapping.

**ATDD.** Implementa `02-design.md` Sec 4.6.

**TDD plan.**
1. `tests/unit/gate-decision/subscriber.test.ts` — pattern matching + filter por gate_metadata
2. `tests/integration/gate-decision-full-run.test.ts` — run completo, conta gates esperados
3. `tests/integration/verify-audit-chain-tool.test.ts` — wraps Slice 4 primitive, retorna relatório

(NÃO testa novamente os cases de chain verify — feito em Slice 4)

**Files.**
- `src/contexts/gate-decision/event-subscriber.ts`
- `src/tools/pipeline-verify-audit-chain.ts`

**Dependencies.** Slices 1-11.

**Effort.** 1 semana.

---

### Slice 13 — RunDashboard React UI components + tests (F18 split)

**Goal end-to-end.** Painel `RunDashboard` renderiza estado em tempo real. Componentes individuais testados. Integração via plugin event bus → React state.

**ATDD.** Implementa `02-design.md` Sec 4.6 cenário "Dashboard renders feed".

**TDD plan.**
1. `tests/unit/ui/RunDashboard.test.tsx` — snapshot
2-6. Component tests individuais (WorkspaceInfo, BatchProgress, FindingList, GateDecisionFeed, HashChainIndicator)
7. `tests/integration/ui-live-update.test.ts` — emit event, re-render
8. `tests/integration/ui-hash-chain-indicator.test.ts` — green se VALID, red se INVALID com row apontada

**Files.**
- `src/ui/RunDashboard.tsx`
- `src/ui/components/*` (6 componentes)
- `src/ui/hooks/useRunState.ts`
- `src/ui/index.ts`

**Dependencies.** Slices 1-12.

**Risks.** Q2 (UI injection) resolved on Slice 0 critical.

**Effort.** 2 semanas.

---

### Slice 14 — Docs completos + publish + release (F18 split)

**Goal end-to-end.** Documentação completa (architecture, user-guide, plugin-api), screenshots, CHANGELOG, README polido, publicação em canal de plugins do Paperclip versão 1.0.0.

**ATDD.** Manual checklist + smoke E2E em Paperclip real.

**TDD plan.**
1. `tests/e2e/publish-flow.test.sh` — script monta package, valida shape, dry-run publish
2. Manual smoke: instalar plugin local, rodar Run completo SIMPLES, verificar GO Verdict

**Files.**
- `docs/architecture.md` (completo)
- `docs/user-guide.md` (completo, com screenshots)
- `docs/plugin-api.md` (completo)
- `CHANGELOG.md` (release notes v1.0.0)
- `README.md` (polido com screenshots, badges)
- `scripts/publish.sh`

**Dependencies.** Slice 13.

**DoD.**
- [ ] CI verde com todos testes
- [ ] Manual: instalar em Paperclip, abrir issue com Run, ver painel funcionando
- [ ] Publicado no canal de plugins Paperclip (v1.0.0)
- [ ] Iron Law CI ainda verde
- [ ] PARITY_VERDICT do shim antigo formalmente substituído por PASS (não mais PASS_WITH_NOTES)

**Effort.** 1-1.5 semanas.

---

## Dependências entre slices (grafo revisado)

```
0 (spike)
└── 1 (scaffold)
    └── 2 (events)
        └── 3 (cross-cutting)
            └── 4 (db layer + hash primitive)
                └── 5 (workspace)
                    └── 6 (classification + variants)
                        └── 7 (execution upstream)
                            └── 8 (tdd scenarios)
                                └── 9 (adversarial + state ext + sanitization)
                                    └── 10 (fix loop + state final)
                                        └── 11 (validation + open-findings + waiver)
                                            └── 12 (gate log subscriber + tool)
                                                └── 13 (UI components)
                                                    └── 14 (docs + publish)
```

Sequencial. Slice 9 e 10 estendem state machine de Slice 7 (contract). Side tracks (Sec dedicada) podem ser paralelizados.

**Regra adicional de cadência:** mesmo quando side tracks rodarem em paralelo, eles não podem servir para "pular" o gate principal do sprint. O eixo crítico do slice continua serializado por checkpoint -> adversarial -> fix -> regressão.

## Pontos de saída dignos

- **Após Slice 0:** decisões SDK validadas, pode-se decidir se v1.0 é viável
- **Após Slice 4:** infraestrutura completa
- **Após Slice 8:** POC funcional (classify → batches → tests aprovados)
- **Após Slice 11:** v0.9 funcional sem UI
- **Após Slice 12:** v0.95 auditável via CLI
- **Slice 14 ship:** v1.0 completo

## Métricas

| Métrica | Meta | Como medir |
|---|---|---|
| Coverage por context | ≥ 80% | vitest --coverage |
| Iron Law preserved | 100% sessions | iron-law-check verde |
| Time per slice | ±30% estimativa | tempo real vs estimativa |
| Time per sprint | <= 1 semana | fechamento real vs planejado |
| Findings adversarial por slice | ≥ 3 | retro post-slice |
| Findings adversarial por sprint | 0 abertos ao fechar sprint | checklist de encerramento |
| Regression tests acumulando | growing | CI total tests count |
| Cenários promovidos a regressão | 100% dos aprovados/relevantes | matriz ATDD/BDD -> testes |
| Stop conditions hit | tracked | log post-mortem se ocorrer |

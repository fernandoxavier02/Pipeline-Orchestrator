# Design — Pipeline Orchestrator Paperclip (PIP) v0.2

**Status:** Draft v0.2 (revised after adversarial review loop 1, 20 findings)
**Date:** 2026-05-24
**Depends on:** `01-requirements.md`
**Methodology applied:** DDD (bounded contexts + ubiquitous language), BDD (workflows as scenarios), ATDD (acceptance criteria from requirements), TDD plan (per slice in `03-tasks.md`)

**Revision notes vs v0.1.** Adversarial review surfaced 20 findings. Major changes in this v0.2: (1) added Workspace bounded context to model repo/branch/worktree/diff; (2) added explicit Batch state machine with single-writer ownership; (3) added Variant catalog (Sec 3.6); (4) added migration policy (Sec 3.5); (5) audited capabilities 1:1 vs workflows (Sec 3.3); (6) cut v1.0 scope — Planning and Brainstorm moved to v1.1+; (7) tightened waiver policy with role gating; (8) removed `--force-complexity` flag (replaced with "manual classification" sub-issue); (9) prohibited reviewer clarification escape-hatch — review is now truly zero-context; (10) added repo-lock policy for concurrent Runs; (11) added schema_migrations table + JSON-string fallback (Q1 deferred); (12) added Workspace and Fix Loop phases to schema; (13) added correlation_id model with session_id for pre-Run Brainstorm; (14) added hash-chain to gate_decisions for tamper-resistance.

---

## 1. Ubiquitous language (DDD)

Termos canônicos. Mesma palavra, mesmo significado, em código, UI, docs e issues.

| Termo | Significado |
|---|---|
| **Run** | Uma execução completa do pipeline disparada por um usuário pra um problema único. Persiste no plugin DB. Tem ciclo de vida com estados |
| **Workspace** | Mapeamento entre um Run e um repositório git: repo_ref, base_commit, working_branch, opcional worktree_path. Estabelece o "onde" do diff |
| **Phase** | Etapa lógica dentro de um Run: workspace_setup, classification, execution, adversarial_review, fix_loop, validation, done. Cada Phase pode criar zero ou mais Sub-Issues |
| **Gate** | Ponto de decisão governado dentro de uma Phase. Pode ser MANDATORY, HARD, CIRCUIT_BREAKER, SOFT, ou AUDIT |
| **Batch** | Unidade de trabalho dentro da Execution phase. Tamanho dimensionado por complexidade. Tem máquina de estado explícita (Sec 4.4) |
| **Finding** | Item levantado por revisor adversarial. Tem severidade (CRITICAL/HIGH/MEDIUM/LOW) e status (open/resolved/waived) |
| **Waiver** | Dispensa explícita de um Finding por usuário autorizado. Tem política de role e cap (Sec 5.8) |
| **Verdict** | Output final do validador: GO, CONDITIONAL, ou NO-GO |
| **Sub-Issue** | Issue filha criada no Paperclip pra representar trabalho assíncrono delegado |
| **Approval Flow** | Padrão onde uma Sub-Issue precisa ser aprovada (status=approved) pra Run continuar. Substitui AskUserQuestion síncrono do Claude Code |
| **Capability** | Permissão tipada declarada no manifesto do plugin. Validada no boundary IPC pelo host Paperclip |
| **Variant** | Configuração de pipeline específica por tipo+complexidade. Define Phases ativas, Gates aplicáveis, skills/agents usados. Enumerado em Sec 3.6 |
| **DiffSnapshot** | Captura do diff git entre dois SHAs num Workspace, usado como input zero-contexto pros revisores adversariais |

---

## 2. Bounded contexts (DDD)

PIP é decomposto em **seis bounded contexts no v1.0** (Brainstorm e Planning ficam pra v1.1+ após F16). Cada context tem seu próprio modelo, sua API, e mínimo acoplamento com os outros. Comunicação cross-context APENAS via events.

```
+----------------------------------------------------------------+
|                    PIP Plugin Boundary v1.0                     |
|                                                                 |
|  +-----------+    +---------------+    +-----------------+    |
|  | Workspace |--->| Classification|--->|    Execution    |    |
|  +-----------+    +---------------+    +-----------------+    |
|                                              |                  |
|                                              v                  |
|  +------------+    +-----------------+   +----------+         |
|  | Validation |<---|  Adversarial   |<--|  Batch   |         |
|  +------------+    |    Review      |   +----------+         |
|                    +-----------------+         |                |
|                                                v                |
|                                          +----------+           |
|                                          | Fix Loop |           |
|                                          +----------+           |
|                                                                 |
|  +----------------+ (cross-cutting, observed by all)           |
|  | Gate Decision  |<---- events de todos os outros            |
|  +----------------+                                              |
|                                                                 |
|  Deferred to v1.1: Planning, Brainstorm                        |
+----------------------------------------------------------------+
```

### Context 0 (NEW) — Workspace

**Responsabilidade.** Estabelecer o "onde" do trabalho: associar um Run a um repositório git, branch base, e (opcional) worktree dedicado. Adquirir lock pra prevenir Runs concorrentes no mesmo repo+branch. Computar `DiffSnapshot` entre SHAs sob demanda para a Adversarial Review.

**Aggregates.** `Workspace` (root), `RepoLock` (entity), `DiffSnapshot` (value object).

**Eventos publicados.** `WorkspaceProvisioned`, `WorkspaceLockAcquired`, `WorkspaceLockReleased`, `DiffSnapshotCaptured`, `WorkspaceProvisioningFailed`.

**Eventos consumidos.** `RunCreated` (do Classification).

**Notas.**
- Lock policy: 1 Run ativo por (repo_url, base_branch). Tentativa de criar Run concorrente é rejeitada com `WorkspaceProvisioningFailed`.
- DiffSnapshot é imutável após captura. Identificado por `(workspace_id, pre_sha, post_sha)`.
- Worktree é opcional na v1.0: se Paperclip não suportar worktrees nativos, fallback para checkout direto na branch (com lock impedindo concorrência).

### Context 1 — Classification

**Responsabilidade.** Receber descrição de tarefa em linguagem natural, produzir Classification (type, complexity, variant), associar a um Workspace, criar Sub-Issue de aprovação. Override manual via Sub-Issue de "manual classification" (não via flag).

**Aggregates.** `Classification` (root, parte de `Run`), `Variant` (value object).

**Eventos publicados.** `RunCreated`, `ClassificationProposed`, `ClassificationApproved`, `ClassificationRejected`, `ManualClassificationRequested`.

**Eventos consumidos.** Nenhum (entry-point).

### Context 2 — Execution

**Responsabilidade.** Receber Classification aprovada, derivar lista de Batches da Variant escolhida (regra de batch sizing em Sec 4.4.1), despachar Sub-Issues de implementação, gatear cada Batch por checkpoint (build+test) antes de prosseguir. Owner ÚNICO da máquina de estado de Batch.

**Aggregates.** `BatchExecution` (root), `Batch` (entity com state machine), `TestScenario` (entity), `ImplementationTask` (entity).

**Eventos publicados.** `TestScenariosProposed`, `TestScenariosApproved`, `BatchStarted`, `BatchCheckpointPassed`, `BatchCheckpointFailed`, `ExecutionComplete`.

**Eventos consumidos.** `ClassificationApproved`, `AdversarialReviewPassed`, `FixLoopResolved`.

**Notas.** A regra de transição de Batch é deterministica (Sec 4.4) e somente o Execution context escreve em `batches.state`. Outros contexts só leem.

### Context 3 — Adversarial Review

**Responsabilidade.** A cada Batch com checkpoint passado, criar três Sub-Issues paralelas (security, architecture, quality) com agentes distintos, cada um recebendo APENAS o `DiffSnapshot` (zero contexto de implementação, sem escape hatch). Agregar Findings, propagar `AdversarialReviewPassed` se todas vazias, `AdversarialReviewBlocked` se houver finding.

**Aggregates.** `ReviewRound` (root), `Reviewer` (entity), `Finding` (entity).

**Eventos publicados.** `ReviewRoundStarted`, `ReviewerCompleted`, `ReviewRoundConsolidated`, `AdversarialReviewPassed`, `AdversarialReviewBlocked`.

**Eventos consumidos.** `BatchCheckpointPassed`, `DiffSnapshotCaptured` (do Workspace).

**Notas.** **Não há canal de clarificação** entre reviewer e código original (F7). Se reviewer precisa de mais contexto, ele emite Finding tipo "insufficient context" com severity MEDIUM — o usuário decide se resolve ou waiver. Isso preserva integridade do "zero contexto" como princípio (não como teatro).

### Context 4 (NEW) — Fix Loop

**Responsabilidade.** Quando `AdversarialReviewBlocked` chega ou checkpoint falha, criar Sub-Issue de fix com Findings/erro. Após fix, re-disparar checkpoint. Max 3 tentativas por Batch (parametrizável por Variant). Esgotamento → propagar `FixLoopExhausted` que vai pro Validation.

**Aggregates.** `FixAttempt` (entity), `FixLoop` (aggregate root, scoped to Batch).

**Eventos publicados.** `FixAttemptStarted`, `FixAttemptCompleted`, `FixLoopResolved`, `FixLoopExhausted`.

**Eventos consumidos.** `AdversarialReviewBlocked`, `BatchCheckpointFailed`.

### Context 5 — Validation

**Responsabilidade.** Após `ExecutionComplete` (todos Batches passaram), emitir Verdict GO/CONDITIONAL/NO-GO com justificativa. Aplicar policy de waiver (Sec 5.8): waiver de CRITICAL força mínimo CONDITIONAL.

**Aggregates.** `Validation` (root), `Verdict` (value object), `Justification` (value object).

**Eventos publicados.** `ValidationStarted`, `ValidationCompleted`, `RunCompleted`.

**Eventos consumidos.** `ExecutionComplete`, `FixLoopExhausted`.

### Context 6 — Gate Decision (cross-cutting)

**Responsabilidade.** Capturar toda decisão de portão emitida por qualquer outro context, persistir com hash-chain em `gate_decisions` (tamper-resistance, Sec 5.10), alimentar painel de auditoria.

**Aggregates.** `GateDecisionLog` (root), `GateDecision` (entity, hash-linked), `Evidence` (value object).

**Eventos publicados.** Nenhum (subscriber-only).

**Eventos consumidos.** **Convenção:** consume eventos cujo type matches pattern `*Approved|*Rejected|*Blocked|*Passed|*Failed|*Triggered|*Waived|*Skipped` E que tenham field `gate_metadata`. Cada context emissor é responsável por incluir esse field nos eventos relevantes. Sem `gate_metadata`, evento é ignorado pelo GateDecisionLog. (Reduz coupling implícito — F17.)

### Bounded contexts deferidos pra v1.1+

- **Planning** (era Context 2 no v0.1): trigger automático pra MEDIA+ produzindo plan document approved antes de Execution. Por que adiado: v1.0 começa com SIMPLES e Bug Fix bem cobertos; MEDIA Spec rodam sem plan formal no v1.0 (validação humana via Sub-Issue de aprovação de Classification supre).
- **Brainstorm** (era Context 7): fluxo pré-execução com intake/clarificação/alternativas/spec lifecycle. Por que adiado: v1.0 entrega valor independente — usuário pode brainstormar manualmente no Paperclip e invocar PIP com a descrição refinada.

---

## 3. Architecture overview

### 3.1 Plugin layout (filesystem) — v1.0 reduzido

```
pipeline-orchestrator-paperclip/
├── package.json
├── plugin.json                          <- PaperclipPluginManifestV1
├── src/
│   ├── worker.ts                        <- main worker entry-point
│   ├── contexts/
│   │   ├── workspace/                   (NEW)
│   │   ├── classification/
│   │   ├── execution/
│   │   ├── adversarial-review/
│   │   ├── fix-loop/                    (NEW)
│   │   ├── validation/
│   │   └── gate-decision/
│   ├── tools/
│   │   ├── pipeline-classify.ts
│   │   ├── pipeline-dispatch-batch.ts
│   │   ├── pipeline-record-decision.ts
│   │   └── pipeline-finalize.ts
│   ├── ui/
│   │   └── RunDashboard.tsx             <- UM painel só no v1.0 (gates + batches + findings embeded)
│   ├── db/
│   │   ├── schema.ts
│   │   ├── migrations/                  <- versioned, never rewrite
│   │   └── repo/                        <- DB access layer
│   ├── events/
│   │   ├── types.ts                     <- canonical event interfaces
│   │   ├── bus.ts                       <- event bus wrapper
│   │   └── gate-metadata.ts             <- shared GateEvent contract
│   └── shared/
│       ├── domain/                      <- DDD aggregates
│       └── utils/
├── skills/                              <- managed.skills (5 no v1.0)
│   ├── classification/SKILL.md
│   ├── tdd-scenario-gen/SKILL.md
│   ├── implementation/SKILL.md
│   ├── adversarial-security/SKILL.md
│   ├── adversarial-architecture/SKILL.md
│   └── adversarial-quality/SKILL.md
├── agents/                              <- managed.agents (5 no v1.0)
│   ├── classifier.md
│   ├── implementer.md
│   ├── security-reviewer.md
│   ├── architecture-reviewer.md
│   └── quality-reviewer.md
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
    ├── architecture.md
    ├── plugin-api.md
    └── user-guide.md

# Removed from v1.0 (deferred to v1.1+):
# - planning/, brainstorm/ contexts
# - GateDecisionFeed.tsx, AdversarialBoard.tsx (consolidados em RunDashboard.tsx)
# - planner.md agent, final-validator.md (final validation lógica embarcada no validation context)
# - skills: intake, clarification, alternatives, planning, final-validation
```

### 3.2 Plugin manifest (v1.0 shape)

```jsonc
{
  "apiVersion": 1,
  "name": "@fx-studio-ai/pipeline-orchestrator-paperclip",
  "version": "1.0.0",
  "description": "Pipeline orchestration with governance, TDD, batched execution, adversarial review, audit trail. Paperclip-native.",
  "author": "FX Studio AI",
  "license": "Apache-2.0",
  "entry": {
    "worker": "./dist/worker.js",
    "ui": "./dist/ui/index.js"
  },
  "capabilities": {
    "issues": ["read", "create", "update", "subscribe"],
    "subIssues": ["create", "update", "assignAgent"],
    "events": ["subscribe", "publish"],
    "agent": {
      "tools": ["register"],
      "skills": ["register"]
    },
    "ui": {
      "detailTab": ["register"]
    },
    "state": ["read", "write"],
    "db": ["read", "write", "migrate"],
    "attachments": ["create", "read"],
    "notifications": ["send"],
    "process": ["exec"]
  }
}
```

**Capability audit vs workflows (F11):**

| Capability | Usado em | Justificativa |
|---|---|---|
| `issues.*` | C1, C7, Validation | CRUD em issues parent |
| `subIssues.*` | C1-C8 todos | Aprovações, sub-tarefas, revisão paralela |
| `events.*` | Todos contexts | Comunicação inter-context |
| `agent.tools.register` | 4 tools no v1.0 | Tools chamadas pelo agente |
| `agent.skills.register` | 5 skills no v1.0 | Skills declaradas |
| `ui.detailTab.register` | RunDashboard | Painel de auditoria |
| `state.*` | Workspace lock, batch progress | Plugin state pequeno fora do DB |
| `db.*` | Todas tabelas | Persistência principal |
| `attachments.*` | Plan docs (v1.1), test scenarios markdown | Anexar arquivos em sub-issues |
| `notifications.send` | Run completed, blocked | Notificar usuário em eventos importantes |
| `process.exec` | C4 build+test checkpoint | Rodar comandos do projeto |

**Removidas vs v0.1:** `webhooks.*` (sem caso de uso), `jobs.*` (sem uso ainda — pode voltar em v1.1+ pra Brainstorm scheduled), `managed.routines` (sem uso direto inicial).

### 3.3 Worker lifecycle

```
install --> init --> ready --> shutdown
              ^         ^
              |         |
        upgrade ---- reinit
```

Eventos:
- `install` — roda `001_initial.sql` (cria todas tabelas + index)
- `init` — carrega skills/agents, conecta event bus, recupera Runs pausados
- `ready` — abre receptores de tools/events
- `upgrade` — roda migrations delta NA ORDEM, pausa Runs ativos antes (Sec 3.5)
- `shutdown` — flush, libera locks de Workspace, desconecta

### 3.4 Data model (plugin DB) — v1.0

Schema. Usa `TEXT` pra campos JSON (compatível com SQLite e Postgres — Q1 deferido pra implementação). Hash-chain em `gate_decisions` pra tamper-resistance.

```sql
-- 0. Schema migrations tracking (NEW, F6)
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL  -- ISO timestamp
);

-- 1. Run: unidade top-level
CREATE TABLE runs (
  id TEXT PRIMARY KEY,                    -- ULID
  parent_issue_id TEXT NOT NULL,
  workspace_id TEXT,                      -- FK runs.workspace_id, set after Workspace provisioned
  user_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  type TEXT,                              -- BugFix|Feature|Audit|Spec|UXSim
  complexity TEXT,                        -- SIMPLES|MEDIA|COMPLEXA
  variant TEXT,                           -- ex: bugfix-light, spec-complexa (Sec 3.6)
  current_phase TEXT,                     -- workspace_setup|classification|execution|adversarial_review|fix_loop|validation|done
  state TEXT NOT NULL,                    -- active|paused|completed|aborted
  correlation_id TEXT NOT NULL,           -- ULID, may equal id but distinct conceptually
  schema_version_at_creation INTEGER NOT NULL,  -- snapshot of schema_migrations max version at run creation; used for upgrade compatibility check (Sec 3.5)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  verdict TEXT                            -- GO|CONDITIONAL|NO_GO
);

-- 2. Workspace (NEW, F1)
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  repo_url TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  base_commit TEXT NOT NULL,              -- SHA at provisioning time
  working_branch TEXT NOT NULL,           -- branch where Batches commit
  worktree_path TEXT,                     -- optional, if Paperclip supports
  lock_state TEXT NOT NULL,               -- acquired|released
  created_at TEXT NOT NULL,
  released_at TEXT
);
CREATE UNIQUE INDEX idx_workspace_lock ON workspaces(repo_url, base_branch) WHERE lock_state = 'acquired';

-- 3. Phase
CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  name TEXT NOT NULL,
  sub_issue_id TEXT,
  state TEXT NOT NULL,                    -- pending|active|completed|skipped|blocked
  started_at TEXT,
  completed_at TEXT,
  outcome TEXT                            -- JSON-as-string
);

-- 4. Batch (state machine in Sec 4.4)
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  phase_id TEXT NOT NULL REFERENCES phases(id),
  ordinal INTEGER NOT NULL,
  task_ids TEXT NOT NULL,                 -- JSON array as string
  state TEXT NOT NULL,                    -- pending|implementing|checkpoint_running|checkpoint_passed|checkpoint_failed|reviewing|review_passed|review_blocked|fixing|completed|aborted
  pre_diff_sha TEXT,                      -- SHA before batch
  post_diff_sha TEXT,                     -- SHA after batch
  checkpoint_result TEXT,                 -- JSON-as-string
  fix_attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT
);

-- 5. DiffSnapshot (immutable)
CREATE TABLE diff_snapshots (
  id TEXT PRIMARY KEY,                    -- hash of (workspace_id, pre_sha, post_sha)
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  batch_id TEXT REFERENCES batches(id),
  pre_sha TEXT NOT NULL,
  post_sha TEXT NOT NULL,
  diff_content TEXT NOT NULL,             -- captured diff text
  captured_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_diffsnapshot_unique ON diff_snapshots(workspace_id, pre_sha, post_sha);

-- 6. GateDecision (hash-chained for tamper-resistance, F19)
CREATE TABLE gate_decisions (
  id TEXT PRIMARY KEY,                    -- ULID
  run_id TEXT NOT NULL REFERENCES runs(id),
  phase_id TEXT REFERENCES phases(id),
  sequence INTEGER NOT NULL,              -- monotonic per run_id
  gate_name TEXT NOT NULL,
  hardness TEXT NOT NULL,                 -- MANDATORY|HARD|CIRCUIT_BREAKER|SOFT|AUDIT
  decision TEXT NOT NULL,                 -- APPROVED|REJECTED|SKIPPED|WAIVED|TRIGGERED
  decided_by TEXT NOT NULL,               -- user:<id>|agent:<name>|system
  evidence_ref TEXT,
  rationale TEXT,
  timestamp TEXT NOT NULL,
  prev_hash TEXT,                         -- hash of previous entry in chain (per run_id)
  this_hash TEXT NOT NULL                 -- SHA256 of (sequence|gate_name|decision|decided_by|timestamp|prev_hash|rationale)
);
CREATE UNIQUE INDEX idx_gate_run_seq ON gate_decisions(run_id, sequence);

-- 7. Finding
CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  batch_id TEXT REFERENCES batches(id),
  reviewer TEXT NOT NULL,                 -- security|architecture|quality
  severity TEXT NOT NULL,                 -- CRITICAL|HIGH|MEDIUM|LOW
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT,
  state TEXT NOT NULL,                    -- open|resolved|waived
  resolved_at TEXT,
  resolution_note TEXT
);

-- 8. Waiver (NEW, F14)
CREATE TABLE waivers (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id),
  waived_by TEXT NOT NULL,                -- user:<id>
  approver_id TEXT,                       -- second approver for CRITICAL (2-person rule)
  justification TEXT NOT NULL,
  waived_at TEXT NOT NULL
);
```

### 3.5 Migration policy (NEW, F6)

- **Localização:** `src/db/migrations/NNN_name.sql`, NNN é integer monotonic (001, 002, ...).
- **Aplicação:** `worker.ts` no evento `install` ou `upgrade` lê `schema_migrations`, calcula delta, aplica em ordem dentro de transação. Se qualquer migration falha, transação rola, plugin reporta erro de upgrade.
- **Runs em vôo durante upgrade:** todas Runs `state=active` são pausadas (`state=paused`) antes de iniciar migrations. Após sucesso, `init` retoma Runs pausados — mas SOMENTE se a versão de schema com que foram criados é compatível (checado via `runs.schema_version_at_creation`). Incompatíveis viram `state=aborted` com motivo `schema_migration_incompatible`.
- **Renames:** sempre additivos. Pra renomear coluna X→Y: (1) migration adiciona Y, copia X→Y; (2) release intermediário escreve em ambos, lê de Y; (3) próxima migration dropa X. Nunca rename direto.
- **Rollback:** não suportado nativamente. Cada release que faz schema change carrega script manual de "downgrade" em `docs/migrations/NNN_rollback.sql` para emergências.

### 3.6 Variant catalog (NEW, F10)

Variant é a chave que liga (type, complexity) → comportamento concreto. Catálogo do v1.0:

| Variant | Type | Complexity | Phases ativas | Skills | Adversarial | Notes |
|---|---|---|---|---|---|---|
| `bugfix-light` | BugFix | SIMPLES | workspace, classification, execution (1 batch all-in-one), adversarial (1 reviewer: quality), validation | tdd-scenario-gen, implementation, adversarial-quality | 1 reviewer | Fast path, minimal overhead |
| `bugfix-heavy` | BugFix | MEDIA, COMPLEXA | workspace, classification, execution (2-3 ou 1 task/batch), adversarial (full trio), fix-loop, validation | tdd-scenario-gen, implementation, 3 adversarial | trio | Full discipline |
| `feature-light` | Feature | SIMPLES | mesma de bugfix-light | mesmo + impl variations | 1 reviewer | |
| `feature-heavy` | Feature | MEDIA, COMPLEXA | mesma de bugfix-heavy | mesmo | trio | |
| `audit-readonly` | Audit | qualquer | workspace, classification, execution (skip implementation, só análise), adversarial (skip), validation | classification, implementation (report-only) | nenhum | Audit produz relatório, não modifica código |
| `spec-medium` | Spec | MEDIA | workspace, classification, execution (1 batch por slice), validation | classification, implementation | nenhum | Spec docs production; adversarial irrelevante |
| `spec-complexa` | Spec | COMPLEXA | mesma de spec-medium + fix-loop habilitado | mesmo | nenhum | Para specs grandes com revisão iterativa |
| `uxsim-readonly` | UXSim | qualquer | workspace, classification, execution (simulação), validation | classification, implementation | nenhum | UX simulation produz relatório |

**Spec é simultaneamente type e produto (F4):** ambíguo resolvido — quando o usuário invoca `pipeline:classify` com tarefa "criar spec de X", `type=Spec`. O Spec resultante é um artefato (markdown/sub-issue), não um Run separado. Brainstorm (v1.1) cria specs ANTES de Runs; Spec variants criam specs DENTRO de um Run.

---

### 3.7 Delivery contract: sprint -> vertical slice (NEW)

Esta spec passa a ser implementada em **sprints que compõem slices verticais**. O contrato de entrega é:

1. **1 sprint = 1 incremento verificável.** Cada sprint entrega um subconjunto integrado, demonstrável e validado do slice.
2. **1..N sprints fecham 1 slice.** Um slice só fecha quando todos os sprints planejados para ele convergirem e a revisão total do slice passar.
3. **Loop adversarial obrigatório por sprint.** Cada sprint termina em checkpoint -> review adversarial -> fix -> revalidação, repetindo até não haver findings/blockers abertos.
4. **Sem avanço com dívida técnica aberta.** O próximo sprint não começa enquanto o sprint atual não estiver sem findings abertos ou sem decisão formal de re-spec.
5. **Fechamento forte do slice.** Ao concluir o último sprint, roda-se uma revisão adversarial do slice inteiro, uma bateria completa de regressão e uma checagem de rastreabilidade requisitos -> design -> testes.

#### 3.7.1 Pipeline metodológico por sprint

Todo sprint segue esta ordem:

```text
DDD boundary check
  -> ATDD acceptance contract
  -> BDD scenarios (Given/When/Then)
  -> TDD cycle (RED -> GREEN -> REFACTOR)
  -> checkpoint (build + tests)
  -> adversarial review loop
  -> regression promotion
```

- **DDD** trava fronteiras, responsabilidades e linguagem ubíqua antes de codar.
- **ATDD** define o alvo verificável do sprint e do slice.
- **BDD** transforma o alvo em cenários legíveis por humano.
- **TDD** transforma os cenários aprovados em testes falhantes e depois em implementação validada.
- **Regression promotion** exige que cenários aprovados e bugs/findings relevantes virem testes permanentes.

#### 3.7.2 Gate de fechamento de sprint

Um sprint só pode ser marcado como concluído quando:

- todos os cenários ATDD/BDD daquele sprint estiverem cobertos;
- os testes TDD estiverem verdes;
- a revisão adversarial estiver sem findings abertos;
- todo finding corrigido tiver teste de regressão correspondente quando aplicável;
- a trilha de rastreabilidade requisito -> design -> teste estiver atualizada.

#### 3.7.3 Gate de fechamento de slice

Um slice vertical só fecha quando:

- todos os sprints do slice estiverem concluídos;
- houver revisão adversarial total do slice, independente do último sprint;
- a suite acumulada de regressão do projeto estiver verde;
- o slice provar integração end-to-end, não apenas unidades isoladas.

## 4. Workflows as BDD scenarios

### 4.1 Workflow C1 — Classification

```gherkin
Feature: Task classification with manual override via sub-issue
  Como usuário do PIP
  Quero classificar minha tarefa de forma idiomática ao Paperclip
  Para que todo override seja auditável

  Scenario: Classify a simple bug fix
    Given uma issue no Paperclip com descrição "fix typo in login button" + repo_url
    When eu invoco a tool pipeline:classify com o ID da issue
    Then PIP provisiona Workspace (lock acquired no repo+branch)
    And PIP cria Run com type=BugFix, complexity=SIMPLES, variant=bugfix-light
    And cria sub-issue de aprovação da Classification assignada a mim
    And emite ClassificationProposed (com gate_metadata)

  Scenario: Reject and reclassify
    Given Run com Classification proposta = COMPLEXA
    When eu rejeito a sub-issue com nota "this is just a config change"
    Then PIP cria nova sub-issue tipo "manual classification" pedindo type+complexity explícito
    And emite ClassificationRejected seguido de ManualClassificationRequested

  Scenario: Manual classification via sub-issue (substitui --force flag, HC2)
    Given sub-issue de manual classification aberta
    When eu preencho type=Bug Fix, complexity=SIMPLES, justification="config change"
    Then PIP cria Classification nova com origem=manual, justification persistida
    And registra gate_decision MANUAL_CLASSIFICATION_APPLIED (hardness=AUDIT)
    And segue fluxo normal de aprovação

  Scenario: Workspace lock conflict
    Given Run A ativo com lock em repo X branch main
    When eu invoco pipeline:classify pra Run B no mesmo repo+branch
    Then PIP rejeita Run B com erro WorkspaceProvisioningFailed
    And mensagem explica conflito + link pro Run A
```

### 4.2 (Removed) Workflow C2 — Planning

Movido pra v1.1 (F16). No v1.0, MEDIA+ sem plan formal — usuário valida classificação via sub-issue e Execution começa.

### 4.3 Workflow C3 — TDD scenario approval

```gherkin
Feature: Test-driven scenarios approval
  Scenario: Approve test scenarios one by one
    Given Run em Execution phase com Classification aprovada
    When PIP entra no step de TDD scenario generation
    Then cria N sub-issues, uma por cenário em Given/When/Then
    And usuário aprova cada sub-issue individualmente
    And só após TODOS aprovados PIP entra em implementation

  Scenario: Reject a scenario
    Given sub-issue de cenário pendente
    When rejeitada com nota "não cobre input vazio"
    Then agente tdd-scenario-gen re-invocado com a nota
    And cria nova versão do cenário em sub-issue nova
```

### 4.4 Workflow C4 — Batched implementation com Batch State Machine

#### 4.4.1 Batch sizing rule (deterministic)

```
SIMPLES  → 1 Batch com todas as tasks
MEDIA    → ceil(N_tasks / 2.5) Batches, max 3 tasks por Batch
COMPLEXA → N_tasks Batches, 1 task cada
```

#### 4.4.2 Batch state machine (NEW, F2)

```
                  +----------+
                  | pending  |
                  +----------+
                       |
                       v
              +---------------+
              | implementing  |
              +---------------+
                       |
                       v
            +---------------------+
            | checkpoint_running  |
            +---------------------+
              |               |
          PASS               FAIL
              v               v
+----------------------+  +----------------------+
| checkpoint_passed    |  | checkpoint_failed    |
+----------------------+  +----------------------+
              |               |
              v               v
       +-----------+     +---------+
       | reviewing |     | fixing  |
       +-----------+     +---------+
        |        |          |
     PASS    FAIL          FIX_OK or FIX_EXHAUSTED
        |        |          |
        v        v          v
+-------------+ +---------+ +-(loop back to implementing)
| review_     | | review_ |
| passed      | | blocked |
+-------------+ +---------+
        |           |
        v           v
+-----------+   +---------+
| completed |   | fixing  |
+-----------+   +---------+
                    |
              (loop até max_fix_attempts)
                    |
                    v
            +-----------+
            | aborted   | (se exhausted)
            +-----------+
```

**Ownership.** O Execution context é o ÚNICO escritor de `batches.state`. Outros contexts emitem events que o Execution consome e transiciona.

**Idempotência.** Cada transição registra `attempted_transition_id` (ULID) em log temporário; retries por restart de worker checam log antes de re-aplicar.

#### 4.4.3 BDD scenarios

```gherkin
Scenario: Checkpoint blocks progress on test failure
  Given Batch em estado implementing terminou
  When checkpoint_running roda build+test e falha
  Then estado vira checkpoint_failed
  And cria Sub-Issue de fix com output do erro
  And estado vira fixing
  And fix_attempts incrementa
  And próximo Batch NÃO é despachado

Scenario: Fix loop exhausted
  Given Batch.fix_attempts atingiu max (3 por padrão, parametrizável por Variant)
  When tentativa 3 falha
  Then estado vira aborted
  And emite FixLoopExhausted
  And Validation context consome e emite Verdict=NO-GO
```

### 4.5 Workflow C5 — Adversarial review trio (zero contexto, sem escape hatch)

```gherkin
Feature: Independent adversarial review without context-leak escape hatch
  Scenario: Three reviewers launched in parallel with DiffSnapshot only
    Given Batch em estado checkpoint_passed
    When Adversarial Review phase começa
    Then EXATAMENTE três sub-issues criadas simultaneamente
    And cada assignada a agente distinto (security|architecture|quality)
    And cada recebe APENAS o DiffSnapshot (id, diff_content) — sem implementação, sem plan, sem rationale
    And as três rodam em paralelo

  Scenario: Reviewer needs more context (F7 — no escape hatch)
    Given reviewer não tem contexto suficiente
    When ele tenta produzir Finding
    Then ele PODE emitir Finding tipo "insufficient_context" com severity MEDIUM
    But NÃO pode abrir sub-issue de clarificação
    And o Finding entra no fluxo normal: usuário resolve (provendo mais contexto via fix loop) ou waives

  Scenario: All clean
    Given todas três sub-issues approved sem findings
    Then estado vira review_passed
    And próximo Batch (se houver) despachado

  Scenario: Waiver de CRITICAL (F14 — policy stricter)
    Given Finding severity=CRITICAL
    When usuário inicia waiver
    Then PIP exige (a) justificativa não-vazia min 50 chars, (b) second approver (role="admin" ou explicitly authorized)
    And registra waiver no DB com waived_by + approver_id
    And emite gate_decision CRITICAL_WAIVED (hardness=HARD)
    And ao final do Run, qualquer Critical waived força Verdict mínimo CONDITIONAL (nunca GO)
```

### 4.6 Workflow C6 — Gate decision log com hash chain

```gherkin
Scenario: Every decision lands in DB with hash chain
  Given qualquer gate disparado em qualquer phase
  Then row em gate_decisions com prev_hash apontando pra última entry do mesmo run_id
  And this_hash = SHA256(sequence||gate_name||decision||decided_by||timestamp||prev_hash||rationale)
  And evento publicado no event bus contém gate_metadata

Scenario: Tamper detection
  Given suspeita de modificação no log
  When usuário invoca tool pipeline:verify-audit-chain com run_id
  Then PIP recomputa hashes em ordem e compara com persistido
  And reporta tamper se qualquer this_hash divergir

Scenario: Dashboard renders feed in real-time
  Given usuário tem painel aberto na issue parent
  When nova gate_decision registrada
  Then feed atualiza sem reload
  And mostra hardness colorido + indicador de hash-chain válido
```

### 4.7 Workflow C7 — Final validation

```gherkin
Scenario: All clean → GO
  Given todos Batches state=completed, nenhum Finding open, nenhum CRITICAL waived
  When final-validator (lógica embarcada em Validation context no v1.0) roda
  Then Verdict=GO, Run.state=completed
  And notificação enviada na issue parent

Scenario: Critical waived → CONDITIONAL min
  Given pelo menos 1 Finding severity=CRITICAL state=waived
  Then Verdict mínimo CONDITIONAL (mesmo se tudo mais clean)

Scenario: FixLoopExhausted → NO-GO
  Given algum Batch state=aborted via FixLoopExhausted
  Then Verdict=NO-GO, Run.state=aborted
  And sub-issue post-mortem criada automaticamente com snapshot do Batch falhante
```

### 4.8 (Removed) Workflow C8 — Brainstorm

Movido pra v1.1 (F16). No v1.0, usuário brainstorma fora do PIP e invoca `pipeline:classify` com descrição refinada.

---

## 5. Design decisions with justification

### D1 — Sub-issues em vez de subagentes em-processo

(inalterado vs v0.1)

### D2 — Plugin DB em vez de arquivos, TEXT pra JSON pendente confirmação

**Escolha.** Plugin DB do Paperclip via API oficial. Campos JSON armazenados como `TEXT` (parse via JSON.stringify/parse) até Q1 (sync/async + backend) ser resolvido na implementação.

**Por que TEXT.** Compatível com SQLite (provável) E Postgres. Custo de overhead aceitável pro v1.0 onde queries SQL complexas em campos JSON não são requisito. Quando backend confirmar Postgres, migration pode promover colunas TEXT→JSONB sem perda.

### D3 — React UI minimal no v1.0

**Escolha.** Um único painel `RunDashboard.tsx` com seções colapsáveis (gates, batches, findings, workspace), em vez de painéis separados.

**Por que minimal.** F16/R6 — autor solo. Painel único reduz superfície de manutenção. Painéis adicionais (GateDecisionFeed dedicado, AdversarialBoard) ficam pra v1.1 quando padrões emergirem do uso real.

### D4 — Event bus + idempotência via dedup_key

**Escolha.** Event bus assíncrono. Handlers críticos (criação de Sub-Issue, registro de gate, transição de Batch state) usam `dedup_key` (hash determinístico de inputs) + UNIQUE constraint no DB pra garantir at-most-once mesmo com replay.

**Por que.** F12 — idempotência precisa ser de design, não promessa.

### D5 — Approval flow assíncrono (inalterado)

### D6 — Capability gating mínimo + audit 1:1 vs workflows

(inalterado, mas auditoria adicionada em Sec 3.3 — F11)

### D7 — Adversarial trio sem escape hatch (F7 hardened)

**Escolha.** Reviewer NÃO pode pedir clarificação. Se contexto insuficiente, emite Finding `insufficient_context` que entra no fluxo normal.

**Por que.** Preservar integridade do princípio "zero contexto". Escape hatch criaria gradiente de "às vezes recebe contexto, às vezes não", impossível de auditar. Cost: alguns Findings serão de baixa qualidade — mitigado por iteração no prompt do agente reviewer.

### D8 (NEW) — Workspace lock single-active per repo+branch

**Escolha.** Apenas 1 Run ativo por (repo_url, base_branch). UNIQUE INDEX no DB + check no Workspace provisioning. Concorrente falha com mensagem clara.

**Por que.** F18 — sem lock, dois Runs no mesmo repo corrompem diff um do outro. Worktrees seriam solução elegante mas Paperclip suporte é incerto; lock é mecanismo universal.

### D9 (NEW) — Hash-chain em gate_decisions

**Escolha.** Cada `gate_decisions` carrega `prev_hash` e `this_hash`. Tool `pipeline:verify-audit-chain` recomputa e valida.

**Por que.** F19 — alegação de tamper-resistance precisa de mecanismo real, não só "write-only do worker" (que é teatro quando worker é o único processo). Hash-chain é a primitiva mais simples que entrega tamper-detection.

### D10 (NEW) — Waiver policy com 2-person rule pra CRITICAL

**Escolha.** Waiver de Finding CRITICAL exige: justificativa min 50 chars + second approver (role=admin OU explicitly authorized). CRITICAL waived força Verdict mínimo CONDITIONAL.

**Por que.** F14 — sem policy, "qualquer string não-vazia" desarma segurança. 2-person rule é padrão em compliance/SRE.

### D11 (NEW) — Variant catalog explícito (Sec 3.6)

(novo, F10)

### D12 (NEW) — Correlation_id independente de run_id

**Escolha.** `runs.correlation_id` é ULID separado de `runs.id`. Pra v1.0, correlation_id=run_id na maioria dos casos. V1.1+ Brainstorm cria `session_id` separado que vira `correlation_id` do Run resultante.

**Por que.** F13 — "correlation_id (== run_id na maioria dos casos)" é gap. Pre-Run flows precisam de correlation próprio.

---

### D13 (NEW) - Sprints só avançam com adversarial limpo

**Escolha.** A implementação desta spec será organizada em sprints internos por slice, e cada sprint termina com loop adversarial obrigatório até zerar findings/blockers ou forçar re-spec formal.

**Por que.** O risco real do projeto não é apenas codar errado; é empilhar dívida e mover problema para frente. O loop adversarial por sprint impede vazamento de defeitos entre sprints e a revisão total do slice evita falsa sensação de segurança baseada só no diff incremental.

## 6. Risks and mitigations (revised)

| ID | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Paperclip SDK ainda evoluindo, breaking changes | Média | Alto | Pin SDK version. Subscribe issue tracker. Build em cima de APIs documentadas apenas |
| R2 | Async approval UX rejeitada por usuários acostumados com síncrono | Alta | Médio | Documentar com clareza. Não tentar simular síncrono. Migrar gradualmente |
| R3 | Plugin DB schema migration em produção | Média | Alto | Sec 3.5 policy completa. Testar upgrades em fixtures CI |
| R4 | Performance de N sub-issues paralelas | Baixa | Médio | Profile cedo. Adversarial trio é fixo em 3, não escala com N |
| R5 | Capability gating restritivo bloqueia features | Média | Médio | Capabilities solicitadas com escopo expansivel. Documentar rationale |
| R6 | React UI complexa pra solo manter | Reduzido (Médio→Baixo) | Médio | F16: cortado pra 1 painel no v1.0 |
| R7 | Reviewers sem contexto produzem findings de baixa qualidade | Alta | Médio | Iterar prompts. Permitir Finding "insufficient_context" (Finding, não clarificação). Aceitar custo |
| R8 | Skills conflitam com globais | Baixa | Baixo | Namespace `pip:` |
| R9 (NEW) | Workspace lock cria fila em times com 1 repo só | Alta | Baixo | Documentar. V1.1 pode adicionar worktree-based isolation |
| R10 (NEW) | Hash-chain verificação cara em Runs gigantes | Baixa | Baixo | Verificação on-demand, não em todo write |
| R11 (NEW) | 2-person waiver cria fricção em times solo | Alta | Médio | Policy permite "self-approve com cooldown" via config — admin único pode waive após 1h pensando |

---

## 7. Non-functional requirements

### 7.1 Performance

- Latência de classification ≤ 30s
- Latência por batch (impl + checkpoint) ≤ 5min SIMPLES, ≤ 15min MEDIA, sem cap COMPLEXA
- Throughput de gate_decisions ≥ 100/min no DB
- UI refresh ≤ 2s
- Hash-chain verify de Run com 200 entries ≤ 5s

### 7.2 Segurança

- Plugin sandbox via capabilities
- IPC boundary validado em todo tool call e event publish
- Secrets via Paperclip secrets API
- Audit log com hash-chain (D9), `pipeline:verify-audit-chain` tool
- Inputs sanitizados antes de DB
- Waiver CRITICAL 2-person rule (D10)

### 7.3 Escalabilidade

- Múltiplos Runs concorrentes EM REPOS DIFERENTES rodam isolados
- Mesmo repo+branch: 1 Run por vez (D8/F18)
- Worker stateless além do DB
- Event bus com dedup_key pra idempotência (D4)

### 7.4 Observabilidade

- Todo event tem `correlation_id` (D12)
- Logs estruturados JSON
- Integração com Paperclip logging
- Métricas opcionais Prometheus (v1.1+)

### 7.5 Manutenibilidade

- Bounded context isolado em `src/contexts/<name>/`
- Cross-context APENAS via events
- Cobertura mínima 80% por context
- Migrations versionadas, never rewrite (D2)

---

## 8. Pontos em aberto pra resolver durante implementação

Items movidos pra task de Setup (slice 1):

- **Q1.** Forma exata da API `plugin.db.query()` — sync/async/promise. **Bloqueia slice 1.** Resolver antes de schema.
- **Q2.** `ui.detailTab.register` injection mechanism — verificar no scaffolder
- **Q3.** Granularidade de `events.subscribe`
- **Q4.** Lifecycle de `agent.tools.register` em hot-reload
- **Q5.** Skill namespacing convention
- **Q6.** Onde documentação do plugin é renderizada
- **Q7 (NEW).** Suporte Paperclip a git worktrees nativos (impacta D8 fallback)
- **Q8 (NEW).** Backend do plugin DB (SQLite/Postgres) — impacta TEXT vs JSONB
- **Q9 (NEW).** Mecanismo nativo de "second approver" no Paperclip (impacta D10 implementation)

---

## 9. Out-of-scope para v1.0 (movidos de v0.1)

- **Planning** bounded context — deferido v1.1
- **Brainstorm** bounded context — deferido v1.1
- **Final adversarial review opt-in trio** — embarcado em Adversarial Review v1.0; v1.1 separa
- **Painéis UI separados** (GateDecisionFeed, AdversarialBoard) — embedded em RunDashboard v1.0
- **Prometheus exporter** — v1.1+
- **Worktree-based parallelism** — v1.1+ se Paperclip suportar
- **Migration rollback automático** — v1.2+ (manual scripts no v1.0)

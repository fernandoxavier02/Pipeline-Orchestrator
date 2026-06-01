# A2 — Design da Fase A (Reforjo)

**Status:** Draft v1.1 — adversarial review concluído (2026-05-24) + CALIBRADO pós-execuções (2026-06-01, ver A0-CALIBRACAO-pos-execucoes-2026-06-01.md)
**Data:** 2026-05-24
**Depende de:** A1-requirements.md, fontes canônicas listadas em A1 §7
**Metodologia:** DDD (bounded contexts + ubiquitous language), BDD (cenários por decisão de design), Decision Log embutido

---

## Critérios de aceitação deste documento (ATDD — antes da escrita)

```gherkin
Feature: A2-design descreve a arquitetura técnica da Fase A

  Scenario: Mapeamento de portões presente
    Given o canonical tem 35 portões com hardness taxonomy
    When eu leio A2-design.md
    Then encontro a arquitetura de mapeamento gate → approval type com schema do payload

  Scenario: Protocolo de não-autonomia documentado
    Given o Axioma 1 proíbe autonomia decisória
    When eu leio A2-design.md
    Then encontro o protocolo completo com INVARIANTS block template e os 62 decision points

  Scenario: Decision log presente
    Given o Princípio 6 exige decision log embutido
    When eu leio A2-design.md
    Then encontro pelo menos 5 decision log entries com contexto/alternativas/justificativa/consequências

  Scenario: 14 lentes de gap inventory aplicadas
    Given o Princípio 8 exige 14 lentes
    When eu leio A2-design.md
    Then encontro a seção "Gap Inventory" com resultado de cada uma das 14 lentes
```

---

## 1. Bounded Contexts da Fase A

A Fase A opera dentro de dois bounded contexts principais, mais um cross-cutting:

### BC1 — Gate Enforcement

**Responsabilidade:** Traduzir cada um dos 35 portões do canonical em approval types do Paperclip, garantindo que nenhum portão seja pulado ou falsificado.

**Entidades:** GateDefinition, ApprovalType, GateDecision, ApprovalIssue
**Invariantes:** Todo portão MANDATORY nunca tem decision = "SKIPPED". Todo portão HARD bloqueia a issue pai até resolução.
**Aggregate root:** GateRegistry (lido do executionState.pipeline.gate_registry_version)

### BC2 — Non-Autonomy Protocol

**Responsabilidade:** Garantir que nenhum cargo execute ação crítica sem approval explícito do Board. Detectar e alertar desvios.

**Entidades:** Cargo, InvariantsBlock, EscalationRequest, SentinelAlert
**Invariantes:** Todo cargo tem InvariantsBlock antes de qualquer instrução de workflow. Todo desvio gera SentinelAlert em ≤1 ciclo de heartbeat.
**Aggregate root:** Cargo (AGENTS.md = arquivo de persona)

### BC3 — Audit Trail (cross-cutting)

**Responsabilidade:** Registrar toda decisão de portão com evidência verificável via hash chain. Garantir não-repudiação.

**Entidades:** AuditEntry, HashChain, ExecutionState
**Invariantes:** Toda mudança de estado gera uma AuditEntry. A hash chain nunca tem gaps.
**Aggregate root:** ExecutionState (issue.executionState JSON)

---

## 2. Arquitetura de Gate Enforcement

### 2.1 Schema do Approval Type

Cada portão do canonical mapeia para um approval type no Paperclip com o schema:

```json
{
  "approval_type": "pip:ssot-conflict",
  "gate_name": "SSOT_CONFLICT",
  "hardness": "MANDATORY",
  "trigger_condition": "Múltiplas fontes de verdade detectadas para o mesmo dado",
  "payload": {
    "gate_name": "SSOT_CONFLICT",
    "hardness": "MANDATORY",
    "decision": null,
    "evidence": null,
    "timestamp": null,
    "decided_by": null,
    "gate_registry_version": "v7.2.0",
    "hash_chain_head": null
  },
  "allowed_decisions": ["BLOCKED"],
  "prohibited_decisions": ["SKIPPED", "APPROVED", "WAIVED"],
  "resolution_path": "Usuário resolve conflito e reabre issue; nunca auto-resolve"
}
```

**Decisão de design (DL-001):** Approval type segue o formato `pip:<snake_case_gate_name>` para portões core e `pip-spec:<snake_case_gate_name>` para portões do ciclo spec. Alternativas consideradas: (a) usar IDs numéricos (`pip:001`), (b) usar o nome exato do portão sem prefixo. Escolha: prefixo semântico porque facilita lookup humano no quadro do Paperclip e evita conflito de namespace com outros plugins.

### 2.2 Mapeamento por Hardness

| Hardness | Política no Paperclip | Pode ter decision=SKIPPED? |
|---|---|---|
| MANDATORY | Approval issue com `priority: critical`; issue pai fica `blocked` sem exception | Nunca |
| HARD | Approval issue com `priority: high`; issue pai fica `paused` até resolução | Nunca |
| CIRCUIT_BREAKER | Approval issue + status da issue pai = `blocked`; apresenta 3 opções de reset ao Board | Nunca (o circuit breaker pode ser RESET, não skipped) |
| SOFT | Approval issue com `priority: normal`; pode ser dispensada com comment estruturado `### SKIP_SOFT_GATE v1` | Sim, com log obrigatório |
| AUDIT | Apenas comment estruturado `### AUDIT_EVENT v1`; nunca cria approval issue | Não se aplica (audit é informacional) |

### 2.3 Tradução do Achado #7 para o Paperclip

O Achado #7 documenta que o harness do Claude Code remove ferramentas como `AskUserQuestion` dos subagentes. No Paperclip, o problema análogo é diferente: os cargos Codex não têm "parent LLM" para hoistear — cada cargo é um processo Codex independente. A tradução é:

| Bloco canonical | Equivalente Paperclip Fase A |
|---|---|
| `GATE_REQUEST` → `AskUserQuestion` no parent | Criar approval issue atribuída ao Board; cargo muda status para `paused`; pega próxima task |
| `DISPATCH_REQUEST` → `Agent(subagent)` no parent | Criar sub-issue com `blockedBy: [issue_atual]`; atribuir ao cargo destino; esperar heartbeat |
| `PLAN_MODE_REQUEST` → `EnterPlanMode` no parent | Criar sub-issue do tipo "plan-research" atribuída ao cargo planejador; issue principal fica `paused` |

**Decisão de design (DL-002):** Usar pausa assíncrona (`status=paused` + nova issue) em vez de polling ativo. Alternativas: (a) cargo faz polling via GET `/api/issues/{id}` a cada heartbeat, (b) cargo usa webhook (não disponível sem SDK). Escolha: pausa + heartbeat é o padrão idiomático do Paperclip (documentado nos PAPERCLIP-AXIOMS.md §5). Polling seria anti-padrão e criaria race conditions.

### 2.3.1 Scoped Wake (otimização de heartbeat)

Quando um approval issue é resolvido pelo Board, o cargo correspondente pode pular os passos 1-4 do heartbeat padrão (identity check, approval follow-up, planning check, assignments scan) e ir direto ao passo 5 (checkout). Isso reduz latência em wakes dirigidos.

**Mecanismo no Paperclip:** o cargo wake-up carrega `PAPERCLIP_WAKE_PAYLOAD` contendo `{trigger_kind: "approval_resolved", approval_id: "...", issue_id: "...", resolution: "..."}`. Se trigger_kind for approval_resolved E timestamp < 60s atrás, cargo aplica scoped wake.

**Quais portões são scoped-wake-applicable:** ver coluna dedicada em `tables/gates-mapping.md`. Portões que requerem re-classificação de contexto (ex: COMPLEXITY_GATE, STALE_CONTEXT) NÃO são scoped — forçam full heartbeat.

**Decisão de design (DL-007):** Adotar scoped wake como otimização default. Alternativas: (a) sempre full heartbeat (mais seguro, ~3x mais lento), (b) cargo decide se aplica scoped (autonomia indesejada per Axioma 1). Escolha: tabela declarativa em gates-mapping.md define scoped vs full por gate type — sem decisão runtime do cargo.

Fonte: paperclip-kb.md §11 (Scoped Wake + HEARTBEAT_OPTIMIZATION da v7.5.0).

### 2.4 ExecutionState — Schema da Fase A

> **REVISADO PÓS-SPIKE T-A2-01 (2026-05-24):** o substrato mudou de `issue.executionState` para **comentários estruturados** da issue (`POST /api/issues/{id}/comments`, body prefixado `PIPELINE_STATE <json>`). Motivo: o spike provou que `executionState` não é gravável pela API loopback (coluna declarada mas não-ligada na versão 2026.517.0). O **formato lógico** do `gate_decision` abaixo permanece válido — muda apenas onde mora. Cada entry passa a carregar `previous_hash` explícito (comentários são registros independentes). Ver `.pipeline/docs/spikes/T-A2-01-report.md` e DL-003/DL-004/DL-006 revisados.

```json
{
  "schema_version": "fase-a-v1.0",
  "pipeline": {
    "pipeline_id": "{ISO_TIMESTAMP}_{variant}_{cargo_slug}",
    "variant": "bugfix-heavy",
    "current_phase": "execution",
    "gate_registry_version": "canonical-v7.2.0",
    "gate_decisions": [
      {
        "gate_name": "INFO_GATE_BLOCKED",
        "hardness": "HARD",
        "decision": "APPROVED",
        "evidence": "information-gate cargo confirmou 0 gaps",
        "timestamp": "2026-05-24T10:30:00Z",
        "decided_by": "board",
        "approval_issue_id": "issue_12345",
        "hash": "sha256:abc123..."
      }
    ],
    "hash_chain_head": {
      "value": "sha256:abc123...",
      "previous_hash": "sha256:def456...",
      "computed_at": "2026-05-24T10:30:00Z",
      "max_age_seconds": 3600,
      "clock_skew_tolerance_seconds": 60,
      "crc32_verification": "0x12345678",
      "concurrent_writer_id": "cargo:information-gate"
    },
    "consecutive_failures": 0,
    "batch_state": {
      "current_batch": 1,
      "total_batches_estimated": 3,
      "last_batch_result": "PASS"
    }
  }
}
```

**Decisão de design (DL-003):** Armazenar gate_decisions inline no executionState vs criar tabela separada via API do Paperclip. Alternativas: (a) POST para endpoint customizado de gate log (não existe sem SDK), (b) criar issue separada de "audit log" com comments, (c) activity log nativo (somente leitura para o cargo). Escolha: inline no executionState porque é o único campo JSON extensível disponível sem SDK, é lido com GET simples, e permite hash chain localmente.

**Defesa contra race condition (DL-003a):** O campo `hash_chain_head` agora é objeto estruturado (não string) com `value`, `previous_hash`, `computed_at`, `max_age_seconds=3600`, `clock_skew_tolerance_seconds=60`, `crc32_verification`, e `concurrent_writer_id`. Antes de cada PATCH no executionState, o cargo computa:
1. Compare-and-swap (CAS): novo PATCH inclui `previous_hash` do estado lido; se servidor já tem hash diferente, conflito detectado → retry com merge.
2. Clock skew check: rejeita entries com timestamp > now + 60s (skew tolerance) ou < now - max_age_seconds.
3. CRC32 verification: hash SHA-256 + CRC32 detecta corrupção acidental sem custo computacional grande.

Fonte: paperclip-kb.md §5.5 (v7.5.0 concurrent-safe tracing spec).

> **REVISADO PÓS-SPIKE T-A2-01 (2026-05-24):** com o substrato em comentários (append-only), **não há PATCH in-place no mesmo registro**, logo o Compare-and-swap (item 1) deixa de ser necessário — a concorrência vira "dois writers adicionam comentários" e a ordem se resolve seguindo `previous_hash`. Itens 2 (clock-skew, validado no spike) e 3 (CRC32, opcional) permanecem como regras locais aplicadas antes de postar a entry. `hash_chain_head` deixa de ser um campo mutável; o "head" é o comentário mais recente da corrente.

### 2.5 Skill Lazy Loading e Governance

Os cargos Paperclip carregam skills sob demanda usando o protocolo de skill-frontmatter-parser canonical. Cada skill em `~/.paperclip/instances/default/skills/<skill-name>/SKILL.md` declara frontmatter YAML:

```yaml
---
name: pipeline-orchestrator-iron-laws
description: 7 leis invioláveis do pipeline (TDD-first, ask-first, self-review, stop-rule, scope-lock, evidence-required, contract-respect)
when_to_use: Carregar quando o cargo opera em pipeline com TDD ou em workflow que toca código de produção
inputs:
  - workflow_type: bugfix|feature|spec|audit|ux|adversarial
  - phase: triagem|planejamento|execucao|revisao|fechamento
---
```

**Mecanismo de loading:** symlink criado em `$CODEX_HOME/skills/` (codex_local) ou `$CLAUDE_HOME/skills/` (claude_local) aponta pra skill folder. Cargo lê `loaded-skills.json` no `$AGENT_HOME` pra saber o que já está carregado na sessão; só carrega novo se ausente ou se versão mudou (campo `version` do frontmatter).

**Schema completo de `$AGENT_HOME/loaded-skills.json` (resolve I3):**

```json
{
  "schema_version": "1.0",
  "session_id": "{cargo_uuid}_{heartbeat_seq}",
  "last_sync": "2026-05-24T15:30:00Z",
  "loaded": [
    {
      "name": "engineering-principles",
      "version": "1.0.0",
      "loaded_at": "2026-05-24T15:30:00Z",
      "source_path": "~/.paperclip/instances/default/skills/engineering-principles/SKILL.md",
      "checksum_sha256": "abc123..."
    },
    {
      "name": "pipeline-orchestrator-iron-laws",
      "version": "1.0.0",
      "loaded_at": "2026-05-24T15:31:00Z",
      "source_path": "~/.paperclip/instances/default/skills/pipeline-orchestrator-iron-laws/SKILL.md",
      "checksum_sha256": "def456..."
    }
  ],
  "unloaded_due_to_version_bump": [],
  "load_errors": []
}
```

**Integração com passo 6 do heartbeat (KB §3.3):**

```
HEARTBEAT STEP 6 — "Load skills if needed":
  1. Read $AGENT_HOME/loaded-skills.json (create if absent with empty `loaded: []`)
  2. For each skill referenced no AGENTS.md ou na task atual:
     a. Search in loaded[] by name
     b. If absent → load skill (read SKILL.md frontmatter + content), append to loaded[]
     c. If present BUT version no frontmatter != loaded[].version → reload + log em unloaded_due_to_version_bump
     d. If present AND version matches → reuse from session memory, NO reload
  3. Append load_errors[] em caso de SKILL.md malformado ou symlink quebrado
  4. PATCH $AGENT_HOME/loaded-skills.json com last_sync atualizado
```

**Garantia de paridade entre heartbeats:** o arquivo persiste entre wakes, então a sessão Codex consegue cache hits após o primeiro load. Reset acontece quando: (a) cargo é re-instalado, (b) Onda A3 deploya skill nova, (c) operador limpa manualmente.

**11 skills custom disponíveis nesta Fase A** (lazy-loadable, sem modificação permitida durante Onda A1):
- `engineering-principles` (canonical, base dos 9 axiomas: SOLID + KISS + DRY + YAGNI + SSOT + Clean + fail-fast)
- `pipeline-orchestrator-iron-laws` (7 leis invioláveis)
- `pipeline-orchestrator-contracts` (formato YAML de blocos estruturados)
- `pipeline-orchestrator-classification` (taxonomia type+complexity+variant)
- `pipeline-orchestrator-tdd` (RED→GREEN→REFACTOR + naming)
- `pipeline-orchestrator-spec-protocol` (EARS + Gherkin + spec.json schema)
- `pipeline-orchestrator-bugfix-method` (diagnostic + root-cause + regression)
- `pipeline-orchestrator-vsa` (vertical slice architecture)
- `pipeline-orchestrator-ux-method` (persona matrix + journey + A11y)
- `pipeline-orchestrator-audit-method` (intake + domain + compliance + risk-matrix)
- `pipeline-orchestrator-adversarial` (severity rubric + zero-context contract)

**Decisão de design (DL-008):** Cargos da Fase A consomem skills via lazy loading durante heartbeat (passo 6 do KB §3.3). Rollout de skills novas é PROIBIDO em Onda A1 (HC3-A). Onda A2 pode propor extensões; Onda A3 pode aplicar via deploy versionado. Alternativa rejeitada: pré-carregar todas as 11 skills em todos os cargos no boot — desperdiça memória de contexto e contradiz lazy loading idiomático do Paperclip.

Fonte: paperclip-kb.md §4 (Skills System) + 11 SKILL.md inspecionados.

### 2.6 Despacho Dinâmico de Subagentes por Fase

Quando um cargo precisa delegar trabalho (equivalente a `DISPATCH_REQUEST` no canonical), ele cria uma sub-issue com `parent_id = issue_atual` e `blockedBy = [issue_atual.id]`. A issue pai muda automaticamente pra `status=blocked` enquanto a child estiver pendente.

**Tabela de despacho por fase:**

| Fase | Cargo Despachador | Subagentes Despachados | Tipo de Issue | Bloqueante? |
|---|---|---|---|---|
| Triagem | task-orchestrator | information-gate | assessment | sim |
| Planejamento | design-interrogator OU plan-architect | (varia por workflow) | planning | sim |
| Execução | executor-controller | feature-implementer, executor-implementer-task, bugfix-diagnostic-agent, etc. (depende de variant) | batch | sim |
| Revisão Adversarial | review-orchestrator | adversarial-security-scanner + adversarial-architecture-critic + adversarial-quality-reviewer (3 em paralelo) | findings | sim |
| Fechamento | final-validator | (nenhum — finaliza) | closeout | não |

**Regra:** cargo despachador NÃO pode avançar a issue pai pra próximo status enquanto qualquer child sub-issue não estiver com `status=done`. Validação via blockedBy[] e blockerAttention.unresolvedBlockerCount.

**Decisão de design (DL-009):** Despacho é DECLARATIVO (tabela acima) — cargo consulta a tabela do workflow ativo, não decide ad-hoc. Alternativa rejeitada: cargo "escolhe" o subagente mais apropriado — contradiz Axioma 1 (não-autonomia).

Fonte: paperclip-catalog.md (mapping 46 agentes CC) + A2 §1 Bounded Contexts.

### 2.7 Composição e Governança do Board

No plugin canonical, "Board" = humano operador interagindo via terminal. Na Fase A do Paperclip, Board é modelado como:

1. **Issue approver default**: quem recebe approval issues criadas pelos cargos. Configurável em `~/.paperclip/instances/default/board/AGENTS.md` (persona especial, sem heartbeat — `runtimeConfig.heartbeat.enabled = false`).
2. **Colegiado aberto**: qualquer usuário com role `admin` ou `owner` pode resolver approval issue (sem 2-person rule por default — HC5-A SOFT preference recomenda 2-person pra approvals CRITICAL).
3. **Escalation target**: cargos detectando violação (DP-53 a DP-62, meta-guards) criam alert issue endereçada explicitamente ao Board com `priority: critical`.

**Decisão de design (DL-010):** Board NÃO é cargo com heartbeat (não tem AGENTS.md no formato dos cargos regulares). É persona conceitual que mapeia para "humano operador". Approval issues atribuídas ao Board ficam em fila visual no painel Paperclip; humano resolve manualmente. Alternativa rejeitada: criar cargo "board" com heartbeat automático — derrota o propósito (Axioma 1, decisão humana, não-autonomia).

**Decisão de design (DL-010a — resolve I1):** Apesar de Board NÃO ser cargo com heartbeat, criar AGENTS.md mínimo em `~/.paperclip/instances/default/board/AGENTS.md` com configuração explícita pra eliminar ambiguidade na inspeção do directory tree. Template:

```markdown
# Board (humano operador)

Esta é uma persona CONCEITUAL, não um cargo com heartbeat automático.

## Configuração runtime (declarativa, não acionável)

```yaml
runtimeConfig:
  heartbeat:
    enabled: false           # Board NÃO tem heartbeat — humano resolve manualmente
    cooldownSec: null
    intervalSec: null
    wakeOnDemand: false
    maxConcurrentRuns: 0
adapterConfig: null          # Sem adapter (Codex/Claude) — não há agente LLM
permissions:
  canCreateAgents: true      # Board pode criar/modificar cargos
  canResolveApprovals: true  # Board é o único que resolve approvals
  canBypassInvariants: true  # Board pode editar INVARIANTS blocks (com responsabilidade)
```

## Responsabilidades

1. Resolver approval issues atribuídas (gates do pipeline)
2. Aprovar/rejeitar planos, cenários TDD, findings adversariais
3. Decidir resets em CIRCUIT_BREAKER gates
4. Autorizar mudanças que afetam INVARIANTS de cargos
5. Receber alerts de violações (sentinel-agent → DP-60)

## SLA recomendado de resposta

- approval HARD/MANDATORY: ≤ 48h
- approval SOFT: ≤ 1 semana
- alert CRITICAL: ≤ 4h

## Anti-pattern

Board NUNCA é "automatizado" via cron, webhook ou IA proxy. Toda resolução é manual e humana, registrada com `decided_by: "user:<id>"` na audit chain.
```

Esse arquivo é criado em T-A3-00 (pré-rollout) e validado pelos próprios cargos que verificam existência antes de tentar atribuir approval ao Board.

**Sentinel-agent validation:** o cargo sentinel-agent (DP-60) verifica em cada heartbeat se há approval issues abertas há > 24h pro Board; se sim, cria alert duplicado com `priority: critical` pra escalation. Sem timeout automático sem SDK.

Fonte: paperclip-kb.md §12 (Approvers, Reviewers, Assignee) + A2 §3.2 (DP-53 a DP-62).

---

## 3. Protocolo de Não-Autonomia

### 3.1 Template do INVARIANTS Block

Todo AGENTS.md começa com este bloco antes de qualquer instrução de workflow:

```markdown
### INVARIANTS v1 — [NOME DO CARGO] — NÃO REMOVER NEM MODIFICAR SEM BOARD APPROVAL

#### O que este cargo NUNCA faz sem approval explícita do Board:
- [ação_crítica_1_específica_do_cargo]
- [ação_crítica_2_específica_do_cargo]
- Qualquer ação não coberta pela spec do workflow ativo

#### Quando este cargo SEMPRE cria approval issue:
- Decisão com 2+ caminhos válidos não cobertos pela spec
- Ação que modifica estado persistente além do escopo da task atual
- Finding de adversarial review com severity CRITICAL ou HIGH
- [condição_específica_do_cargo]

#### Spec do workflow ativo a consultar:
- Para bugfix: PAPERCLIP-BUGFIX-WORKFLOW.md
- Para feature: PAPERCLIP-FEATURE-WORKFLOW.md
- Para audit: PAPERCLIP-AUDIT-WORKFLOW.md
- Para UX: PAPERCLIP-UX-WORKFLOW.md
- Para spec: PAPERCLIP-SPEC-WORKFLOW.md
- Para adversarial: PAPERCLIP-ADVERSARIAL-WORKFLOW.md

#### Hierarquia de decisão:
1. Spec do workflow ativo
2. Canonical do projeto cliente (CLAUDE.md, README)
3. Skill engineering-principles
4. Escalation → criar approval issue + status=paused + pegar próxima task

#### Sinais de violação (PARAR se identificar):
- "Eu acho que..." (sem citar fonte)
- "Vou improvisar porque..." (regra exige consulta à hierarquia)
- "Vou pular adversarial porque é pequeno..." (Axioma 2 — sempre roda)
- "Vou marcar como done sem teste..." (Axioma 3 — TDD inegociável)

#### Versão deste bloco: v1.0 (2026-05-24)
```

### 3.2 Catálogo dos 62 Decision Points

Os decision points estão organizados por fase de execução. São os momentos em que um cargo poderia improvisar — e não deve.

> **Como usar para configurar INVARIANTS blocks (Finding Q1 — adversarial review):** Ao escrever o INVARIANTS block de um cargo específico, selecione os DPs relevantes para as fases que aquele cargo participa. Por exemplo: `information-gate` participa de "Triagem" (DP-01 a DP-09) — inclua esses DPs no INVARIANTS block dele. O mapeamento cargo → DPs relevantes está em `tables/agents-mapping.md` coluna "decision_points_aplicáveis".

**Fase: Triagem e Classificação (9 decision points)**
- DP-01: Tipo de tarefa ambíguo (2+ tipos possíveis) → escalation obrigatória
- DP-02: Complexidade borderline (exatamente no limite de critério) → usar critério de boundary rule (classificar como maior)
- DP-03: Override de complexidade solicitado pelo Board → registrar como gate COMPLEXITY_GATE, logar e aplicar
- DP-04: Spec detectada mas artefatos incompletos → gate SPEC_ARTIFACT_MISSING, bloquear
- DP-05: SSOT conflict detectado → gate SSOT_CONFLICT, bloquear total
- DP-06: Gaps de informação críticos → gate INFO_GATE_BLOCKED, fazer perguntas até resolver
- DP-07: Tipo pre-classificado inconsistente com keywords → emitir warning mas respeitar pre-classificação
- DP-08: Severity escalation por keywords (production, security, urgent) → aplicar escalation rules automaticamente
- DP-09: Pipeline routing ambíguo após classificação → consultar team-registry.md antes de qualquer spawn

**Fase: Planejamento (8 decision points)**
- DP-10: Board rejeita plano → retornar à Fase 1, não tentar adaptar silenciosamente
- DP-11: Board pede ajuste no plano → aplicar ajuste e re-apresentar, não assumir aprovação implícita
- DP-12: Design interrogator abre trade-off sem resposta clara → criar approval issue, não escolher por conta própria
- DP-13: Spec com 100% de tasks completas mas spec.json.phase != "closed" → rotear para spec-audit-only
- DP-14: Plan mode revela risco não antecipado → reportar antes de continuar, não esconder
- DP-15: CHANGE_CONTRACT não pode ser preenchido sem informação → gate MICRO_GATE_GAP, perguntar
- DP-16: Bounded context não mapeável com informação disponível → gap + escalation
- DP-17: Estimativa de batches mudou substancialmente vs classificação → notificar Board, não adaptar silenciosamente

**Fase: Execução por Batches (14 decision points)**
- DP-18: Micro-gate: informação ausente antes de implementar → STOP, criar approval issue
- DP-19: Scope lock: arquivo fora do CHANGE_CONTRACT encontrado → não tocar, reportar
- DP-20: Dependência não declarada no CHANGE_CONTRACT precisa ser adicionada → criar approval issue
- DP-21: Build falha após implementação → não tentar "resolver sozinho" além de 1 tentativa; gate STOP_RULE após 2
- DP-22: Teste falha inesperadamente (não o teste RED que deve falhar) → investigar e reportar antes de continuar
- DP-23: 2 falhas consecutivas → gate STOP_RULE, bloquear pipeline, criar approval issue
- DP-24: Implementação revela que o problema era diferente do diagnosticado → reportar antes de continuar
- DP-25: Fix de review ultrapassa escopo declarado → não aplicar, criar approval issue
- DP-26: Qualidade do diff acima do budget declarado → gate NEEDS_REDUCTION, não commitar
- DP-27: Novo arquivo criado onde mudança local seria suficiente → gate NEEDS_REDUCTION
- DP-28: Contrato público alterado (assinatura de função, schema, endpoint) → gate bloqueante
- DP-29: Teste existente enfraquecido (assertion removida ou threshold alargado) → proibido, reverter
- DP-30: Migração de dados necessária além do escopo → criar approval issue, não executar sem Board
- DP-31: Config de produção precisaria mudar → gate para Board, não aplicar silenciosamente

**Fase: Revisão Adversarial (10 decision points)**
- DP-32: Finding CRITICAL levantado → bloquear batch seguinte, criar approval issue, fix loop obrigatório
- DP-33: Finding HIGH levantado → fix loop (max 3 tentativas), criar approval se não resolver
- DP-34: Fix de finding ultrapassa escopo → criar approval issue, não aplicar
- DP-35: 3ª tentativa de fix falha → gate FIX_LOOP_EXHAUSTED, bloquear, criar approval issue
- DP-36: Revisor não tem contexto suficiente para emitir veredicto → gate MICRO_GATE_GAP no reviewer
- DP-37: Waiver solicitado para finding CRITICAL → apenas Board autoriza; cargo não pode auto-waivar
- DP-38: Waiver solicitado para finding HIGH → Board autoriza; logar waiver com razão explícita
- DP-39: Conflito entre dois findings adversariais → escalar para Board, não resolver por conta própria
- DP-40: Adversarial loop atingiu 3 ciclos sem resultado CLEAN → gate ADVERSARIAL_LOOP_CHECKPOINT
- DP-41: Reviewer identificou bug na spec (não no código) → reportar separadamente, não "corrigir" spec silenciosamente

**Fase: Validação e Fechamento (12 decision points)**
- DP-42: Veredicto CONDITIONAL (Pa de Cal) → apresentar condições ao Board, não fechar automaticamente
- DP-43: Veredicto NO-GO → não prosseguir, criar approval issue com findings que bloquearam
- DP-44: Score de confiança abaixo do threshold → degradar veredicto, reportar
- DP-45: Fidelity score abaixo do threshold → CONDITIONAL ou NO-GO, não GO silencioso
- DP-46: Push para branch requer conflito merge → criar approval issue, não resolver merge por conta própria
- DP-47: PR com reviewer automático encontra conflito → não resolver, criar approval issue
- DP-48: Changelog não pode ser automatizado (entry ambígua) → perguntar ao Board
- DP-49: package.json version bump conflita com tag existente → criar approval issue
- DP-50: Deploy em produção é próximo passo → gate obrigatório para Board, não executar automaticamente
- DP-51: Closeout com discard solicitado → confirmar com Board antes de qualquer git reset ou git clean
- DP-52: Tempo de contexto > 24h detectado → gate STALE_CONTEXT, revalidar antes de continuar
- DP-53: Sentinel detecta inconsistência de fase → BLOCKED, aguardar resolução antes de qualquer ação

**Meta-Guards (9 decision points)**
- DP-54: SSOT conflict detectado em qualquer momento → gate MANDATORY, bloquear total
- DP-55: Ferramenta proibida invocada (AskUserQuestion) → escalation imediata
- DP-56: Arquivo canônico fora do subdir autorizado prestes a ser modificado → STOP, escalation
- DP-57: Iron Law violation detectada → falha crítica, rollback, escalation
- DP-58: Cargo recebe tarefa fora do seu workflow declarado → criar approval issue antes de aceitar
- DP-59: Heartbeat com 2+ aprovações pendentes há >1h → alerta ao Board
- DP-60: Sentinel-agent detecta gap no activity log → criar approval issue de alerta
- DP-61: Versão do gate_registry_version no executionState diverge do canonical atual → logar AUDIT, não bloquear
- DP-62: Circuit breaker disparado (STOP_RULE ou FIX_LOOP_EXHAUSTED) → aguardar Board escolher opção de reset

### 3.3 Self-Check Protocol (pré-ação mutativa)

Antes de qualquer ação que modifica estado (criar issue, mudar status, commitar), o cargo executa este checklist mental:

```
1. Esta ação está na spec do workflow ativo? (se não → hierarquia antes de agir)
2. Esta ação está no escopo da task atual? (se não → criar approval issue)
3. Esta ação requer approval não obtida? (se sim → criar approval issue primeiro)
4. Esta ação pode ser revertida facilmente? (se não → confirmar com Board)
5. Já rodei adversarial review no batch atual? (se não → rodar antes de marcar done)
```

### 3.4 Memória de Agentes (PARA) e Recall

Cada cargo Paperclip herda o **sistema PARA** (Projects/Areas/Resources/Archives) documentado no `paperclip-kb.md §5`. Estrutura:

- **`$AGENT_HOME/memory/daily-notes/YYYY-MM-DD.md`** — daily notes do cargo; primeira seção `## Today's Plan` é consultada no passo 3 do heartbeat ("Local planning check")
- **`$AGENT_HOME/memory/projects/`** — projetos ativos (issues em execução)
- **`$AGENT_HOME/memory/areas/`** — áreas de responsabilidade (workflows do qual o cargo é parte)
- **`$AGENT_HOME/memory/resources/`** — referências reutilizáveis (skills, specs, glossários)
- **`$AGENT_HOME/memory/archives/`** — projetos/áreas inativos
- **`$AGENT_HOME/memory/knowledge-graph.jsonl`** — grafo de conhecimento estruturado (opcional na Fase A)

**Ferramentas de recall (skill `para-memory-files`):**
- `qmd query <texto>` — semantic search (embeddings, retorna top-k por similaridade)
- `qmd search <termo>` — BM25 keyword search (rápido, exato)
- `qmd vsearch <vetor>` — vector search direta (uso interno, raro)

**Regra de uso:** o cargo SÓ recupera contexto via PARA tools (não improvisa lembrar entre heartbeats). Arquivo não visto no próximo wake = dado perdido. Daily notes são append-only durante heartbeat (passo 8) e nunca editadas retroativamente.

**Decisão de design (DL-011):** Fase A NÃO modifica estrutura PARA dos 48 cargos existentes — usa o que já está configurado. Onda A3 pode adicionar daily notes pattern padronizado por cargo (template), mas o knowledge graph fica como working item de Onda A2 (decisão: usar ou não na Fase A). Alternativa rejeitada: criar memória global compartilhada entre cargos — viola isolamento de cargo + arrisca vazamento cross-empresa.

Fonte: paperclip-kb.md §5 (PARA Memory System) + skill `para-memory-files`.

---

## 4. Gap Inventory — 14 Lentes (Princípio 8)

### Lente 1 — Functional Scope
**Resultado:** A Fase A cobre enforcement de portões, protocolo de não-autonomia, trilha de auditoria e drift detection. **Lacuna identificada:** Não cobre UI rica (visual do estado do pipeline) — intencionalmente fora de escopo (Fase B). Não cobre automação de CI/CD — backlog.

### Lente 2 — Non-Functional Requirements
**Resultado:** Performance: approval issues têm latência de 1 ciclo de heartbeat (~1-5 min). Confiabilidade: hash chain verifica integridade. Escalabilidade: até 48 agentes sem bottleneck estrutural. **Lacuna identificada:** Sem SLA documentado para latência de approval. Sem monitoring de tempo de resposta do Board. Adicionado ao backlog de Onda A3.

### Lente 3 — Error Handling & Edge Cases
**Resultado:** 62 decision points catalogados cobrem os principais edge cases. **Lacunas identificadas:** (a) O que acontece se a API do Paperclip ficar indisponível durante um workflow? Resposta: o Paperclip é local (loopback), indisponibilidade implica processo morto → o cargo não consegue executar. Sem plano de recovery porque o próprio ambiente de execução estaria degradado. (b) O que acontece se dois cargos tentam escrever no executionState da mesma issue simultaneamente? Resposta: HTTP PATCH no Paperclip é atômico por issue. Race condition improvável mas não impossível — adicionado como watch item para Onda A2.

### Lente 4 — Data Model & State
**Resultado:** ExecutionState JSON é o store de estado. Schema versionado (fase-a-v1.0). Hash chain para integridade. **Lacuna identificada:** Tamanho máximo do campo executionState no Paperclip não documentado. Se gate_decisions[] crescer muito, pode haver truncamento silencioso. Mitigação: Onda A2 valida tamanho máximo no PoC.

### Lente 5 — Integration Contracts
**Resultado:** A Fase A usa apenas a HTTP API do Paperclip (loopback). Endpoints documentados: POST issues, PATCH issues, POST comments, GET issues. **Lacuna identificada:** A API não tem webhook/push — polling é necessário para eventos de approval. Latência de detecção depende do heartbeat do Paperclip (configurável mas não documentado com precisão).

### Lente 6 — Auth & Authorization
**Resultado:** A API do Paperclip é loopback sem auth (documentado: "HTTP API + CLI completos (loopback sem auth)"). Todos os cargos têm acesso equivalente. **Lacuna identificada:** Sem controle de acesso fine-grained — qualquer cargo pode criar approval issue atribuída ao Board, mesmo que a issue seja fora do seu escopo. Mitigação: INVARIANTS block limita o que o cargo DEVE fazer (enforcement de prompt, não de runtime).

### Lente 7 — Migration & Backward Compatibility
**Resultado:** A Fase A é aditiva — INVARIANTS blocks são adicionados ao topo dos AGENTS.md existentes. Workflows existentes continuam funcionando. **Lacuna identificada:** Cargos com tasks em andamento no momento do rollout (Onda A3) podem estar em estado intermediário incompatível com o novo INVARIANTS block. Mitigação: Onda A3 faz rollout gradual, começando por cargos em estado `todo` (sem tarefas ativas).

### Lente 8 — Observability & Auditability
**Resultado:** Activity log nativo do Paperclip + executionState.gate_decisions[] + hash chain = trilha auditável completa. **Lacuna identificada:** Sem dashboard de paridade em tempo real. O `parity_score` só é calculado sob demanda (nos smoke tests de A4-validation.md), não continuamente. Adicionado ao backlog de Onda A3 como feature de drift detection.

### Lente 9 — Deployment & Operations
**Resultado:** A Fase A não tem processo de "deploy" — é documentação + modificação de AGENTS.md existentes. **Lacuna identificada:** Não há rollback automático se um INVARIANTS block malformado quebrar um cargo. Mitigação: backup dos AGENTS.md originais antes de qualquer modificação em Onda A3 (ver A3-tasks.md).

### Lente 10 — Testing Strategy
**Resultado:** A4-validation.md define cenários de teste E2E por variant. Smoke tests manuais no PoC (Onda A2). **Lacuna identificada:** Sem testes automatizados para a Fase A (não há harness de test runner disponível sem SDK). Os testes são procedurais (documentados em A4) mas não automatizáveis nesta fase. Automatização disponível apenas na Fase B.

### Lente 11 — Documentation & Discoverability
**Resultado:** Esta spec (A1-A4 + tabelas + ADRs + umbrella) é a documentação completa. **Lacuna identificada:** Não há tutorial de "primeiros passos" para um novo cargo que não conhece o protocolo. Adicionado ao backlog de Onda A3 (README de onboarding por cargo).

### Lente 12 — Regulatory & Compliance
**Resultado:** A Fase A herda a licença PolyForm Shield do plugin canônico (subdir aditivo). **Lacuna identificada:** Nenhuma. O PolyForm Shield é compatível com uso interno e desenvolvimento.

### Lente 13 — Scalability & Future Growth
**Resultado:** A Fase A suporta até 48 cargos sem bottleneck estrutural. **Lacuna identificada:** Se o número de cargos crescer além de 48, a Onda A3 precisaria ser re-rodada. O design não é auto-escalável — cada cargo novo requer INVARIANTS block manual. Mitigação: essa limitação é feature da Fase A (enforcement explícito). A Fase B resolve com manifesto declarativo.

### Lente 14 — Failure Modes & Recovery
**Resultado:** Os 62 decision points cobrem failures durante a execução. **Lacunas identificadas:** (a) O que acontece se o sentinel-agent falhar (erro de execução do Codex)? Resposta: sem sentinel → sem alertas de drift. Mitigação: Board pode executar sentinel manualmente, ou criar issue para investigar. (b) O que acontece se o Board não responder a uma approval issue por muitos dias? Resposta: o cargo fica `paused` indefinidamente. Não há timeout automático sem SDK. Mitigação: Board estabelece SLA de resposta (sugestão: 48h para HARD, 1 semana para SOFT).

---

## 5. Decision Log Completo

### DL-001 — Naming convention dos approval types
**Contexto:** Precisávamos de um namespace para os approval types do Fase A que não conflitasse com outros plugins Paperclip.
**Alternativas:** (a) IDs numéricos (`pip:001`), (b) nome exato do portão sem prefixo (`ssot-conflict`), (c) prefixo semântico com snake_case (`pip:ssot_conflict`).
**Escolha:** Opção (c) — `pip:snake_case_gate_name`.
**Justificativa:** Legível no quadro do Paperclip sem lookup, sem conflito de namespace, consistente com a convenção do canonical (nomes de portões em SCREAMING_SNAKE_CASE).
**Consequências:** Toda referência à tabela gates-mapping.md usa esse formato. A Onda A2 deve validar que o Paperclip aceita dois-pontos em nomes de approval type.

### DL-002 — Pausa assíncrona vs polling para interação com Board
**Contexto:** Cargos Codex no Paperclip não têm "parent LLM" para hoistear GATE_REQUEST como no canonical.
**Alternativas:** (a) Polling ativo a cada heartbeat, (b) pausa assíncrona (`status=paused` + nova approval issue), (c) webhook (não disponível sem SDK).
**Escolha:** Opção (b) — pausa assíncrona idiomática.
**Justificativa:** É o padrão documentado nos PAPERCLIP-AXIOMS.md §5. Polling seria anti-padrão criando race conditions e carga desnecessária. Webhook requer SDK.
**Consequências:** Latência de interação é um ciclo de heartbeat, não síncrona. Isso é uma troca consciente de velocidade por idiomatismo.

### DL-003 — Armazenamento de gate_decisions no executionState
**Contexto:** Precisávamos de store de estado auditável sem SDK.
**Alternativas:** (a) Endpoint customizado de gate log (não existe sem SDK), (b) issue separada de "audit log" com comments, (c) activity log nativo (somente leitura), (d) executionState JSON inline.
**Escolha:** Opção (d) — inline no executionState.
**Justificativa:** Único campo JSON extensível disponível, leitura simples via GET, hash chain implementável localmente.
**Consequências:** Risco de truncamento se gate_decisions[] crescer demais. Validar tamanho máximo em Onda A2. Se for problema: fallback para opção (b) (issue de audit log).

**REVISADO PÓS-SPIKE T-A2-01 (2026-05-24):** Opção (d) **REFUTADA**. O spike provou que `executionState` não é gravável pela API loopback — coluna declarada mas não-ligada na versão 2026.517.0 (sem write path no bundle `paperclipai/dist`, PATCH retorna 200 e descarta, 0/13 issues preenchidas mesmo após execução). **Nova escolha: opção (b)** — gate_decisions como comentários estruturados (`POST /api/issues/{id}/comments`, body prefixado `PIPELINE_STATE <json>`). Validado end-to-end (round-trip íntegro a 386 bytes/entry, hash chain OK). Ver `.pipeline/docs/spikes/T-A2-01-report.md`.

### DL-004 — Opção A para o Sentinel State (executionState vs arquivo externo)
**Contexto:** O canonical usa `sentinel-state.json` em arquivo externo. O Paperclip não tem filesystem compartilhado entre cargos.
**Alternativas:** (A) executionState da issue (escolhida), (B) issue dedicada "sentinel state" com executionState próprio, (C) arquivo no repositório git do projeto cliente.
**Escolha:** Opção A — executionState da issue de pipeline.
**Justificativa:** Evita issue extra de overhead, o estado fica co-localizado com o pipeline que ele representa, e updates são atômicos (PATCH por issue).
**Consequências:** O sentinel-agent precisa ler a issue principal para ver o estado. Se a issue for arquivada, o estado é perdido. Mitigação: antes de arquivar, exportar executionState para comment estruturado.

**REVISADO PÓS-SPIKE T-A2-01 (2026-05-24):** Opção A dependia de `executionState` gravável — **REFUTADA** (ver DL-003 revisado). O sentinel state passa para o mesmo substrato de **comentários estruturados** da issue de pipeline. A mitigação "exportar para comment antes de arquivar" torna-se redundante (o estado já vive em comentários). Updates deixam de ser "PATCH atômico por issue" e passam a ser comentários append-only ordenados pela corrente.

### DL-005 — Rollout gradual da Onda A3 (cargo por cargo vs todos de uma vez)
**Contexto:** Aplicar INVARIANTS blocks em 48 cargos é uma operação com risco de breaking change.
**Alternativas:** (a) Todos de uma vez em janela de manutenção, (b) por categoria (core → executor → quality → brainstorm), (c) por workflow (bugfix primeiro, depois feature, etc.), (d) gradual começando por cargos em estado `todo`.
**Escolha:** Opção (d) — gradual começando por cargos sem tasks ativas.
**Justificativa:** Minimiza impacto em trabalho em andamento. Permite validar o padrão em condições reais antes de aplicar em cargos críticos.
**Consequências:** Período de transição onde alguns cargos têm INVARIANTS block e outros não. Sentinel-agent deve lidar com esse estado misto (ver A3-tasks.md).

### DL-006 — Hash chain implementada localmente vs delegada ao Paperclip
**Contexto:** Precisávamos de trilha de auditoria com integridade verificável.
**Alternativas:** (a) Confiar no activity log nativo do Paperclip (somente leitura, imutável pela plataforma), (b) implementar hash chain própria no executionState, (c) combinação das duas.
**Escolha:** Opção (c) — activity log como registro primário + hash chain no executionState como verificação adicional.
**Justificativa:** O activity log é somente leitura e confiável como registro primário. A hash chain no executionState adiciona verificação end-to-end entre entradas de gate_decisions (que não estão no activity log em formato estruturado).
**Consequências:** Dois registros precisam ser mantidos consistentes. Se divergirem, o activity log é a fonte autoritativa.

**REVISADO PÓS-SPIKE T-A2-01 (2026-05-24):** A hash chain permanece — algoritmo SHA-256 **validado no spike** (recálculo por fora bateu com o gravado). Muda apenas o local: vive nos **comentários estruturados**, não no executionState (ver DL-003 revisado). Como comentários são append-only e a API os devolve **newest-first**, a verificação **reconstrói a corrente seguindo `previous_hash` a partir de `GENESIS`** — não confia na ordem da API nem em timestamp (robusto contra clock-skew). Cada entry carrega `previous_hash` explícito.

**Especificação da hash chain (Finding S1 — adversarial review):**
- Algoritmo: SHA-256
- Input da hash: `JSON.stringify({gate_name, hardness, decision, evidence, timestamp, decided_by})` + `hash_chain_head_anterior` (string concatenada)
- Serialização: JSON.stringify com chaves em ordem lexicográfica, sem whitespace
- Implementação: Node.js `crypto.createHash('sha256').update(input).digest('hex')` — sem dependências externas
- `hash_chain_head` da primeira entrada usa `"GENESIS"` como predecessor

### DL-012 — Transport do INVARIANTS block (resolve I4)

**Contexto:** O Paperclip oferece duas formas de injetar instruções persistentes em cargos: (a) inline no `AGENTS.md` do cargo (filesystem-backed persona file), (b) via `adapterConfig.instructionsFilePath` apontando pra arquivo .md externo carregado em cada prompt.

**Alternativas:**
- (a) Inline no AGENTS.md de cada cargo — INVARIANTS block copiado em 48 arquivos
- (b) Externo via instructionsFilePath — INVARIANTS centralizado em `~/.paperclip/instances/default/invariants/INVARIANTS-v1.md`, 48 cargos apontam pra ele
- (c) Hybrid — INVARIANTS comum em arquivo externo + extensões específicas inline por cargo

**Escolha:** Opção (a) — INLINE no AGENTS.md de cada cargo pra Fase A reforjo.

**Justificativa:**
1. **Filosofia da Fase A é minimal change** — modificar 48 arquivos existentes é menos invasivo do que criar nova estrutura `~/.paperclip/instances/default/invariants/` + reconfigurar adapterConfig de 48 cargos
2. **Explicit é melhor que implicit** — engenheiro lendo o AGENTS.md de um cargo vê TODAS as regras dele em um lugar, sem precisar fazer dereferência
3. **Diff visual** — Onda A3 rollout fica facilmente revisável (git diff por cargo)
4. **Reverter por cargo** — se INVARIANTS quebrar um cargo específico, rollback é localizado (não afeta os outros 47)
5. **HC3-A compliance** — Onda A1 é doc-only; Opção (b) exigiria mudar adapterConfig de runtime, violando HC3-A

**Consequências aceitas:**
- Atualização de INVARIANTS exige editar 48 arquivos (Onda A3 padroniza via script)
- Risco de drift entre cargos se INVARIANTS evoluir sem disciplina (mitigação: sentinel-agent valida que header `### INVARIANTS v1` está presente)
- ~50 LOC duplicadas em 48 cargos (não problema — é metadado declarativo, não código executável)

**Alternativa (b) pra Fase B:** Plugin nativo via SDK oficial pode usar `instructionsFilePath` ou novo mecanismo do SDK. Não decide aqui — fica em aberto pro design da Fase B.

---

## 6. Contrato de Integração entre Bounded Contexts (Finding A1 — adversarial review)

A comunicação entre BC1, BC2 e BC3 segue o fluxo:

```
BC2 (Non-Autonomy) detecta violação
    │
    ├── GERA: SentinelAlert (approval issue atribuída ao Board)
    │
    └── NOTIFICA BC1 via: update no executionState da issue
         executionState.pipeline.gate_decisions[].gate_name = "SENTINEL_ALERT"
         executionState.pipeline.gate_decisions[].decision = "BLOCKED"
         (BC3 registra automaticamente como parte do protocolo de AuditEntry)

BC1 (Gate Enforcement) dispara portão
    │
    ├── GERA: approval issue com payload estruturado
    │
    └── NOTIFICA BC3 via: update no executionState
         (BC3 calcula nova hash e atualiza hash_chain_head)

BC3 (Audit Trail) recebe update
    │
    ├── CALCULA: nova hash SHA-256
    ├── ATUALIZA: hash_chain_head no executionState
    └── VERIFICA: que a hash do entry anterior é consistente (detect tampering)
```

**Contratos de interface:**
- BC1 → BC3: todo GateDecision tem os campos `{gate_name, hardness, decision, evidence, timestamp, decided_by}`
- BC2 → BC3: todo SentinelAlert usa gate_name = "SENTINEL_ALERT" com campo extra `{offending_cargo, offending_action}`
- BC3 não conhece BC1 ou BC2 — apenas recebe e processa AuditEntry (inversão de dependência)

---

## 7. Bounded Context: Integração com os 6 Variants

Cada um dos 6 variants de pipeline tem um conjunto diferente de portões que DEVEM ser disparados. O INVARIANTS block de cada cargo referencia o workflow ativo para saber quais approval types criar:

| Variant | Portões mandatórios adicionais | Approval types pip:* mínimos |
|---|---|---|
| bugfix-light | INFO_GATE_BLOCKED, TDD_APPROVAL, CHECKPOINT_FAIL, CLOSEOUT_CONFIRM | pip:info-gate-blocked, pip:tdd-approval, pip:checkpoint-fail, pip:closeout-confirm |
| bugfix-heavy | +ADVERSARIAL_GATE, PLAN_REJECTED, MICRO_GATE_GAP, STOP_RULE, ADVERSARIAL_BLOCK | +pip:adversarial-gate, pip:plan-rejected, pip:micro-gate-gap, pip:stop-rule, pip:adversarial-block |
| implement-light | (mesmos do bugfix-light) | (mesmos) |
| implement-heavy | +FINAL_ADVERSARIAL_GATE, FINAL_ADVERSARIAL_REWORK, FIX_LOOP_EXHAUSTED | +pip:final-adversarial-gate, pip:final-adversarial-rework, pip:fix-loop-exhausted |
| spec-light | +SPEC_ARTIFACT_MISSING, SPEC_FORMAT_GATE_FAIL, SPEC_AC_TRACEABILITY_GAP | +pip-spec:artifact-missing, pip-spec:format-gate-fail, pip-spec:ac-traceability-gap |
| spec-heavy | +SPEC_CONTENT_REVIEW_NOGO, SPEC_POST_IMPL_FAIL, ADVERSARIAL_LOOP_CHECKPOINT | +pip-spec:content-review-nogo, pip-spec:post-impl-fail, pip-spec:adversarial-loop-checkpoint |

---

## 8. Resultado do Adversarial Review

**Data:** 2026-05-24
**Reviewers:** adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer
**Resultado:** APPROVED WITH FINDINGS — todos os findings HIGH resolvidos inline

| Finding | Severity | Resolver | Status |
|---|---|---|---|
| S1: Hash chain sem algoritmo especificado | HIGH | DL-006 expandido + seção de especificação adicionada | RESOLVED |
| A1: Contrato de integração BC1↔BC2↔BC3 ausente | HIGH | Seção 6 adicionada com contratos explícitos | RESOLVED |
| Q1: 62 DPs sem mapeamento cargo→DPs | HIGH | Nota adicionada em §3.2 com referência a agents-mapping.md | RESOLVED |
| S2: Cargo comprometido pode criar approval issues falsas | MEDIUM | Adicionado à Lente 6 como limitação conhecida | ACCEPTED WITH NOTE |
| A2: Self-check não auditável | MEDIUM | Limitação inerente da Fase A (sem SDK); adicionado à Lente 10 | ACCEPTED WITH NOTE |
| Q2: Frequência de polling não especificada | MEDIUM | Limitação do Paperclip sem SDK; heartbeat do cargo é o mecanismo | ACCEPTED WITH NOTE |
| S3: Decisões proibidas só documentadas, não enforced em runtime | LOW | Inerente da abordagem de prompt-enforcement; documentado como trade-off | ACCEPTED |
| A3: Nomenclatura last_batch_result inconsistente | LOW | Corrigido para PASS/FAIL consistente com canonical | RESOLVED |
| Q3: Variant integration list — exaustiva ou mínima? | LOW | "mínimos" clarificado no cabeçalho da coluna | RESOLVED |

**Veredicto:** CONDITIONAL APPROVED — os 3 findings HIGH foram resolvidos. Os 3 MEDIUM são limitações arquiteturais documentadas e aceitas como trade-offs da Fase A. Os 3 LOW foram resolvidos ou aceitos.

---

## 9. Cross-Reference KB Canonical + Skills (auditoria KB+skills v1.2)

Após o adversarial review v1.0, uma auditoria adicional contra `paperclip-kb.md` e as 11 skills custom revelou 5 inconsistências entre a Spec e a KB canônica. Na v1.2, TODAS foram resolvidas dentro desta Spec (não mais "deferred to Onda A2").

### Inconsistência I1 — Persona "Board" não documentada na KB — **RESOLVED (v1.2)**

**KB diz:** §12.4 trata approver/reviewer/assignee como roles de issue, sem definir persona "Board".
**Spec dizia (v1.1):** A2 §2.7 trata Board como persona conceitual, mas sem template explícito.
**Resolução aplicada (v1.2):** DL-010a adicionada em §2.7 com template completo de `~/.paperclip/instances/default/board/AGENTS.md` mínimo declarativo (heartbeat.enabled=false, permissions, SLA, anti-patterns). T-A3-00 (em A3-tasks.md) cria esse arquivo como pré-requisito de rollout. Decisão final: Board é persona CONCEITUAL com AGENTS.md mínimo declarativo — combina o melhor das duas opções da v1.1.

### Inconsistência I2 — Timeout de heartbeat não documentado — **RESOLVED (v1.2)**

**KB diz:** §3.1 implica heartbeat tem janela curta com passo 9 de saída garantida; `adapterConfig.timeoutSec` default = 900s, grace = 20s.
**Spec dizia (v1.1):** A3 tasks de Onda A3 não mencionava timeout.
**Resolução aplicada (v1.2):** T-A3-00 nova (em A3-tasks.md) configura explicitamente `adapterConfig.timeoutSec=900` e `adapterConfig.graceSec=20` em TODOS os 48 cargos antes do rollout dos AGENTS.md modificados. Validação via `npx paperclipai agent list --json | jq` confirma que 48/48 cargos têm config explícita.

### Inconsistência I3 — Skill loading cache entre heartbeats — **RESOLVED (v1.2)**

**KB diz:** §4.4 skill carregada "quando o cargo decide que é relevante"; §3.3 (heartbeat passo 6) "Carregar skill se ainda não carregada".
**Spec dizia (v1.1):** A2 §2.5 mencionava `loaded-skills.json` mas sem schema completo.
**Resolução aplicada (v1.2):** §2.5 expandido com schema JSON completo de `$AGENT_HOME/loaded-skills.json` (schema_version, session_id, last_sync, loaded[], unloaded_due_to_version_bump[], load_errors[]) + integração explícita com passo 6 do heartbeat em 4 sub-steps. Reset triggers documentados (re-install, deploy, manual clear).

### Inconsistência I4 — Como INVARIANTS block é transportado ao cargo Codex — **RESOLVED (v1.2 via DL-012)**

**KB diz:** §7.1 campo `instructionsFilePath` pode ser caminho pra .md injetado em todos os prompts do cargo.
**Spec dizia (v1.1):** A2 §3.1 assumia inline no AGENTS.md, mas sem decisão formal.
**Resolução aplicada (v1.2):** Decisão de design DL-012 (registrada em §5 abaixo) cravou INLINE no AGENTS.md como mecanismo da Fase A. Alternativa externa via `instructionsFilePath` ficou registrada em DL-012 como "considerada e rejeitada pra Fase A; pode ser revista em Fase B". Trade-off documentado: inline = explícito por cargo (escolhido pra Fase A reforjo, alinha com filosofia de minimal change); externo = single update propaga (deferido pra Fase B onde refactor maior faz sentido).

### Inconsistência I5 — Knowledge graph PARA não modelado na Fase A — **RESOLVED (v1.2 via ADR-004)**

**KB diz:** §5 PARA system tem 3 camadas (daily notes, knowledge graph estruturado, tacit memory).
**Spec dizia (v1.1):** A2 §3.4 mencionava knowledge-graph.jsonl como opcional na Fase A; ADR-004 pendente.
**Resolução aplicada (v1.2):** ADR-004 escrito (em `decisions/ADR-004-knowledge-graph-deferred.md`) DEFERINDO KG estruturado pra Fase B. Fase A usa apenas daily notes + qmd recall (já cobrem ~80% do valor). Daily notes pattern padronizado em Onda A3 (T-A3-13 backlog) cobre o restante eficientemente. Decisão é reversível em ADR-005 se PoC da Onda A2 mostrar caso de uso crítico não coberto.

### Resumo do status das 5 inconsistências (v1.2)

| ID | Inconsistência | Status v1.1 | Status v1.2 | Mecanismo de resolução |
|---|---|---|---|---|
| I1 | Persona Board não documentada | PARTIAL | **RESOLVED** | DL-010a adiciona template AGENTS.md em §2.7 + T-A3-00 cria o arquivo |
| I2 | Timeout de heartbeat não documentado | DEFERRED | **RESOLVED** | T-A3-00 configura adapterConfig.timeoutSec=900, graceSec=20 em 48/48 cargos |
| I3 | Skill loading cache | PARTIAL | **RESOLVED** | §2.5 expandido com schema completo de loaded-skills.json + integração passo 6 |
| I4 | INVARIANTS transport | DEFERRED | **RESOLVED** | DL-012 crava inline pra Fase A; externo via instructionsFilePath fica registrado pra Fase B |
| I5 | Knowledge graph PARA | DEFERRED | **RESOLVED** | ADR-004 defere KG pra Fase B; Fase A usa daily notes + qmd recall |

**Veredicto v1.2:** TODAS as 5 inconsistências resolvidas dentro desta Spec. Nenhuma fica pendente pra Onda A2 decidir.

### Conceitos KB/Skills agora explícitos na Spec (v1.2)

Adições aplicadas vs v1.0:
- §2.3.1 Scoped Wake (KB §11) — otimização de heartbeat dirigida [v1.1]
- §2.4 hash_chain_head expandido pra objeto estruturado com CAS + clock skew + CRC32 (KB §5.5) [v1.1]
- §2.5 Skill Lazy Loading + Governance (KB §4 + 11 SKILL.md) — agora COM schema completo de loaded-skills.json [v1.1 + v1.2]
- §2.6 Despacho Dinâmico por Fase (paperclip-catalog.md + A2 BCs) [v1.1]
- §2.7 Composição e Governança do Board — agora COM DL-010a template AGENTS.md [v1.1 + v1.2]
- §3.4 PARA Memory + qmd recall tools (KB §5 + skill para-memory-files) [v1.1]
- §5 DL-012 INVARIANTS transport decision [v1.2]
- §9 (esta seção) Cross-Reference + 5 inconsistências **RESOLVED** [v1.1 → v1.2]
- T-A3-00 em A3-tasks.md: adapterConfig timeoutSec/graceSec + Board AGENTS.md creation [v1.2]
- ADR-004 em decisions/: Knowledge Graph deferred to Fase B [v1.2]

### Conceitos KB/Skills validados como JÁ presentes (sem necessidade de mudança)

- Heartbeat 9 passos (KB §3.1) → já em §3.1 self-check
- 35 portões + hardness (gates.md) → mapping completo em tables/gates-mapping.md
- API endpoints essenciais (KB §7) → citados em §2 schema
- Iron Laws 7 (skill pipeline-orchestrator-iron-laws) → 62 DPs + INVARIANTS block
- Engineering Principles (skill engineering-principles) → base dos 9 axiomas (00-PRINCIPIOS-COMUNS.md)
- Contracts (skill pipeline-orchestrator-contracts) → GATE_REQUEST traduzido §2.3
- Adversarial trio (skill pipeline-orchestrator-adversarial) → DPs 32-41 + A3 tasks

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — draft inicial pré-adversarial review |
| v1.1 | 2026-05-24 | Auditoria KB+skills aplicou 10 enriquecimentos: §2.3.1 scoped wake, §2.4 hash chain race defense, §2.5 lazy loading, §2.6 dispatch table, §2.7 Board, §3.4 PARA memory, §9 cross-reference + 5 inconsistências documentadas. Conceitos KB importados: paperclip-kb.md §3-5-11-12 + 11 SKILL.md custom (engineering-principles, iron-laws, contracts, etc.). |
| v1.2 | 2026-05-24 | Resolveu as 5 inconsistências documentadas em v1.1: I1 com DL-010a (template Board AGENTS.md em §2.7), I2 com T-A3-00 em A3-tasks.md (adapterConfig timeoutSec/graceSec), I3 com schema completo de loaded-skills.json em §2.5, I4 com DL-012 em §5 (inline AGENTS.md cravado pra Fase A), I5 com ADR-004 em decisions/ (KG deferred to Fase B). Status table em §9 mostra TODAS as 5 RESOLVED. Nenhuma fica pendente pra Onda A2 decidir. |
| v1.3 | 2026-05-24 | **Revisão pós-spike T-A2-01 (Onda A2).** Spike provou que `executionState` NÃO é gravável pela API loopback (coluna declarada mas não-ligada na v2026.517.0). Pivô aprovado pelo Board p/ **comentários estruturados** como substrato de estado. Revisados: §2.4 (banner), DL-003 (opção d refutada → opção b), DL-003a (CAS desnecessário em append-only), DL-004 (sentinel state em comentários), DL-006 (hash chain validada, ordena por previous_hash). Ver `.pipeline/docs/spikes/T-A2-01-report.md`. |

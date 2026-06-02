# PLANO: Atualizacao dos 46 Cargos com Revisao Adversarial em Loop

**Versao:** 1.0 — 2026-05-22
**Owner:** Board (humano) → delegado a pipeline-controller via issue PIP-4
**Objetivo:** atualizar `desiredSkills` + `instructionsFilePath` dos 46 cargos da empresa Paperclip "Pipeline Orchestrator", **validado por revisao adversarial em loop**, sem corromper config existente.

> **Nota de contagem (2026-06-02):** este plano foi escrito quando o roster tinha 46 cargos — a contagem historica abaixo e preservada de proposito. O roster atual e de **47 cargos** (o provisionador `references/paperclip/scripts/provision-pipeline-company.cjs` e o catalogo `paperclip-catalog.md` ja refletem 47). Os numeros "46" e "43 restantes" nas secoes seguintes sao o estado da epoca do planejamento.

---

## 1. Pre-condicoes (estado canonico esperado antes de iniciar)

| Pre-condicao | Status atual |
|---|---|
| 46 cargos vivos na empresa PIP | ✓ |
| 11 skills custom em `~/.paperclip/instances/default/skills/` | ✓ |
| 8 docs Paperclip + 3 docs master em `Pipeline-Orchestrator/references/paperclip/` (canonical) | ✓ commit `d4de83e` |
| Zoneamento documentado e auditado sem drift | ✓ `.pipeline/ZONING.md` |
| pipeline-controller com skill `paperclip` carregada e operacional | ✓ ja provou em PIP-1, PIP-3 |

## 2. Mapping `desiredSkills` por categoria (autoritativo)

Toda categoria carrega o **NUCLEO UNIVERSAL** + skills especificas da categoria.

**Nucleo universal (todos os 46):**
- `engineering-principles`
- `pipeline-orchestrator-contracts`
- `pipeline-orchestrator-iron-laws`

**Por categoria (alem do nucleo):**

| Categoria | Cargos | Skills adicionais |
|---|---|---|
| **core/orchestrator** | 3 (task-orchestrator, pipeline-controller, brainstorm-controller) | `pipeline-orchestrator-classification` |
| **core/gate** | 1 (information-gate) | `pipeline-orchestrator-classification` |
| **core/validator** | 4 (sentinel, sanity-checker, checkpoint-validator, final-validator) | `pipeline-orchestrator-tdd` |
| **core/closeout** | 1 (finishing-branch) | (so o nucleo) |
| **core/adversarial-runtime** | 1 (adversarial-batch) | `pipeline-orchestrator-adversarial`, `pipeline-orchestrator-tdd` |
| **brainstorm** | 3 (step-00-intake, step-01-explore, step-01b-alternatives) | `pipeline-orchestrator-spec-protocol`, `pipeline-orchestrator-classification` |
| **quality/design** | 1 (design-interrogator) | `pipeline-orchestrator-classification` |
| **quality/plan** | 1 (plan-architect) | `pipeline-orchestrator-tdd`, `pipeline-orchestrator-spec-protocol` |
| **quality/test-strategy** | 2 (quality-gate-router, pre-tester) | `pipeline-orchestrator-tdd` |
| **quality/review** | 2 (architecture-reviewer, diff-discipline-reviewer) | `pipeline-orchestrator-adversarial` |
| **quality/orchestrator** | 2 (review-orchestrator, final-adversarial-orchestrator) | `pipeline-orchestrator-adversarial` |
| **executor-controller/orchestrator** | 1 (executor-controller) | `pipeline-orchestrator-tdd`, `pipeline-orchestrator-classification` |
| **executor-controller/task** | 4 (executor-implementer-task, executor-spec-reviewer, executor-quality-reviewer, executor-fix) | `pipeline-orchestrator-tdd` |
| **executor-controller/closer** | 1 (spec-closer) | `pipeline-orchestrator-spec-protocol` |
| **feature** | 3 (feature-vertical-slice-planner, feature-implementer, feature-integration-validator) | `pipeline-orchestrator-vsa`, `pipeline-orchestrator-tdd` |
| **bugfix** | 3 (bugfix-diagnostic-agent, bugfix-root-cause-analyzer, bugfix-regression-tester) | `pipeline-orchestrator-bugfix-method`, `pipeline-orchestrator-tdd` |
| **ux** | 3 (ux-simulator, ux-accessibility-auditor, ux-qa-validator) | `pipeline-orchestrator-ux-method` |
| **audit** | 4 (audit-intake, audit-domain-analyzer, audit-compliance-checker, audit-risk-matrix-generator) | `pipeline-orchestrator-audit-method` |
| **adversarial** | 4 (adversarial-review-coordinator, adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer) | `pipeline-orchestrator-adversarial` |
| **spec** | 3 (spec-format-gate, spec-content-reviewer, spec-post-impl-validator) | `pipeline-orchestrator-spec-protocol` |

**Total:** 46 cargos, cada um com 3-7 skills `desiredSkills`.

## 3. Mapping `instructionsFilePath` por categoria

Cada cargo aponta para **dois arquivos**:
- **AXIOMS** (sempre): `Pipeline-Orchestrator/references/paperclip/PAPERCLIP-AXIOMS.md`
- **Workflow spec** (conforme categoria, abaixo)

| Categoria | Workflow spec a apontar |
|---|---|
| core/orchestrator, core/gate, core/validator, core/closeout, core/adversarial-runtime | `PAPERCLIP-AXIOMS.md` (universal — multi-workflow, sem spec dedicada) |
| brainstorm | `PAPERCLIP-SPEC-WORKFLOW.md` |
| quality | conforme cargo: design-interrogator → AXIOMS; plan-architect → AXIOMS; quality-gate-router/pre-tester → AXIOMS; architecture-reviewer/diff-discipline-reviewer → AXIOMS; review-orchestrator → `PAPERCLIP-ADVERSARIAL-WORKFLOW.md`; final-adversarial-orchestrator → `PAPERCLIP-ADVERSARIAL-WORKFLOW.md` |
| executor-controller | `PAPERCLIP-AXIOMS.md` (multi-workflow) |
| feature-* | `PAPERCLIP-FEATURE-WORKFLOW.md` |
| bugfix-* | `PAPERCLIP-BUGFIX-WORKFLOW.md` |
| ux-* | `PAPERCLIP-UX-WORKFLOW.md` |
| audit-* | `PAPERCLIP-AUDIT-WORKFLOW.md` |
| adversarial-* | `PAPERCLIP-ADVERSARIAL-WORKFLOW.md` |
| spec-* | `PAPERCLIP-SPEC-WORKFLOW.md` |

**Path canonico:** todos os arquivos absolute path `D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\references\paperclip\{file}` (Codex CLI roda no Windows, paths Windows aceitos).

**Anti-padrao proibido:** apontar pra `.pipeline/` (workspace) — viola ZONING (source-of-truth eh o repo).

## 4. Execucao em 7 batches (Iron Law: batch-by-batch + adversarial review)

Em vez de PATCH-ar 46 de uma vez, batch por categoria. Apos cada batch, dispara revisao adversarial.

| Batch | Categoria | Quantidade | Cargos exemplo |
|---|---|---|---|
| **B1** | core (10) | 10 | pipeline-controller, task-orchestrator, information-gate, sentinel, ... |
| **B2** | brainstorm + quality (11) | 11 | step-00-intake, step-01-explore, design-interrogator, plan-architect, ... |
| **B3** | executor-controller (6) | 6 | executor-controller, executor-implementer-task, ..., spec-closer |
| **B4** | feature (3) | 3 | feature-vertical-slice-planner, feature-implementer, feature-integration-validator |
| **B5** | bugfix + ux (6) | 6 | bugfix-diagnostic-agent, ..., ux-simulator, ux-accessibility-auditor, ux-qa-validator |
| **B6** | audit + spec (7) | 7 | audit-intake, ..., spec-format-gate, ... |
| **B7** | adversarial (4) | 4 | adversarial-review-coordinator, adversarial-security-scanner, ... |

Total: 47 (10+11+6+3+6+7+4). 1 a mais porque executor-controller tem 6 incluindo spec-closer. **Conferir contagem ate o fim — esperado 46.**

## 5. Flow de cada batch (loop adversarial integrado)

```
┌────────────────────────────────────────────────────────────┐
│  pipeline-controller pega batch (ex: B1 = 10 core)         │
│  Para cada cargo:                                           │
│    1. GET /api/agents/{id} (estado atual)                  │
│    2. PATCH com desiredSkills + instructionsFilePath        │
│       conforme tabela das secoes 2 e 3                     │
│    3. Confirmar PATCH retornou 200 OK                       │
│    4. Log no comment estruturado da issue PIP-4            │
│  Apos os 10:                                                │
│    5. Postar BATCH_UPDATE_COMPLETE_v1                      │
└────────────────────────────────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────────┐
│  Dispatch adversarial-review-coordinator                    │
│  Mode: review-only                                          │
│  Briefing: "Validar que os 10 cargos do batch B1 estao com │
│             config correto conforme PLAN-46-AGENTS-UPDATE."│
│  Coordinator dispara em paralelo (zero-context):            │
│    - adversarial-security-scanner                          │
│    - adversarial-architecture-critic                       │
│    - adversarial-quality-reviewer                          │
└────────────────────────────────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────────┐
│  Cada reviewer checa contra a spec PLAN-46-AGENTS-UPDATE:   │
│    - desiredSkills da categoria certa? (sec 2)              │
│    - instructionsFilePath correto? (sec 3)                  │
│    - Path canonical (repo) NAO workspace? (ZONING)          │
│    - Nada removido/sobrescrito que nao deveria?             │
│    - Cargo continua funcional (responde a heartbeat)?       │
└────────────────────────────────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────────┐
│  Consolidacao por coordinator → ADVERSARIAL_CONSOLIDATED   │
│  Verdict:                                                   │
│    PASS → seguir pro proximo batch                          │
│    NEEDS_FIX → pipeline-controller corrige finding(s)       │
│      → re-revisa (max 3 loops)                              │
│      → se 3 loops sem PASS → ESCALATION_REQUEST ao Board    │
│    NEEDS_DISCUSSION → ESCALATION_REQUEST                    │
│    PASS_WITH_WARN → seguir + criar issue de followup        │
└────────────────────────────────────────────────────────────┘
                       ↓ (se PASS)
              Repete para B2, B3, ..., B7
                       ↓
┌────────────────────────────────────────────────────────────┐
│  Apos B7 PASS:                                              │
│  Dispatch final-adversarial-orchestrator                    │
│  Briefing: "Revisao final consolidada sobre TODOS os 46     │
│             cargos, com TODO o diff acumulado dos 7 batches"│
│  Trio paralelo zero-context revisa contra plano completo.   │
└────────────────────────────────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────────┐
│  final-validator → PA_DE_CAL                                │
│    GO: 46 cargos atualizados, sem critical pendente         │
│    CONDITIONAL: passou mas com high/medium nao bloqueante   │
│    NO_GO: critical pendente → rework loop                   │
└────────────────────────────────────────────────────────────┘
                       ↓ (se GO)
┌────────────────────────────────────────────────────────────┐
│  spec-closer:                                               │
│    - Status PIP-4 = done                                    │
│    - Postar resumo executivo: 46/46 PATCHed, 0 critical     │
│      pendente, X warnings documentadas                      │
└────────────────────────────────────────────────────────────┘
```

## 6. Skills usadas pelo revisor adversarial

Os 3 reviewers (security/architecture/quality) carregam:
- `engineering-principles` (nucleo)
- `pipeline-orchestrator-contracts` (formato de finding)
- `pipeline-orchestrator-iron-laws` (calibracao de severity)
- `pipeline-orchestrator-adversarial` (zero-context protocol)

Reviewer NAO carrega `pipeline-orchestrator-classification` (nao precisa classificar tarefa).

## 7. Definicao de Done do PIP-4 (criterios binarios)

- [ ] 46 cargos PATCHed (verificavel via `GET /api/agents` count com `desiredSkills` populado)?
- [ ] 100% dos cargos com `instructionsFilePath` apontando pra arquivo do repo (NAO workspace)?
- [ ] Adversarial review por batch (7 batches) PASS ou PASS_WITH_WARN?
- [ ] Final adversarial (sobre todos os 46) PASS?
- [ ] PA_DE_CAL = GO ou CONDITIONAL?
- [ ] Spec-closer entregou 2 relatorios (technical + executive)?
- [ ] Nenhum cargo orfa ou com config corrompida?
- [ ] Daily notes do pipeline-controller atualizado?

## 8. Anti-padroes PROIBIDOS durante execucao

❌ PATCH sem leitura previa do estado atual (GET → modificar → PATCH eh o fluxo correto)
❌ PATCH em paralelo (race condition possivel em cargo que esta rodando outra tarefa)
❌ Aplicar mapping inferido sem consultar a tabela das secoes 2 e 3 da spec
❌ Apontar `instructionsFilePath` pra workspace `.pipeline/` (ZONING)
❌ Ignorar finding do adversarial reviewer "porque eh menor" (axioma 2 — adversarial sempre vale)
❌ Loop > 3 tentativas no mesmo finding (Iron Law 4)
❌ Marcar PIP-4 done com qualquer item do checklist da secao 7 false
❌ Pular o final-adversarial-orchestrator no fim (Axioma 2)

## 9. Rollback plan (se algo der MUITO errado)

Se em qualquer batch o adversarial detectar que cargos foram corrompidos:
1. ESCALATION_REQUEST imediato (interrupcao do flow)
2. Snapshot atual de TODOS os 46 cargos (GET salva em JSON)
3. Restaurar config de quem foi corrompido via PATCH com estado anterior
4. Re-iniciar o batch problematico

**Snapshot pre-flight obrigatorio:** ANTES de comecar B1, pipeline-controller salva `GET /api/agents` completo em `~/.paperclip/instances/default/agents/pre-PIP-4-snapshot.json` pra possibilitar rollback.

## 10. Estimativa de orcamento

- pipeline-controller: ~46 PATCH chamadas + 7 batch updates + final report ≈ 30 min Codex compute
- adversarial reviewers (trio × 7 batches + 1 final): 22 sessoes Codex ≈ 60-90 min
- Total estimado: ~$5-10 USD em compute Codex (gpt-5.4)

## 11. Ordem de execucao final (resumida)

```
1. Snapshot pre-flight (1 chamada GET por cargo)
2. B1 update (10 PATCHes) → adversarial review → fix loop se preciso
3. B2 update (11 PATCHes) → adversarial review → fix loop
4. B3 update (6 PATCHes) → adversarial review → fix loop
5. B4 update (3 PATCHes) → adversarial review → fix loop
6. B5 update (6 PATCHes) → adversarial review → fix loop
7. B6 update (7 PATCHes) → adversarial review → fix loop
8. B7 update (4 PATCHes) → adversarial review → fix loop
9. final-adversarial sobre 47 cargos consolidado
10. final-validator → PA_DE_CAL
11. spec-closer → 2 reports + status=done
```

Total: 11 fases, 7 ciclos de fix-loop possiveis, max 3 retries por fix-loop.

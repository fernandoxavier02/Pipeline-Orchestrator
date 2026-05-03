# Feature Pipeline — Pulsar Import Mapping

**Date:** 2026-05-03
**Author:** pipeline-controller (lean-inline)
**Status:** Mapping completo — pendente review do dono antes de virar plano de implementação
**Scope:** Documentar PORTE do workflow `Implement_new_feature` da Pulsar (13 steps Heavy + 13 Light) para skills `feature-light` + `feature-heavy` do pipeline-orchestrator. **NÃO inclui execução** — só mapeamento.
**Origem:** pedido explícito do dono em sessão 2026-05-03 ("primeiramente eu quero que você crie 1 documentação mapeamento de como você fará isso")

---

## 1. Contexto

Padrão estabelecido:
- **Slice 1.5 (v4.4.0)** — `Bug_fix` Pulsar (11 Heavy + 8 Light) → `skills/bugfix-{heavy,light}/`
- **Slice 3a (v4.5.0)** — `Audit` Pulsar (9 Heavy + 9 Light) → `skills/audit-{heavy,light}/`
- **Slice 3b (proposto)** — `Implement_new_feature` Pulsar (13 Heavy + 13 Light) → `skills/feature-{heavy,light}/`

**Implement_new_feature é o maior dos 3** — 26 steps no total + pré-checks + testes-guideline + manifests.

**Origem Pulsar:** `D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\` ([VERIFICADO 2026-05-03])

---

## 2. Inventário Pulsar — `Implement_new_feature/`

### 2.1 Heavy (`/Heavy/` — 20 arquivos)

| Arquivo | Tamanho | mtime | Status |
|---|---|---|---|
| `PIPELINE_IMPLEMENT_HEAVY.md` | 1.9KB | 11/02 | ✅ MANIFEST canônico |
| `HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` | 3.8KB | 04/02 | ✅ pre-check opcional |
| `TESTS_USER_STORY_HEAVY.md` | 5.6KB | 04/02 | ✅ guideline (não é step) |
| `HEAVY_01_01_INTENT_SCOPE.md` | 2.1KB | 15/01 | ✅ step 1 |
| `HEAVY_02_02_TERRAIN_RECON.md` | 2.1KB | 15/01 | ✅ step 2 |
| `HEAVY_03_03_USER_FLOW_UX.md` | 2.1KB | 15/01 | ✅ step 3 |
| `HEAVY_04_04_DOMAIN_RULES.md` | 2.1KB | 15/01 | ✅ step 4 |
| `HEAVY_05_05_SOURCE_OF_TRUTH.md` | 2.1KB | 15/01 | ✅ step 5 |
| `HEAVY_06_06_DATA_MODEL_PERSISTENCE.md` | 2.1KB | 15/01 | ✅ step 6 |
| `HEAVY_07_07_ARCH_DESIGN_OPTIONS.md` | 2.1KB | 15/01 | ✅ step 7 |
| `HEAVY_08_08_RISK_CONTROLS.md` | 2.2KB | 15/01 | ✅ step 8 |
| `HEAVY_09_09_IMPLEMENTATION_PLAN.md` | 2.1KB | 15/01 | ✅ step 9 |
| `HEAVY_09B_TEST_PRE_IMPL.md` | 6.1KB | 04/02 | ❌ DEPRECATED (substituído por `HEAVY_10_TEST_PRE_IMPL.md`) |
| `HEAVY_10_TEST_PRE_IMPL.md` | 6.1KB | 11/02 | ✅ step 10 (canônico, novo) |
| `HEAVY_10_10_EXECUTION_MINIMAL_DIFF.md` | 2.5KB | 05/02 | ❌ DEPRECATED (substituído por `HEAVY_11_10_*`) |
| `HEAVY_11_10_EXECUTION_MINIMAL_DIFF.md` | 2.8KB | 11/02 | ✅ step 11 (canônico) |
| `HEAVY_11_11_TESTING_VALIDATION.md` | 2.1KB | 15/01 | ❌ DEPRECATED |
| `HEAVY_12_11_TESTING_VALIDATION.md` | 2.2KB | 11/02 | ✅ step 12 (canônico) |
| `HEAVY_12_12_RELEASE_OBSERVABILITY.md` | 2.1KB | 15/01 | ❌ DEPRECATED |
| `HEAVY_13_12_RELEASE_OBSERVABILITY.md` | 2.2KB | 11/02 | ✅ step 13 (canônico) |

**Resumo Heavy:** 13 step files canônicos + 1 manifest + 1 pré-check + 1 guideline = **16 a portar**; 4 deprecated a ignorar.

### 2.2 Light (`/Ligth/` — 20 arquivos; nota: pasta tem typo "Ligth" em vez de "Light")

| Arquivo | Tamanho | mtime | Status |
|---|---|---|---|
| `PIPELINE_IMPLEMENT_LIGHT.md` | 1.9KB | 11/02 | ✅ MANIFEST canônico |
| `Avaliacao-pre-melhoria-ligth.md` | 1.5KB | 04/02 | ✅ pré-check opcional |
| `TESTS_USER_STORY_LIGHT.md` | 4.4KB | 04/02 | ✅ guideline (não é step) |
| `LIGHT_01_01_INTENT_SCOPE.md` | 1.3KB | 15/01 | ✅ step 1 |
| `LIGHT_02_02_TERRAIN_RECON.md` | 1.3KB | 15/01 | ✅ step 2 |
| `LIGHT_03_03_USER_FLOW_UX.md` | 2.1KB | 04/02 | ✅ step 3 |
| `LIGHT_04_04_DOMAIN_RULES.md` | 1.8KB | 04/02 | ✅ step 4 |
| `LIGHT_05_05_SOURCE_OF_TRUTH.md` | 1.3KB | 15/01 | ✅ step 5 |
| `LIGHT_06_06_DATA_MODEL_PERSISTENCE.md` | 1.8KB | 04/02 | ✅ step 6 |
| `LIGHT_07_07_ARCH_DESIGN_OPTIONS.md` | 1.3KB | 15/01 | ✅ step 7 |
| `LIGHT_08_08_RISK_CONTROLS.md` | 1.8KB | 04/02 | ✅ step 8 |
| `LIGHT_09_09_IMPLEMENTATION_PLAN.md` | 1.3KB | 15/01 | ✅ step 9 |
| `LIGHT_09B_TEST_PRE_IMPL.md` | 2.5KB | 04/02 | ❌ DEPRECATED |
| `LIGHT_10_TEST_PRE_IMPL.md` | 2.5KB | 11/02 | ✅ step 10 (canônico) |
| `LIGHT_10_10_EXECUTION_MINIMAL_DIFF.md` | 1.6KB | 05/02 | ❌ DEPRECATED |
| `LIGHT_11_10_EXECUTION_MINIMAL_DIFF.md` | 2.0KB | 11/02 | ✅ step 11 (canônico) |
| `LIGHT_11_11_TESTING_VALIDATION.md` | 1.9KB | 04/02 | ❌ DEPRECATED |
| `LIGHT_12_11_TESTING_VALIDATION.md` | 1.9KB | 11/02 | ✅ step 12 (canônico) |
| `LIGHT_12_12_RELEASE_OBSERVABILITY.md` | 1.3KB | 15/01 | ❌ DEPRECATED |
| `LIGHT_13_12_RELEASE_OBSERVABILITY.md` | 1.3KB | 11/02 | ✅ step 13 (canônico) |

**Resumo Light:** 13 step files canônicos + 1 manifest + 1 pré-check + 1 guideline = **16 a portar**; 4 deprecated.

### 2.3 Reconciliação de duplicatas

Pulsar tem versionamento implícito por mtime + numeração dupla:

- Arquivos `XX_YY_*` onde **XX = posição física** e **YY = ordem lógica original**.
- Quando uma versão nova foi inserida (TDD step em 11/02), o physical position renumerou (ex: `11_10` = "11º arquivo, 10ª ordem original" — significa: o conteúdo era do step 10 original mas virou step 11 após inserção do TDD step novo no slot 10).
- Arquivos com mtime 11/02 são os canônicos pós-revisão.
- **Manifests (`PIPELINE_IMPLEMENT_*`) são a fonte de verdade** — listam explicitamente os 13 canônicos por nome.

---

## 3. Sequência canônica de 13 passos (lado a lado)

Ambos Heavy e Light compartilham a mesma sequência semântica. Light = mesmas etapas com prompts mais compactos e cap explícito.

| # | Step | Heavy file | Light file | Output característico |
|---|---|---|---|---|
| 1 | Intent + Value + Scope | `HEAVY_01_01_INTENT_SCOPE.md` | `LIGHT_01_01_INTENT_SCOPE.md` | Intent doc + DoD |
| 2 | Terrain Recon (project structure scout) | `HEAVY_02_02_TERRAIN_RECON.md` | `LIGHT_02_02_TERRAIN_RECON.md` | Mapa de extensão points |
| 3 | User Flow + UX (matriz cenários + acceptance tests) | `HEAVY_03_03_USER_FLOW_UX.md` | `LIGHT_03_03_USER_FLOW_UX.md` | Matriz Given/When/Then |
| 4 | Domain Rules (unit + property tests para regras) | `HEAVY_04_04_DOMAIN_RULES.md` | `LIGHT_04_04_DOMAIN_RULES.md` | Regras + testes RED |
| 5 | Source of Truth (estado + invariantes) | `HEAVY_05_05_SOURCE_OF_TRUTH.md` | `LIGHT_05_05_SOURCE_OF_TRUTH.md` | SSOT mapping |
| 6 | Data Model + Persistence (+ migração/integridade tests) | `HEAVY_06_06_DATA_MODEL_PERSISTENCE.md` | `LIGHT_06_06_DATA_MODEL_PERSISTENCE.md` | Schema + invariants |
| 7 | Architecture Design Options (2-3 abordagens trade-off) | `HEAVY_07_07_ARCH_DESIGN_OPTIONS.md` | `LIGHT_07_07_ARCH_DESIGN_OPTIONS.md` | Decision record |
| 8 | Risk Controls (idempotência/concorrência/atomicidade) | `HEAVY_08_08_RISK_CONTROLS.md` | `LIGHT_08_08_RISK_CONTROLS.md` | Risk register + testes |
| 9 | Implementation Plan (passos pequenos low-risk) | `HEAVY_09_09_IMPLEMENTATION_PLAN.md` | `LIGHT_09_09_IMPLEMENTATION_PLAN.md` | Plan com gates DoD |
| **10** | **TDD Pre-Impl (RED — testes ANTES)** | `HEAVY_10_TEST_PRE_IMPL.md` | `LIGHT_10_TEST_PRE_IMPL.md` | Testes RED + cobertura |
| 11 | Execution Minimal Diff (GREEN — código mínimo) | `HEAVY_11_10_EXECUTION_MINIMAL_DIFF.md` | `LIGHT_11_10_EXECUTION_MINIMAL_DIFF.md` | Code passing tests |
| 12 | Testing Validation (suíte completa pré-release) | `HEAVY_12_11_TESTING_VALIDATION.md` | `LIGHT_12_11_TESTING_VALIDATION.md` | All tests GREEN |
| 13 | Release + Observability | `HEAVY_13_12_RELEASE_OBSERVABILITY.md` | `LIGHT_13_12_RELEASE_OBSERVABILITY.md` | Release notes + monitoring |

**Pré-checks (opcionais, fora da sequência principal):**
- Heavy: `HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` (sondagem completa antes de iniciar)
- Light: `Avaliacao-pre-melhoria-ligth.md` (sondagem rápida)

**Guideline files (referência, não step):**
- Heavy: `TESTS_USER_STORY_HEAVY.md` (diretrizes para tradução de user stories complexas)
- Light: `TESTS_USER_STORY_LIGHT.md` (diretrizes simplificadas)

### 3.1 Comparação com bugfix Slice 1.5 e audit Slice 3a

| Pipeline | Steps Heavy | Steps Light | TDD step? | Read-only? | Tamanho típico/step |
|---|---|---|---|---|---|
| **bugfix** (Slice 1.5) | 11 | 8 | sim (step 5) | não | médio |
| **audit** (Slice 3a) | 9 | 9 | não (read-only) | **SIM (Iron Law)** | curto-médio |
| **feature** (Slice 3b proposto) | **13** | **13** | sim (step 10) | não | médio-longo |

Feature é o **único onde Light ≈ Heavy em estrutura** (mesmos 13 passos, prompts compactos no Light). Padrão similar ao audit (que também é Light = Heavy = 9 passos), mas por motivos diferentes: audit por completude forense; feature por compromisso de qualidade independente de tamanho.

---

## 4. Mapping target — `skills/feature-{light,heavy}/`

### 4.1 Estrutura proposta

```
skills/
├── feature/                              # thin entry-point (igual a /audit, /bugfix)
│   └── SKILL.md                          # ~60 linhas — variant flag handling
├── feature-light/                        # 13 steps + tests
│   ├── SKILL.md                          # overview + navigation, <500 linhas
│   ├── steps/
│   │   ├── 01-intent-scope.md
│   │   ├── 02-terrain-recon.md
│   │   ├── 03-user-flow-ux.md            # GAP gate: matriz cenários + acceptance approval
│   │   ├── 04-domain-rules.md
│   │   ├── 05-source-of-truth.md
│   │   ├── 06-data-model-persistence.md
│   │   ├── 07-arch-design-options.md     # AskUserQuestion gate: escolher abordagem 2/3
│   │   ├── 08-risk-controls.md
│   │   ├── 09-implementation-plan.md     # AskUserQuestion gate: aprovar plan
│   │   ├── 10-test-pre-impl.md           # TDD RED — integra com Pre-Tester (agente 2.6)
│   │   ├── 11-execution-minimal-diff.md  # GREEN — escreve código
│   │   ├── 12-testing-validation.md
│   │   └── 13-release-observability.md
│   └── tests/
│       └── tests-feature-light.md        # absorve TESTS_USER_STORY_LIGHT.md como referência
└── feature-heavy/                        # 13 steps + tests
    ├── SKILL.md                          # overview + navigation, <500 linhas
    ├── steps/
    │   ├── 00-pre-check.md               # (opcional) absorve HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE
    │   ├── 01-intent-scope.md
    │   ├── 02-terrain-recon.md
    │   ├── 03-user-flow-ux.md
    │   ├── 04-domain-rules.md
    │   ├── 05-source-of-truth.md
    │   ├── 06-data-model-persistence.md
    │   ├── 07-arch-design-options.md     # AskUserQuestion gate
    │   ├── 08-risk-controls.md
    │   ├── 09-implementation-plan.md     # AskUserQuestion gate
    │   ├── 10-test-pre-impl.md           # TDD RED com cobertura completa
    │   ├── 11-execution-minimal-diff.md
    │   ├── 12-testing-validation.md
    │   └── 13-release-observability.md
    └── tests/
        └── tests-feature-heavy.md        # absorve TESTS_USER_STORY_HEAVY.md
```

**Total novo:**
- 2 skills wrapper + 1 thin entry = 3 SKILL.md
- 13 + 13 step files = 26 step files (+ 1 opcional pré-check no Heavy = 27)
- 2 tests files
- 1 glossary novo: `references/glossary/feature.md`
- 2 references novos: `references/pipelines/feature-{light,heavy}.md` (ou atualizar existentes — `implement-light.md` e `implement-heavy.md` já existem)

= **34-35 arquivos** (vs 23 no Slice 1.5 e ~20 no Slice 3a — Slice 3b é o maior).

### 4.2 Reuso de referências existentes no plugin

`references/pipelines/` já tem:
- `implement-heavy.md` (era para feature heavy)
- `implement-light.md` (era para feature light)

**Decisão pendente** (ver §10): renomear para `feature-{heavy,light}.md` (alinhar com naming dos skills) OU manter `implement-*.md` e referenciar nos novos SKILL.md.

---

## 5. Frontmatter contract (8 enforcement rules — herdado Slice 1.5)

Mesmo contrato declarativo já provado em bugfix e audit:

**SKILL.md frontmatter:**
```yaml
---
name: feature-light                # ou feature-heavy
description: <prescriptive workflow ..., <1536 chars>
disable-model-invocation: true     # manual-only
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]
argument-hint: [feature description with user story + DoD]
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
sequence_lock: true                # impede reorder/skip
gates_at: [3, 7, 9, 10, 11]        # gates de aprovação humana (ver §7)
sentinel_checkpoints: [pre_3, pre_10, pre_11, pre_13]
stop_rule_max_failures: 2
---
```

**Step.md frontmatter (cada step):**
```yaml
---
step_number: 10
step_name: "test-pre-impl"
execution_mode: subagent           # ou "inline" — IMUTÁVEL
agent_type: "pre-tester"           # whitelist; só se subagent
expected_inputs:
  - implementation_plan: from_step_9
expected_outputs:
  - test_files_created: [path list]
  - test_status: { red: int, green: int, total: int }
expected_next: 11
gate_required: true                # step 10 tem gate de aprovação dos testes
allowed_tools: [Read, Grep, Glob, Write, Bash]
---
[prescriptive step content imported/adapted from Pulsar HEAVY_10_TEST_PRE_IMPL.md]
```

**As 8 regras de enforcement (§21.3 do design v5 consolidado, validadas em Slice 1.5 + 3a):**

1. Sequência rígida (sequence_lock)
2. Execution mode bloqueado (inline vs subagent imutável)
3. Agent type whitelist
4. Output schema validado entre steps
5. AskUserQuestion gates obrigatórios (pontos de decisão — não substituível por prosa)
6. STOP RULE 2 falhas consecutivas
7. Audit log append-only em `.pipeline/gate-decisions.jsonl`
8. Sentinel checkpoints em transições críticas

Hooks existentes (`dispatch-guard`, `sentinel-hook`, `edit-guard-hook`, `force-pipeline-agents`) **cobrem o contrato** sem modificação — herança direta de Slice 1.5/3a.

---

## 6. Ownership por step — qual agente do plugin invoca cada um

| # | Step | Owner Heavy | Owner Light | Justificativa |
|---|---|---|---|---|
| 0 | Pre-Check (opcional) | `task-orchestrator` (info-gate phase) | `task-orchestrator` | Já parte da Phase 0 do pipeline existente |
| 1 | Intent Scope | `feature-vertical-slice-planner` | inline (controller) | Heavy: dedicated planner; Light: controller é leve o bastante |
| 2 | Terrain Recon | `feature-vertical-slice-planner` (estende terrain) | inline | Mesmo agente do step 1, contexto contínuo |
| 3 | User Flow UX (+ acceptance tests) | `feature-vertical-slice-planner` + AskUserQuestion gate | inline + gate | **Gate aqui:** matriz aprovada pelo usuário antes de prosseguir |
| 4 | Domain Rules | `feature-vertical-slice-planner` | inline | Continua plano |
| 5 | Source of Truth | inline | inline | Mecânico |
| 6 | Data Model Persistence | `feature-vertical-slice-planner` (se schema) | inline | Heavy: planner se há mudança schema |
| 7 | Architecture Design Options + AskUserQuestion gate | `feature-vertical-slice-planner` apresenta 2-3 opções | inline gate | **Gate aqui:** usuário escolhe abordagem |
| 8 | Risk Controls | inline | inline | Checklist procedural |
| 9 | Implementation Plan + AskUserQuestion gate | `feature-vertical-slice-planner` finaliza plan | inline | **Gate aqui:** plan aprovado |
| **10** | **TDD Pre-Impl (RED)** | `pre-tester` (existente) + `quality-gate-router` | mesmo | **TDD obrigatório** — integra Pre-Tester v3.0 mencionado no Pulsar |
| 11 | Execution Minimal Diff (GREEN) | `feature-implementer` | `feature-implementer` | Único agente que escreve código |
| 12 | Testing Validation | `feature-integration-validator` | `feature-integration-validator` | Roda suíte completa |
| 13 | Release Observability | inline (controller) | inline | Doc + tag |

**Agentes existentes reusados:** `feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator`, `pre-tester`, `quality-gate-router`. **Nenhum agente novo precisa ser criado** (todos já estão no plugin atual).

**Observação:** v4.5.0 já lista `feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator` como agentes existentes (ver §7.1.1 do consolidated). Slice 3b reusa-os via novo skill prescriptivo, **não duplica**.

---

## 7. Gates AskUserQuestion + Sentinel checkpoints

### 7.1 Gates AskUserQuestion (`gates_at` no SKILL.md frontmatter)

| Step | Gate | Pergunta típica | Por que aqui |
|---|---|---|---|
| 3 | `acceptance-matrix-approval` | "Aprovar matriz de cenários antes de prosseguir para domain rules?" | Cenários definem CONTRATO — uma vez aprovados, fixam DoD |
| 7 | `architecture-choice` | "Qual das 3 abordagens? (Recomendado: X)" | Decisão arquitetural impacta resto do pipeline |
| 9 | `plan-approval` | "Aprovar implementation plan antes de TDD pre-impl?" | Plan é blueprint de execução |
| 10 | `tdd-tests-approval` | "Aprovar testes RED antes de passar para execution?" | Testes definem GREEN target — não pode mudar mid-stream |
| 11 | `pre-execution-confirmation` | "Aprovar mudança em N arquivos antes de Edit?" | Last-chance gate antes de tocar produção |

**Light:** mesmos 5 gates, mas perguntas mais compactas. Cap "1 user story de no máx 5 acceptance criteria" do design v5 §10.1 ainda aplica.

### 7.2 Sentinel checkpoints (`sentinel_checkpoints` no frontmatter)

| Checkpoint | Trigger | Verifica |
|---|---|---|
| `pre_3` | Antes de USER_FLOW_UX | Steps 1-2 produziram intent + terrain consistente |
| `pre_10` | Antes de TDD Pre-Impl | Steps 3-9 produziram base completa para escrever testes |
| `pre_11` | Antes de EXECUTION_MINIMAL_DIFF | Testes RED de fato falharam (não foram inventados verdes) |
| `pre_13` | Antes de RELEASE_OBSERVABILITY | Step 12 testing validation passou de fato |

Sentinel hook existente (`sentinel-hook.cjs`) já valida `expected_next` em cada Agent spawn — checkpoints são adicionados via SKILL.md frontmatter, sem mudança de código.

---

## 8. Diferenças importantes vs bugfix/audit ports

### 8.1 Diferenças que afetam o porte

1. **TDD step explícito (passo 10)** com integração documentada com `Pre-Tester v3.0`. Os arquivos `HEAVY_10_TEST_PRE_IMPL.md` e `LIGHT_10_TEST_PRE_IMPL.md` têm seção "Integração TDD v3.0 (VERIFICAR PRIMEIRO)" que detecta se o agente Pre-Tester já criou testes — **comportamento condicional** que precisa ser preservado no skill.

2. **Architecture Design Options (passo 7)** explicitamente pede 2-3 opções com trade-offs antes de escolher uma. Isso vira AskUserQuestion gate técnico (com "Recomendado" no primeiro option per CLAUDE.md MASTER RULE).

3. **Implementation Plan (passo 9)** é mais detalhado que em bugfix — inclui gates DoD por sub-etapa. Vira input direto do `executor-controller` no Phase 2 do pipeline.

4. **Release + Observability (passo 13)** é único — bugfix e audit não têm. Cobre release notes + monitoring setup. Ownership: `inline` no controller; pode invocar `ai-dev-docs-writer` (v5.1 deferred per §7.3).

5. **Pré-check opcional** (`HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md`) é mais elaborado que bugfix/audit pre-checks. Mapeia para Phase 0 do pipeline, não vira step do skill (evita duplicação com `task-orchestrator`).

### 8.2 Diferenças que NÃO afetam o porte (já contemplados)

- 8 enforcement rules: idênticas (herdam Slice 1.5)
- Frontmatter contract: idêntico (sequence_lock, execution_mode, etc.)
- Hooks: nenhum modificar (4 existentes cobrem)
- Sentinel: padrão existente
- Iron Law (audit): N/A (feature pode escrever)

---

## 9. Funcionalidades Claude Code aplicáveis

Claude Code 2.x tem várias features que o porte deve usar explicitamente:

### 9.1 Skills (skills/feature-{light,heavy}/SKILL.md)

- `disable-model-invocation: true` — manual-only. Usuário invoca via `/pipeline-orchestrator:feature-light` etc. Sem auto-discovery.
- `argument-hint` — orienta usuário sobre input esperado.
- `allowed-tools` — whitelist mínima por skill (Task para spawning, Read/Grep/Glob para leitura, Write/Edit/Bash para escrita).
- Steps em sub-pasta `steps/` — per oficial CC docs ("Move detailed reference material to separate files. Keep SKILL.md under 500 lines").

### 9.2 Sub-agents

Reusados sem modificação:
- `feature-vertical-slice-planner` (designs steps 1-9 Heavy)
- `feature-implementer` (step 11 — único que escreve código)
- `feature-integration-validator` (step 12 — roda testes)
- `pre-tester` (step 10 — TDD RED)
- `quality-gate-router` (step 10 — gera scenarios em plain language)

### 9.3 Hooks (existentes, nenhum modificar)

- `sentinel-hook.cjs` — valida cada Agent spawn contra `expected_next` no SKILL.md
- `dispatch-guard.cjs` — whitelist por step (`agent_type`)
- `edit-guard-hook.cjs` — bloqueia Write/Edit fora de exec-window (NÃO bloqueia em feature, só em audit; check via `iron_law` flag no manifest se houver)
- `force-pipeline-agents.cjs` — força AskUserQuestion para gates obrigatórios

### 9.4 AskUserQuestion (USER INTERACTION PROTOCOL)

5 gates: matriz aprovação (step 3), architecture choice (step 7), plan approval (step 9), tdd tests approval (step 10), pre-execution confirmation (step 11). Cada um com 2-4 opções discretas; primeira opção labeled "Recomendado" para questões técnicas.

### 9.5 Plan Mode (EnterPlanMode)

Pode ser usado em step 7 (architecture options) e step 9 (implementation plan) para forçar Claude a entrar em modo read-only durante o planning sub-task. Útil para impedir Edit acidental durante design.

### 9.6 Pipeline integration (existing)

Skills `feature-light` e `feature-heavy` integram automaticamente com:
- `task-orchestrator` Phase 0a (auto-classify routes para feature variant via `pipeline_variant`)
- `information-gate` Phase 0b (lacuna detection antes de step 1)
- `design-interrogator` Phase 0c (apenas COMPLEXA — pode complementar pré-check Heavy)
- `plan-architect` Phase 1.5 (apenas COMPLEXA — pode substituir step 9 se conflitarem)
- `executor-controller` Phase 2 (orquestra steps 10-12 via batch sizing)
- `sanity-checker` + `final-validator` Phase 3 (post-step 13)

**Tensão a resolver:** `plan-architect` (Phase 1.5) e step 9 IMPLEMENTATION_PLAN (skill interno) podem se sobrepor para COMPLEXA. Ver §10 decisões pendentes.

---

## 10. Decisões de design pendentes (input do dono)

Antes de escrever plano de implementação:

1. **Naming dos references/pipelines:** já existem `implement-heavy.md` e `implement-light.md`. Renomear para `feature-{heavy,light}.md` (alinhar com skills) ou manter? Trade-off: rename = breaking para quem referencia; manter = naming inconsistente entre skill e reference.

2. **Pré-check Heavy:** absorver `HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` como step 00 opcional do skill, ou mapear inteiramente para Phase 0 do pipeline (information-gate + design-interrogator)? Trade-off: skill = workflow autocontido; phase 0 = reusa machinery existente.

3. **Conflito plan-architect vs step 9:** quando complexity=COMPLEXA, ambos rodariam. Decidir: (a) skill pula step 9 se plan-architect rodou, (b) plan-architect pula se skill tem step 9, (c) ambos rodam e step 9 valida o plano do plan-architect.

4. **Step 13 RELEASE_OBSERVABILITY:** deixar inline no controller, ou criar/reusar `ai-dev-docs-writer` (v5.1 deferred per §7.3)? Inline = simples; agente = padrão consistente.

5. **TDD step 10 — integração com Pre-Tester:** o arquivo Pulsar tem secção "VERIFICAR PRIMEIRO se Pre-Tester já criou testes". O skill deve preservar esse comportamento condicional. Como expressar no frontmatter? Possíveis: `expected_inputs.pre_tester_artifacts: optional`, ou condicional inline na prosa do step.

6. **Tamanho do step file:** Heavy step files Pulsar têm 2-6KB cada. Após adaptação para skill format (frontmatter + cabeçalhos do plugin), provavelmente 4-8KB. SKILL.md pode passar de 500 linhas se incluir overview de 13 steps. Trade-off: split em files vs verbosidade.

7. **TESTS_USER_STORY_HEAVY/LIGHT.md como guideline:** copiar inteiro como `tests/tests-feature-{heavy,light}.md` ou extrair só checklists e referenciar Pulsar como source? Trade-off: cópia = self-contained; ref = sync issues futuras.

---

## 11. Plano de portabilidade (esboço — não é o plan executável)

**Slice 3b proposto** (analógico a Slice 1.5 + 3a):

1. **Brainstorming** (este doc serve de input)
2. **Writing-plans** — gerar plano executável com tasks atômicas
3. **Executing-plans** — criar skills + 26 steps + 2 tests + glossary + atualizações spec
4. **Adversarial review** — ce-coherence-reviewer ou ce-correctness-reviewer
5. **Pa de Cal** — verificar via grep + smoke test (skill descoberta via `/help`)
6. **Release**: target v4.6.0 (minor) — alinhado com lineage v4.4.0 (Slice 1.5) + v4.5.0 (Slice 3a)

### 11.1 Atualizações no spec consolidado

- `§7.2.3` (feature shape): atualizar de 13 passos genéricos para a sequência Pulsar
- `§7.1.1`: confirmar que `feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator` estão listados
- `§12.7` (Slice 3): nota que Slice 3b extraído como sub-slice (igual a Slice 3a fez para audit)
- `§22+` ou `§23` novo: nova seção documentando Slice 3b como entregue

### 11.2 Atualizações no plugin

- `commands/pipeline.md`: adicionar `--variant=feature-light|feature-heavy` ao tabela de modes
- `agents/core/task-orchestrator.md`: aceitar `force_variant=feature-{light,heavy}` (analógico a Slice 1.5)
- `references/pipelines/feature-{heavy,light}.md`: header pointer "As of v4.6.0"
- `CLAUDE.md`: bump versão + 2 entries no roster (skills/feature-{heavy,light}/)
- `AGENTS.md`: atualizar
- `CHANGELOG.md`: entry v4.6.0
- `plugin.json` + `marketplace.json` + `hooks/hooks.json` SessionStart: bump 4.5.0 → 4.6.0

---

## 12. Estimativa de esforço

| Fase | Tarefas | Tempo |
|---|---|---|
| Mapping doc (este doc) | 1 (concluído) | ~30min |
| Brainstorming follow-up | Resolver 7 decisões pendentes via AskUserQuestion | ~15min |
| Writing-plans | Gerar plano com ~30 tasks atômicas | ~30min |
| Execução: skills + 26 steps + 2 tests + 1 glossary | ~30 atomic edits | ~2-3h |
| Adversarial review + fix-loop | 1 spawn + 0-3 fix attempts | ~30min |
| Pa de Cal + closeout (commits, push, release) | ~15min | ~15min |
| **Total** | | **~4-5 horas** |

Para comparação:
- Slice 1.5 (bugfix): ~3h
- Slice 3a (audit): ~2h
- Slice 3b (feature): **~4-5h** (maior — 26 steps vs 19/18)

---

## 13. Riscos identificados

| Risco | Severidade | Mitigação |
|---|---|---|
| Conflito plan-architect (Phase 1.5) vs step 9 IMPLEMENTATION_PLAN | Média | Decisão #3 em §10 antes do plan |
| Step 10 TDD-com-Pre-Tester comportamento condicional não expressível em frontmatter | Média | Decisão #5 em §10; fallback: prosa explícita no step.md |
| 26 step files = sessão longa de execução | Baixa | Subagent-driven-development (1 task per subagent) ou batch + checkpoint |
| Naming inconsistência `implement-*` vs `feature-*` em references | Baixa | Decisão #1 em §10 |
| Release v4.6.0 antes de v5.0 final pode confundir versionamento | Baixa | Documentar no CHANGELOG que v5.0 final ainda depende de Slice 4 verde |

---

## 14. Próximos passos

1. **Review deste doc pelo dono** — aprovar OU pedir ajustes nas seções 4-11.
2. **Resolver 7 decisões pendentes (§10)** via AskUserQuestion em sessão de brainstorming.
3. **Invocar `superpowers:writing-plans`** para gerar plano executável.
4. **Invocar `superpowers:executing-plans`** para implementar.
5. **Release v4.6.0**: tag, push, marketplace.json, CHANGELOG, smoke test.

**Owner:** dono do plugin (você).
**Timeline:** ~1 sessão dedicada de ~4-5h, ou 2-3 sessões menores incrementais (cada uma cobrindo ~5-9 steps).

---

## 15. Apêndice — comparação rápida bugfix/audit/feature

| Aspecto | bugfix-light | bugfix-heavy | audit-light | audit-heavy | feature-light | feature-heavy |
|---|---|---|---|---|---|---|
| Steps | 8 | 11 | 9 | 9 | 13 | 13 |
| TDD obrigatório | sim (step 5) | sim (step 5) | não | não | sim (step 10) | sim (step 10) |
| Read-only Iron Law | não | não | **sim** | **sim** | não | não |
| Architecture choice gate | não | não | não | não | **sim (step 7)** | **sim (step 7)** |
| Pré-check opcional | não | não | sim | sim | sim (Avaliacao) | sim (HEAVY_A) |
| Release+observability step | não | não | não | sim (Pa de Cal) | sim (step 13) | sim (step 13) |
| Total step files | 8 | 11 | 9 | 9 | 13 | 13 |
| Já portado? | ✅ v4.4.0 | ✅ v4.4.0 | ✅ v4.5.0 | ✅ v4.5.0 | ❌ pendente | ❌ pendente |

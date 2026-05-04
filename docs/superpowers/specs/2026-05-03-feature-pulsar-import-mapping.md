# Feature Pipeline — Pulsar Import Mapping (v2 pós-bugfix)

**Date:** 2026-05-03 (rewrite v2)
**Author:** pipeline-controller (lean-inline) — bugfix-heavy flow aplicado pós-adversarial review
**Status:** Mapping completo + 10 decisões resolvidas. Pronto para writing-plans.
**Scope:** Documentar PORTE do workflow `Implement_new_feature` da Pulsar (13 steps Heavy + 13 Light, **shared shape via mode flag**) para skill `feature` única do pipeline-orchestrator. **NÃO inclui execução** — só mapeamento.
**Origem:** Pedido inicial 2026-05-03 ("primeiramente documentação mapeamento") → mapping v1 → 3 reviewers adversariais (`ce-coherence` + `ce-feasibility` + `ce-scope-guardian`) cravaram 5 CRIT + 7 MAJ + 6 MIN → bugfix-heavy lean-inline com 10 decisões resolvidas via AskUserQuestion → este doc v2.

**UPDATE (v4.6.1 + v4.7.0 corrections):** Spec inicialmente escrita para v4.6.0 (single skill com mode flag). Implementação foi REVERTIDA em v4.6.1 (2 skills separadas espelhando Pulsar 1:1) e POLIDA em v4.7.0 (frontmatter contract completo + thin entry-point + tests reais). Use este mapping doc apenas para histórico de design. Canonical implementation atual: `skills/feature-{light,heavy}/SKILL.md` + `skills/feature/SKILL.md`. Ver CHANGELOG [4.6.1] e [4.7.0] para racional das mudanças.

---

## 1. Contexto

Padrão estabelecido (mantido):
- **Slice 1.5 (v4.4.0)** — `Bug_fix` Pulsar (11 Heavy + 8 Light) → `skills/bugfix-{heavy,light}/`
- **Slice 3a (v4.5.0)** — `Audit` Pulsar (9 Heavy + 9 Light) → `skills/audit-{heavy,light}/`
- **Slice 3b (proposto)** — `Implement_new_feature` Pulsar (13 + 13) → **skill `feature` única com mode flag** (mudança em v2 vs Slice 1.5/3a — ver §10 decisão 5)

**Origem Pulsar:** `D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\` ([VERIFICADO 2026-05-03])

**Mudanças importantes vs v1 do mapping (resolvidas neste rewrite):**
- 26 step files (v1) → **13 step files com mode flag** (v2) — corte 50%
- 5 gates AskUserQuestion (v1) → **4 gates** (v2) — removido step 11 double-gate
- Hooks "cobrem o contrato" (v1) — claim FALSA → **hooks são session-level; skill frontmatter é ADVISORY** (v2)
- TDD step shell-discovery hardcoded (v1) → **parametrizado via `expected_inputs.pre_tester_artifacts`** (v2)
- 7 decisões pendentes (v1) → **0 decisões pendentes** (v2 — todas resolvidas via AskUserQuestion)
- Consolidated.md §7.1.1 nomes errados → **fixed** em commit anterior

---

## 2. Inventário Pulsar — `Implement_new_feature/`

### 2.1 Heavy (`/Heavy/` — 20 arquivos)

| Arquivo | Status |
|---|---|
| `PIPELINE_IMPLEMENT_HEAVY.md` | ✅ MANIFEST canônico (1.9KB) |
| `HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` | ✅ pre-check (mas Phase 0 absorve — ver §10 decisão 8) |
| `TESTS_USER_STORY_HEAVY.md` | ✅ guideline (referência, não step) |
| `HEAVY_01_01_INTENT_SCOPE.md` | ✅ step 1 |
| `HEAVY_02_02_TERRAIN_RECON.md` | ✅ step 2 |
| `HEAVY_03_03_USER_FLOW_UX.md` | ✅ step 3 (gate aqui) |
| `HEAVY_04_04_DOMAIN_RULES.md` | ✅ step 4 |
| `HEAVY_05_05_SOURCE_OF_TRUTH.md` | ✅ step 5 |
| `HEAVY_06_06_DATA_MODEL_PERSISTENCE.md` | ✅ step 6 |
| `HEAVY_07_07_ARCH_DESIGN_OPTIONS.md` | ✅ step 7 (gate aqui) |
| `HEAVY_08_08_RISK_CONTROLS.md` | ✅ step 8 |
| `HEAVY_09_09_IMPLEMENTATION_PLAN.md` | ✅ step 9 (gate; SKIP se Phase 1.5 plan-architect rodou) |
| `HEAVY_10_TEST_PRE_IMPL.md` | ✅ step 10 (gate; canônico, novo 11/02) |
| `HEAVY_11_10_EXECUTION_MINIMAL_DIFF.md` | ✅ step 11 (canônico, novo 11/02) |
| `HEAVY_12_11_TESTING_VALIDATION.md` | ✅ step 12 (canônico, novo 11/02) |
| `HEAVY_13_12_RELEASE_OBSERVABILITY.md` | ✅ step 13 (canônico, novo 11/02) |
| `HEAVY_09B_TEST_PRE_IMPL.md` | ❌ DEPRECATED |
| `HEAVY_10_10_EXECUTION_MINIMAL_DIFF.md` | ❌ DEPRECATED |
| `HEAVY_11_11_TESTING_VALIDATION.md` | ❌ DEPRECATED |
| `HEAVY_12_12_RELEASE_OBSERVABILITY.md` | ❌ DEPRECATED |

### 2.2 Light (`/Ligth/`)

Estrutura espelhada — mesmos 13 canônicos + 4 deprecated. Pasta tem typo "Ligth".

### 2.3 Reconciliação de duplicatas

Numeração `XX_YY_*`: XX = posição física, YY = ordem original. Versões 11/02 são canônicas (substituíram 15/01 com inserção do TDD step novo no slot 10). **Manifests são SSOT** — listam os 13 canônicos por nome.

---

## 3. Sequência canônica de 13 passos (Heavy = Light em estrutura)

| # | Step | Heavy file (Pulsar) | Light file (Pulsar) | Output característico |
|---|---|---|---|---|
| 1 | Intent + Value + Scope | `HEAVY_01_01_*` | `LIGHT_01_01_*` | Intent doc + DoD |
| 2 | Terrain Recon | `HEAVY_02_02_*` | `LIGHT_02_02_*` | Mapa de extensão points |
| 3 | User Flow + UX (matriz cenários) **[GATE]** | `HEAVY_03_03_*` | `LIGHT_03_03_*` | Matriz Given/When/Then |
| 4 | Domain Rules | `HEAVY_04_04_*` | `LIGHT_04_04_*` | Regras + property tests |
| 5 | Source of Truth | `HEAVY_05_05_*` | `LIGHT_05_05_*` | SSOT mapping |
| 6 | Data Model + Persistence | `HEAVY_06_06_*` | `LIGHT_06_06_*` | Schema + invariants |
| 7 | Architecture Design Options **[GATE]** | `HEAVY_07_07_*` | `LIGHT_07_07_*` | Decision record |
| 8 | Risk Controls | `HEAVY_08_08_*` | `LIGHT_08_08_*` | Risk register |
| 9 | Implementation Plan **[GATE; SKIP se Phase 1.5 rodou]** | `HEAVY_09_09_*` | `LIGHT_09_09_*` | Plan com gates DoD |
| **10** | **TDD Pre-Impl (RED) [GATE]** — parametrizado via `expected_inputs.pre_tester_artifacts` | `HEAVY_10_TEST_PRE_IMPL.md` | `LIGHT_10_TEST_PRE_IMPL.md` | Testes RED |
| 11 | Execution Minimal Diff (GREEN) — Phase 2 adversarial gate cobre confirmação | `HEAVY_11_10_*` | `LIGHT_11_10_*` | Code passing tests |
| 12 | Testing Validation | `HEAVY_12_11_*` | `LIGHT_12_11_*` | All tests GREEN |
| 13 | Release + Observability | `HEAVY_13_12_*` | `LIGHT_13_12_*` | Release notes |

**Pré-check Pulsar (`HEAVY_A_*` / `Avaliacao-pre-melhoria-ligth.md`):** absorvido por Phase 0 do pipeline (information-gate + design-interrogator). NÃO vira step do skill.

**Guideline Pulsar (`TESTS_USER_STORY_*.md`):** copiado como referência em `tests/tests-feature.md` (não step executável).

### 3.1 Comparação atualizada com bugfix Slice 1.5 e audit Slice 3a

| Pipeline | Steps | Skills strategy | Read-only? | TDD step? |
|---|---|---|---|---|
| **bugfix** (Slice 1.5) | 11 Heavy / 8 Light **(estruturas diferentes)** | 2 skills separadas | não | sim (step 5) |
| **audit** (Slice 3a) | 9 = 9 (Light = Heavy estrutura) | 2 skills separadas | **sim (Iron Law)** | não |
| **feature** (Slice 3b proposto) | **13 = 13 (Light = Heavy estrutura)** | **1 skill compartilhada + mode flag** | não | sim (step 10) |

**Por que feature é a primeira com 1 skill compartilhada:** a própria Pulsar tem mesmos 13 passos em Heavy e Light, diferindo apenas em verbosidade do prompt. Bugfix tinha estruturas de fato diferentes (11 vs 8 passos). Audit também tinha 9=9 mas o porte v4.5.0 ainda usou 2 skills por padrão herdado de Slice 1.5; Slice 3b corrige o pattern e adota mode flag (ver §17.3 #12 + §10 decisão 5).

---

## 4. Mapping target — `skills/feature/` (1 skill, 13 steps, mode flag)

### 4.1 Estrutura proposta (atualizada v2)

```
skills/
└── feature/                              # SINGLE skill (mudança vs Slice 1.5/3a pattern)
    ├── SKILL.md                          # overview + mode flag handling, <500 linhas
    ├── steps/
    │   ├── 01-intent-scope.md            # mode-aware: heavy verbose, light compact
    │   ├── 02-terrain-recon.md
    │   ├── 03-user-flow-ux.md            # GATE: matriz cenários approval
    │   ├── 04-domain-rules.md
    │   ├── 05-source-of-truth.md
    │   ├── 06-data-model-persistence.md
    │   ├── 07-arch-design-options.md     # GATE: escolher abordagem 2/3
    │   ├── 08-risk-controls.md
    │   ├── 09-implementation-plan.md     # GATE; SKIP se Phase 1.5 plan-architect output existe
    │   ├── 10-test-pre-impl.md           # GATE; expected_inputs: pre_tester_artifacts
    │   ├── 11-execution-minimal-diff.md  # SEM gate skill-level (executor-controller cobre)
    │   ├── 12-testing-validation.md
    │   └── 13-release-observability.md
    └── tests/
        └── tests-feature.md              # absorve TESTS_USER_STORY_{HEAVY,LIGHT}.md
```

**Total novo:**
- 1 SKILL.md
- 13 step files (mode-aware via prompt sections)
- 1 tests file
- 1 reference: `references/pipelines/feature.md` (substitui `implement-{heavy,light}.md` existentes)

= **16 arquivos** (vs 34-35 da v1 do mapping — corte ~52%).

### 4.2 Mode flag mechanism

**SKILL.md frontmatter:**
```yaml
---
name: feature
description: <prescriptive workflow ..., <1536 chars>
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]
argument-hint: "[--mode=light|heavy] [feature description with user story + DoD]"
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
sequence_lock: true                # ADVISORY (ver §5)
gates_at: [3, 7, 9, 10]             # 4 gates (era 5; step 11 removido per MAJ 9)
sentinel_checkpoints: [pre_3, pre_10, pre_13]
stop_rule_max_failures: 2
mode: heavy                          # default; user override via --mode=light
---
```

**Cada step.md tem 2 seções de prompt:**
```markdown
## Heavy mode prompt (default)
[verbose Pulsar HEAVY_NN_NN_*.md content]

## Light mode prompt (when mode=light)
[compact Pulsar LIGHT_NN_NN_*.md content]
```

Controller seleciona seção baseado em `mode` flag. Outputs (`expected_outputs:`) são os mesmos — apenas o prompt difere.

### 4.3 References reorganization

Hoje: `references/pipelines/implement-{heavy,light}.md` (existem).
Após Slice 3b: **renomear para `references/pipelines/feature.md`** (single, com mode handling). Os 2 antigos são deletados ou renomeados como redirect.

---

## 5. Frontmatter contract — ADVISORY, não enforcement (correção CRIT)

**Atualizado v2:** os campos abaixo são **declarativos para humanos lerem** + para o controller respeitar — **NÃO são enforcement mecânico via hooks** [VERIFICADO 2026-05-03 via grep nos 3 hooks].

| Campo | Quem enforce | Como |
|---|---|---|
| `sequence_lock` | controller (inline lógica) | controller só dispatcha agente do `expected_next` step; sentinel-hook valida `expected_next` no `sentinel-state.json` (não no SKILL.md) |
| `gates_at` | controller | controller invoca AskUserQuestion antes de transitar dos steps listados |
| `sentinel_checkpoints` | sentinel-hook (parcialmente) | hook valida `expected_next` em cada Agent spawn; checkpoints específicos dependem do controller setar `expected_next` correto |
| `agent_type` (per step) | controller | dispatch-guard.cjs faz match de short-name→FQN (static map), não whitelist por step |

**Implicação prática:** se controller for buggy ou renomear agentes sem atualizar SKILL.md, o frontmatter fica em drift mas NADA bloqueia. Slice 1.5 e 3a funcionam assim hoje.

**Decisão pendente registrada em §17.4 #8 do consolidated:** aceitar advisory model (default seguro) OU estender hooks para parsear SKILL.md (sub-slice futuro). Slice 3b adota advisory.

---

## 6. Ownership por step (atualizado v2)

| # | Step | Owner | Notas |
|---|---|---|---|
| 0 | Pre-Check (opcional) | Phase 0 do pipeline (info-gate + design-interrogator) | NÃO vira step da skill — Phase 0 absorve per decisão 8 |
| 1 | Intent Scope | inline (controller) | Mecânico |
| 2 | Terrain Recon | inline | Mecânico |
| 3 | User Flow UX **[GATE]** | `feature-vertical-slice-planner` + AskUserQuestion | Matriz cenários approval |
| 4 | Domain Rules | inline | Procedural |
| 5 | Source of Truth | inline | Mecânico |
| 6 | Data Model Persistence | inline | Procedural |
| 7 | Architecture Design Options **[GATE]** | `feature-vertical-slice-planner` apresenta 2-3 opções via AskUserQuestion | Escolher abordagem |
| 8 | Risk Controls | inline | Checklist |
| 9 | Implementation Plan **[GATE]** | `feature-vertical-slice-planner` ou skip se Phase 1.5 plan-architect output existe | SKIP detection: o **controller** (não hook nem agent) verifica `ls PIPELINE_DOC_PATH/05-plan-architect.md` ANTES de dispatchar o agente do step 9. Se arquivo existe e foi gerado nesta run (timestamp dentro da janela de execução), pula step 9 marcando `skipped_inherited_from: phase_1.5` no log de gate-decisions. Se não, executa normalmente. Lógica vive na prosa do `steps/09-implementation-plan.md` (procedural — primeiro check antes de qualquer Agent spawn). |
| 10 | TDD Pre-Impl (RED) **[GATE]** | `pre-tester` (recebe `expected_inputs.pre_tester_artifacts` do step prévio) | Parametrizado, não shell-discovery |
| 11 | Execution Minimal Diff (GREEN) | `feature-implementer` | SEM gate skill-level — executor-controller adversarial gate cobre |
| 12 | Testing Validation | `feature-integration-validator` | Roda suite |
| 13 | Release Observability | inline (controller) | Doc + tag |

**Agentes existentes reusados (3):** `feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator` — todos verificados em `agents/executor/type-specific/`. **Plus: `pre-tester` e `quality-gate-router` (Phase 2 do pipeline)** = 5 agentes total. **Nenhum novo a criar.**

**Caveat documentado (MAJ 7):** `feature-vertical-slice-planner` PROCESS section declara 5 capabilities abstratas, mas mapping atribui 4 steps (3, 7, 9). O mesmo agente é spawned 3 vezes com `TASK_CONTEXT` diferente (step 3 = matriz; step 7 = arch options; step 9 = plan). Funciona mas é re-spawn — não há split. Documentar nas instruções dos step files.

---

## 7. Gates AskUserQuestion + Sentinel checkpoints (4 gates v2; era 5 v1)

### 7.1 Gates AskUserQuestion

| Step | Gate | Pergunta típica |
|---|---|---|
| 3 | `acceptance-matrix-approval` | "Aprovar matriz de cenários antes de prosseguir?" |
| 7 | `architecture-choice` | "Qual das 3 abordagens? (Recomendado: X)" |
| 9 | `plan-approval` | "Aprovar implementation plan?" (skip silently se Phase 1.5 rodou) |
| 10 | `tdd-tests-approval` | "Aprovar testes RED antes de execution?" |

**Step 11 gate REMOVIDO em v2** (per MAJ 9): executor-controller (Phase 2) já tem adversarial gate antes de qualquer Edit. Skill-level gate seria double confirmation.

### 7.2 Sentinel checkpoints (advisory — ver §5)

`pre_3`, `pre_10`, `pre_13` — controller deve setar `expected_next` no sentinel-state.json antes de cada um. Não há enforcement automático via hook do conteúdo declarado em SKILL.md.

**Nota sobre `pre_11`:** removido em fix-loop round 2 (originalmente declarado em v2 inicial mas órfão — step 11 não tem mais gate skill-level após remoção MAJ 9, então não justifica checkpoint próprio. Phase 2 executor-controller já tem seu próprio sentinel checkpoint `phase_2_to_3` via pipeline machinery).

---

## 8. Diferenças importantes vs bugfix/audit (atualizado)

1. **Mode flag (1 skill vs 2)** — feature é o primeiro a usar essa estratégia. Justificado por Pulsar Light = Heavy em estrutura (13 passos cada).
2. **TDD step 10 parametrizado** — não usa shell-discovery hardcoded. `pre-tester` agent passa paths conhecidos do projeto via `expected_inputs.pre_tester_artifacts`.
3. **Step 9 condicional** — skip se Phase 1.5 plan-architect rodou. Detecta via filesystem check no PIPELINE_DOC_PATH.
4. **Step 13 release+observability** — único entre os 3 ports. Inline controller (sem agente novo).
5. **Pré-check via Phase 0**, não step skill — reuso de machinery existente.

---

## 9. Funcionalidades Claude Code aplicáveis (atualizado v2)

### 9.1 Skills

- 1 skill `feature` (vs 2 ou 3 nos ports anteriores).
- Mode flag via frontmatter `mode: heavy` + override `--mode=light` no argument.
- `disable-model-invocation: true` — manual-only.
- Steps em sub-pasta `steps/` per oficial CC docs.
- `allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]` (kebab-case correto).

### 9.2 Sub-agents (5 reusados, 0 novos)

`feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator`, `pre-tester`, `quality-gate-router`.

### 9.3 Hooks (4 existentes — ADVISORY model adotado)

Hooks NÃO parseiam SKILL.md frontmatter (verificado via grep). Cobertura:
- `sentinel-hook`: valida `expected_next` do `sentinel-state.json` (state file, não skill).
- `dispatch-guard`: static map FQN para spawn errors.
- `edit-guard`: bloqueia Edits fora de exec-window.
- `force-pipeline-agents`: força AskUserQuestion em pipeline-skill matches.

Skill enforcement é responsabilidade do controller. Documentado em §17.4 #8 do consolidated.

### 9.4 AskUserQuestion

4 gates (3, 7, 9, 10). Cada um com 2-4 opções; primeira labeled "Recomendado" para questões técnicas (per CLAUDE.md MASTER RULE).

### 9.5 Plan Mode (EnterPlanMode)

Pode ser usado em step 7 (architecture options). Step 9 prefere ler output do Phase 1.5 plan-architect se existe.

### 9.6 Pipeline integration

Skill `feature` integra com:
- `task-orchestrator` Phase 0a (auto-classify routes para `feature` via `pipeline_variant`).
- `information-gate` Phase 0b + `design-interrogator` Phase 0c (absorvem pré-check).
- `plan-architect` Phase 1.5 (se COMPLEXA — output reusado por step 9).
- `executor-controller` Phase 2 (orquestra steps 10-12 via batch sizing + adversarial gate antes de Edits = cobre step 11).
- `sanity-checker` + `final-validator` Phase 3 (post-step 13).

---

## 10. Decisões resolvidas (10 de 10 — era 7 pendentes em v1)

Todas via AskUserQuestion sequencial em sessão bugfix-heavy 2026-05-03:

1. **CRIT 1+5: Light = Heavy 13 steps + 1 skill com mode flag** — corte 50% file count.
2. **CRIT 2: consolidated §7.1.1 atualizado com nomes reais** (`feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator`).
3. **CRIT 3: hooks documentados como ADVISORY** — não reescrever (issue aberta em §17.4 #8).
4. **CRIT 4: TDD step 10 parametrizado via `expected_inputs.pre_tester_artifacts`** — não shell-discovery hardcoded.
5. **MAJ 6: skill skipa step 9 se Phase 1.5 plan-architect rodou** — detecta via filesystem check.
6. **MAJ 9: step 11 gate REMOVIDO** — executor-controller adversarial gate cobre.
7. **MAJ 11: step 13 inline (controller)** — sem agent novo.
8. **Pré-check absorvido por Phase 0** — sem step 00 da skill.
9. **Rewrite full doc** — este documento (v2 limpo, sem decisões pendentes).
10. **v4.6.0 standalone mantido** — userstory/ux serão v4.7/v4.8 separados (documentado em §11 abaixo).

**Notas de implementação (não decisões — preparação writing-plans):**
- `feature-vertical-slice-planner` é re-spawned em steps 3, 7, 9 com TASK_CONTEXT diferente (não há split em sub-agents).
- `feature` substitui `implement-{heavy,light}.md` references existentes (rename + redirect).
- Estimativa atualizada: ~3-4h (era 4-5h em v1; menos arquivos = menos tempo).

---

## 11. Plano de portabilidade (esboço — não é o plan executável)

**Slice 3b atualizado:**

1. **Brainstorming** (este doc serve de input — sem decisões pendentes)
2. **Writing-plans** — gerar plano executável com tasks atômicas (~18 tasks vs ~30 v1)
3. **Executing-plans** — criar 16 arquivos (1 SKILL.md + 13 steps + 1 tests + 1 reference)
4. **Adversarial review round 2** — verificar fixes não introduziram regressão
5. **Pa de Cal**
6. **Release v4.6.0**

### 11.1 Atualizações no spec consolidado (já parcialmente aplicadas neste passe)

- ✅ §7.1.1: nomes corretos de agents
- ✅ §7.2.3: 13 passos shared para Light + Heavy
- ✅ §17.3 #12: histórico do bugfix descoberto via review
- ✅ §17.4 #8: hooks advisory aberto
- ⏸️ §22 ou §23 nova: documentar Slice 3b como entregue (faz parte do executing)
- ⏸️ §12.2 status table: adicionar Slice 3b row (parte do executing)

### 11.2 Atualizações no plugin

- `commands/pipeline.md`: adicionar `--variant=feature` + `--mode={light,heavy}` ao tabela
- `agents/core/task-orchestrator.md`: aceitar `force_variant=feature` + `force_mode={light,heavy}`
- `references/pipelines/feature.md`: NOVO (substitui `implement-{heavy,light}.md`)
- `references/pipelines/implement-{heavy,light}.md`: redirect ou DEPRECATED
- `CLAUDE.md`: bump versão + entry no roster (skills/feature/)
- `AGENTS.md`: atualizar
- `CHANGELOG.md`: entry v4.6.0
- `plugin.json` + `marketplace.json` + `hooks/hooks.json` SessionStart: bump 4.5.0 → 4.6.0

### 11.3 Versionamento — Slice 3b como v4.6.0 standalone

Decisão (10): cada Pulsar port ganha minor version (padrão Slice 1.5 = v4.4.0, Slice 3a = v4.5.0). Slice 3b = v4.6.0. **Userstory** e **ux** ainda dependem de design separado e ficam fora de v4.6.0 — virão como v4.7.0/v4.8.0 quando portados (provavelmente em sub-slices Slice 3c/3d). v5.0 final continua bloqueado por Slice 4 verde (per §12.8.3).

---

## 12. Estimativa de esforço (v2 atualizado)

| Fase | Tarefas | Tempo |
|---|---|---|
| Mapping doc v2 (este doc) | concluído | ~30min |
| Brainstorming follow-up | 0 (todas decisões resolvidas) | 0 |
| Writing-plans | gerar plano com ~18 tasks atômicas | ~25min |
| Execução: 1 skill + 13 steps + 1 tests + 1 reference + atualizações | ~18 atomic edits | ~1.5-2.5h |
| Adversarial review + fix-loop | 1 spawn + 0-2 fix attempts | ~20min |
| Pa de Cal + closeout | ~15min | ~15min |
| **Total v2** | | **~3-4 horas** |

(v1 estimava 4-5h com 26 arquivos. v2 = 16 arquivos, ~25% menos tempo.)

---

## 13. Riscos identificados (v2)

| Risco | Severidade | Mitigação |
|---|---|---|
| Mode flag mechanism é novo padrão (vs Slice 1.5/3a) | Média | Documentar bem em SKILL.md; smoke test ambos os modes pós-execution |
| `feature-vertical-slice-planner` re-spawn 3x pode causar context pollution | Baixa | Usar TASK_CONTEXT explicit em cada spawn; agente é stateless |
| Step 9 condicional (skip se Phase 1.5 rodou) precisa filesystem check robusto | Baixa | Validar path `PIPELINE_DOC_PATH/05-plan-architect.md` existe antes de skip |
| Hooks advisory pode degradar com tempo (drift entre SKILL.md e controller) | Média | Issue §17.4 #8 acompanha; revisão periódica |
| `references/pipelines/implement-*` rename pode quebrar referências externas | Baixa | Manter como redirect (header pointer) por 1 release antes de deletar |

---

## 14. Próximos passos

1. ✅ **Mapping v2 commitado** (este doc; após bugfix flow Pa de Cal).
2. **Invocar `superpowers:writing-plans`** para gerar plano executável (~18 tasks).
3. **Invocar `superpowers:executing-plans`** para implementar.
4. **Adversarial review round 2** — confirmar implementação respeitou as 10 decisões.
5. **Release v4.6.0** com tag.

**Owner:** dono do plugin.
**Timeline:** ~1 sessão de ~3-4h ou 2 sessões menores (~2h cada).

---

## 15. Apêndice — comparação rápida bugfix/audit/feature (v2 atualizado)

| Aspecto | bugfix | audit | feature (3b v2) |
|---|---|---|---|
| Steps Heavy | 11 | 9 | 13 |
| Steps Light | 8 | 9 | **13 (= Heavy via mode flag)** |
| Skills count | 2 separadas | 2 separadas | **1 com mode flag** |
| TDD obrigatório | sim (step 5) | não | sim (step 10, parametrizado) |
| Read-only Iron Law | não | sim | não |
| Architecture choice gate | não | não | **sim (step 7)** |
| Pré-check | não | sim | absorvido por Phase 0 |
| Release+observability step | não | sim (Pa de Cal) | sim (step 13 inline) |
| Step file count | 19 | 18 | **16** |
| Já portado? | ✅ v4.4.0 | ✅ v4.5.0 | ❌ pendente (v4.6.0 target) |

---

## 16. Histórico de revisões deste doc

| Versão | Data | Mudança |
|---|---|---|
| v1 | 2026-05-03 | Mapping inicial — 26 step files, 5 gates, 7 decisões pendentes |
| v2 | 2026-05-03 | Pós-bugfix flow: 16 step files, 4 gates, 0 decisões pendentes. Reescrita após 3 reviewers adversariais detectarem 5 CRIT + 7 MAJ + 6 MIN. 10 decisões resolvidas via AskUserQuestion. Mudanças estruturais: 1 skill com mode flag, hooks como advisory (não enforcement), TDD parametrizado, step 11 gate removido, pre-check absorvido por Phase 0. Consolidated §7.1.1, §7.2.3, §17.3 #12, §17.4 #8 atualizados em commit anterior. |

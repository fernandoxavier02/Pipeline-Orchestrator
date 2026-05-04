# Feature Pipeline Pulsar Import (Slice 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o workflow Pulsar `Implement_new_feature` (13 Heavy + 13 Light steps) como **skill única `feature`** no plugin pipeline-orchestrator com mode flag controlando verbosidade — pattern novo vs Slice 1.5/3a (que usavam 2 skills separadas).

**Architecture:** 1 skill `feature` com 13 step files mode-aware (`heavy` ou `light` section por step), 4 AskUserQuestion gates (steps 3, 7, 9, 10), 3 sentinel checkpoints, 5 agentes existentes reusados (`feature-vertical-slice-planner`, `feature-implementer`, `feature-integration-validator`, `pre-tester`, `quality-gate-router`). Hooks são ADVISORY (não enforcement) — controller respeita o contrato declarado em SKILL.md frontmatter.

**Tech Stack:** Markdown (skill files), YAML frontmatter (declarative contract), Node.js (existing hooks — não modificados). Plugin Claude Code 2.x.

**Spec:** `docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md` (v2 pós-bugfix, commit `670a97d`). 0 decisões pendentes.

**Cross-ref:** `designs/pipeline-orchestrator-v5-consolidated.md` §7.1.1 (3 agentes) + §7.2.3 (13 passos shared) + §17.3 #12 (drift discovery) + §17.4 #8 (hooks advisory issue).

**Estimated time:** 3-4h total para 25 tasks. Reduzido de v1 estimate (4-5h) por corte 26→16 file count.

**Target release:** v4.6.0 (minor) após Slice 3a (v4.5.0). Lineage: v4.4.x (Slice 1.5) → v4.5.0 (Slice 3a) → v4.6.0 (Slice 3b).

**UPDATE (v4.6.1 + v4.7.0 corrections):** Plan inicialmente escrito para v4.6.0 (single skill com mode flag). Implementação foi REVERTIDA em v4.6.1 (2 skills separadas espelhando Pulsar 1:1) e POLIDA em v4.7.0 (frontmatter contract completo + thin entry-point + tests reais). Use este plan doc apenas para histórico de design. Canonical implementation atual: `skills/feature-{light,heavy}/SKILL.md` + `skills/feature/SKILL.md`. Ver CHANGELOG [4.6.1] e [4.7.0] para racional das mudanças.

---

## Pre-Execution Notes

**Working directory:** `D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/`

**Pipeline session lock:** Edit-guard pode bloquear edits em arquivos fora de `.pipeline/**`. Se vir `PIPELINE_LOCK_ACTIVE` error:

```bash
ls "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/.pipeline/sessions/"
# Se houver <session-id>.lock:
node "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/scripts/exec-window/open.cjs" \
  "<session-id>" "pipeline-controller" "slice-3b-execution" 60
# Trabalhar... depois fechar:
node "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/scripts/exec-window/close.cjs" "<session-id>"
```

**Pulsar source files:** `D:/Projeto Pulsar/.claude/commands/Prompts/Implement_new_feature/` — Heavy (`/Heavy/`) + Light (`/Ligth/` — note typo). Inventory em §2 do mapping spec.

**Reference precedents:** `skills/audit-{light,heavy}/` (Slice 3a) e `skills/bugfix-{light,heavy}/` (Slice 1.5) servem como templates estruturais. **Diferença chave para Slice 3b:** 1 skill com mode flag em vez de 2.

**Iron Law:** NÃO modificar código de produção dos consumer projects. Só criar arquivos no plugin.

---

## Phase A: Scaffolding + manifest (Tasks 1-2)

### Task 1: Scaffolding directories + placeholder files

**Files:**
- Create: `skills/feature/` (directory)
- Create: `skills/feature/steps/` (directory)
- Create: `skills/feature/tests/` (directory)
- Create: 14 placeholder files (1 SKILL.md + 13 step .md) com 1-line content para sequence_lock validation funcionar

**Por que placeholders primeiro:** SKILL.md em Task 2 vai referenciar paths dos 13 step files. Se algum não existir, plugin-validator (se rodar) flagga. Placeholders resolvem ordering dependency.

- [ ] **Step 1: Create directory structure**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
mkdir -p skills/feature/steps skills/feature/tests
```

Expected: directories created (no output).

- [ ] **Step 2: Create 13 placeholder step files**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
for n in 01-intent-scope 02-terrain-recon 03-user-flow-ux 04-domain-rules 05-source-of-truth 06-data-model-persistence 07-arch-design-options 08-risk-controls 09-implementation-plan 10-test-pre-impl 11-execution-minimal-diff 12-testing-validation 13-release-observability; do
  echo "# Placeholder for $n — populated in Task $(echo $n | cut -d- -f1 | sed 's/^0//')+2" > "skills/feature/steps/${n}.md"
done
```

Expected: 13 files created.

- [ ] **Step 3: Create placeholder SKILL.md**

```bash
echo "# Placeholder SKILL.md — populated in Task 2" > "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/skills/feature/SKILL.md"
```

- [ ] **Step 4: Verify scaffolding**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
ls skills/feature/ skills/feature/steps/ skills/feature/tests/
find skills/feature -type f | wc -l
```

Expected: SKILL.md + 13 step files = 14 files.

- [ ] **Step 5: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add skills/feature/
git commit -m "feat(feature-skill): scaffolding for Slice 3b — placeholders for 13 steps + SKILL.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 14 files added.

---

### Task 2: SKILL.md (manifest with frontmatter contract)

**Files:**
- Modify (overwrite placeholder): `skills/feature/SKILL.md`

**Reference:** Use `skills/audit-heavy/SKILL.md` as structural template, but adapt to single-skill-with-mode-flag pattern. Frontmatter contract per §4.2 + §7.1 of mapping spec.

- [ ] **Step 1: Read precedent SKILL.md for structural reference**

```bash
cat "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/skills/audit-heavy/SKILL.md"
```

Expected: ~100-150 lines showing frontmatter + sequence list + step references.

- [ ] **Step 2: Write SKILL.md content**

Overwrite `skills/feature/SKILL.md` with:

````markdown
---
name: feature
description: |
  Prescriptive workflow para implementar uma nova feature seguindo 13 passos canônicos
  importados do Pulsar Implement_new_feature. Usar `--mode=heavy` (default) para features
  com impacto relevante (domínio, dados, integrações, multi-fluxo) ou `--mode=light` para
  features pequenas/médias com risco controlado. Cobre: intent scope, terrain recon, user
  flow + UX, domain rules, source of truth, data model, architecture choice (gate),
  risk controls, implementation plan (gate; skip se Phase 1.5 plan-architect rodou),
  TDD pre-impl (gate; via pre-tester agent), execution minimal diff, testing validation,
  release observability. 4 AskUserQuestion gates obrigatórios (steps 3, 7, 9, 10).
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion, Edit, Write, Bash]
argument-hint: "[--mode=light|heavy] [feature description com user story + DoD]"
sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
sequence_lock: true
gates_at: [3, 7, 9, 10]
sentinel_checkpoints: [pre_3, pre_10, pre_13]
stop_rule_max_failures: 2
mode: heavy
---

# Feature Pipeline Skill (Pulsar Slice 3b)

Implementa uma nova feature seguindo workflow Pulsar de 13 passos. Pattern: **single skill com mode flag** — único entre os ports do pipeline-orchestrator (vs 2 skills separadas em Slice 1.5/3a).

## Quando usar

- **Heavy mode (default):** feature/melhoria com impacto relevante (domínio, dados, integrações, múltiplos fluxos, contratos, jobs, mobile) ou quando você quer máxima previsibilidade.
- **Light mode (`--mode=light`):** feature pequena/média com risco controlado e velocidade necessária.

## Sequência canônica (13 passos)

1. **Intent + Value + Scope** (`steps/01-intent-scope.md`)
2. **Terrain Recon** (`steps/02-terrain-recon.md`)
3. **User Flow + UX** (`steps/03-user-flow-ux.md`) — **GATE: matriz cenários approval**
4. **Domain Rules** (`steps/04-domain-rules.md`)
5. **Source of Truth** (`steps/05-source-of-truth.md`)
6. **Data Model + Persistence** (`steps/06-data-model-persistence.md`)
7. **Architecture Design Options** (`steps/07-arch-design-options.md`) — **GATE: escolher abordagem**
8. **Risk Controls** (`steps/08-risk-controls.md`)
9. **Implementation Plan** (`steps/09-implementation-plan.md`) — **GATE: aprovar plan; SKIP se Phase 1.5 plan-architect rodou**
10. **TDD Pre-Impl (RED)** (`steps/10-test-pre-impl.md`) — **GATE: aprovar testes**
11. **Execution Minimal Diff (GREEN)** (`steps/11-execution-minimal-diff.md`) — sem gate skill-level (executor-controller cobre)
12. **Testing Validation** (`steps/12-testing-validation.md`)
13. **Release + Observability** (`steps/13-release-observability.md`)

## Ownership

- **Inline (controller):** steps 1, 2, 4, 5, 6, 8, 13
- **`feature-vertical-slice-planner`:** steps 3, 7, 9 (re-spawned 3x com TASK_CONTEXT diferente)
- **`pre-tester`:** step 10 (recebe `expected_inputs.pre_tester_artifacts`)
- **`feature-implementer`:** step 11
- **`feature-integration-validator`:** step 12

## Mode flag mechanism

Cada `steps/NN-*.md` tem 2 seções de prompt: `## Heavy mode prompt` (verbose) e `## Light mode prompt` (compact). Controller seleciona seção baseado em `mode` flag declarado neste frontmatter ou no override `--mode=` do argument.

## Hooks contract (ADVISORY)

Os campos `sequence_lock`, `gates_at`, `sentinel_checkpoints` são **declarativos para humanos lerem** e para o controller respeitar — **NÃO há enforcement automático via hooks** (verificado 2026-05-03; ver `designs/pipeline-orchestrator-v5-consolidated.md` §17.4 #8).

## Pre-check

Pré-check (`HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` no Pulsar) NÃO virou step da skill — Phase 0 do pipeline (`information-gate` + `design-interrogator`) absorve.

## Reference

`references/pipelines/feature.md` lista team composition + step ordering. Tests em `tests/tests-feature.md`.
````

- [ ] **Step 3: Verify YAML frontmatter parses**

```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/skills/feature/SKILL.md', 'utf8');
const fmMatch = c.match(/^---\n([\s\S]*?)\n---/);
if (!fmMatch) { console.error('NO FRONTMATTER'); process.exit(1); }
console.log('Frontmatter found:', fmMatch[1].split('\n').length, 'lines');
['name:', 'description:', 'disable-model-invocation:', 'allowed-tools:', 'sequence:', 'sequence_lock:', 'gates_at:', 'sentinel_checkpoints:', 'mode:'].forEach(k => {
  console.log(k, fmMatch[1].includes(k) ? 'OK' : 'MISSING');
});
"
```

Expected: all keys "OK".

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add skills/feature/SKILL.md
git commit -m "feat(feature-skill): SKILL.md manifest with mode flag + frontmatter contract

Single-skill-with-mode-flag pattern (vs 2 skills in Slice 1.5/3a).
4 gates (3, 7, 9, 10), 3 sentinel checkpoints (pre_3, pre_10, pre_13).
Hooks documented as ADVISORY per spec §5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B: 13 step files (Tasks 3-15)

### Step file template (used by Tasks 3-15)

Cada task de step file segue este pattern:

1. Read Pulsar HEAVY source file
2. Read Pulsar LIGHT source file
3. Write target step file with structure:
   - Frontmatter (step-specific contract)
   - `## Heavy mode prompt` section (Pulsar HEAVY content adapted, with plugin-specific cabeçalhos)
   - `## Light mode prompt` section (Pulsar LIGHT content adapted)
   - `## Expected outputs` section (per step)
4. Verify file size + frontmatter parse
5. Commit

**Step-specific frontmatter pattern:**

```yaml
---
step_number: NN
step_name: "kebab-case-name"
execution_mode: inline | subagent
agent_type: ""              # only if subagent; "" if inline
expected_inputs:
  - input_key: source_description
expected_outputs:
  - output_key: structure
expected_next: NN+1 (or "complete" if step 13)
gate_required: true | false
gate_name: "kebab-case"     # only if gate_required
allowed_tools: [list]
---
```

---

### Task 3: Step 01 — Intent Scope

**Files:**
- Source: `D:/Projeto Pulsar/.claude/commands/Prompts/Implement_new_feature/Heavy/HEAVY_01_01_INTENT_SCOPE.md`
- Source: `D:/Projeto Pulsar/.claude/commands/Prompts/Implement_new_feature/Ligth/LIGHT_01_01_INTENT_SCOPE.md`
- Target (overwrite placeholder): `skills/feature/steps/01-intent-scope.md`

- [ ] **Step 1: Read both Pulsar sources**

```bash
cat "D:/Projeto Pulsar/.claude/commands/Prompts/Implement_new_feature/Heavy/HEAVY_01_01_INTENT_SCOPE.md"
echo "---LIGHT---"
cat "D:/Projeto Pulsar/.claude/commands/Prompts/Implement_new_feature/Ligth/LIGHT_01_01_INTENT_SCOPE.md"
```

- [ ] **Step 2: Write target file**

Overwrite `skills/feature/steps/01-intent-scope.md` with:

````markdown
---
step_number: 1
step_name: "intent-scope"
execution_mode: inline
agent_type: ""
expected_inputs:
  - feature_description: from_user_argument
  - user_story: from_user_argument
  - dod_criteria: from_user_argument
expected_outputs:
  - intent_doc: { business_objective, user_story, dod, scope_in, scope_out, restrictions }
  - tech_findings: { evidence_vs_assumption, domain_applies, ssot_required, idempotency_required, atomicity_required }
  - recommended_next: "step-2-terrain-recon"
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 01 — Intent + Value + Scope

> **Posição no Pipeline:** Passo 1 — Início. Define escopo antes de qualquer recon ou implementação.
> **Objetivo:** Estabelecer intenção, valor de negócio e limites claros de escopo.

## Heavy mode prompt

Você é meu arquiteto/engenheiro sênior. Faça uma análise profunda focada em "Intenção, valor e limites de escopo", mantendo governança e impacto mínimo.

**Contexto da feature:**
- Objetivo de negócio: [extraído do argumento]
- User story principal: [extraído]
- Critérios de aceite (DoD): [3-8 itens — extraídos]
- Escopo (entra): [extraído]
- Fora de escopo: [extraído]
- Restrições: preservar arquitetura; preservar estilo/UI; mudanças mínimas; evitar alterações desnecessárias.

**Tarefas obrigatórias:**
1. Análise "Intenção, valor e limites de escopo" em detalhe, apontando decisões técnicas e riscos.
2. Declare explicitamente se regras de negócio se aplicam; se sim, liste-as e marque ambiguidades.
3. Defina a fonte da verdade do estado envolvido (se houver) e como evitar estados divergentes (UI vs backend vs cache).
4. Avalie persistência (se houver): entidades, chaves, invariantes, e risco de registros órfãos/incompletos.
5. Avalie execução repetida: double click, retries, jobs duplicados. Se relevante, exija idempotência.
6. Avalie multi-etapas: se falhar no meio, há estado intermediário? Se relevante, exija atomicidade (transação/flags/compensação).
7. Entregue recomendações proporcionais ao risco (mínimo necessário, sem overengineering).

**Regras:**
- Não implemente código nesta etapa.
- Não proponha refatoração ampla como pré-requisito.
- Declare "EVIDÊNCIA" (do repo) vs "ASSUNÇÃO" (inferida).
- Se faltar informação, diga exatamente como confirmar.

**Formato da resposta (obrigatório):**
- Resumo executivo
- Achados técnicos (com EVIDÊNCIA vs ASSUNÇÃO)
- Domínio/fonte da verdade/persistência (se aplicável)
- Idempotência/atomicidade/concorrência (se aplicável)
- Perguntas mínimas para fechar lacunas
- Próximo passo recomendado

## Light mode prompt

**Contexto da feature:**
- Feature/melhoria: [extraído]
- Valor para usuário/negócio: [extraído]
- Onde imagino que entra: [extraído]
- Restrições: mudanças mínimas; preservar padrões; evitar refatoração ampla; manter estilo/UI.

**Tarefa:**
1. Entregue uma análise objetiva para "Intenção, valor e limites de escopo".
2. Diga se itens como regras de negócio, fonte da verdade, persistência, idempotência e atomicidade se aplicam ou não aqui, e por quê.
3. Liste o próximo passo mais eficiente e barato para reduzir incerteza.

**Sinal de migração para Heavy:** se persistência sensível, regras de negócio complexas, integração crítica, concorrência ou grande impacto em UX/contratos surgir, sinalize e recomende migrar para Heavy.

**Formato:**
- Achados principais
- Aplica / Não aplica (domínio/dados/repetição)
- Próximo passo recomendado

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/01-feature-intent-scope.md` com:

- `intent_doc`: parágrafo curto com objetivo + user story + DoD
- `tech_findings`: lista marcada [EVIDÊNCIA] ou [ASSUNÇÃO]
- `domain_applies`: bool + justificativa
- `next_step_recommendation`: prosa curta

**Próximo:** Step 02 — Terrain Recon.
````

- [ ] **Step 3: Verify file**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
wc -l skills/feature/steps/01-intent-scope.md
grep -c "## Heavy mode prompt\|## Light mode prompt\|## Expected outputs" skills/feature/steps/01-intent-scope.md
```

Expected: ~80-100 lines, count = 3 (3 sections present).

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add skills/feature/steps/01-intent-scope.md
git commit -m "feat(feature-skill): step 01 intent-scope (Heavy + Light prompts adapted from Pulsar)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Tasks 4-14: Steps 02-12 (apply Step file template)

**Each task follows the SAME 4-step pattern as Task 3:** read 2 Pulsar sources, write target with frontmatter + Heavy + Light sections + Expected outputs, verify, commit. Step-specific overrides below.

#### Task 4: Step 02 — Terrain Recon

- Source HEAVY: `Heavy/HEAVY_02_02_TERRAIN_RECON.md`
- Source LIGHT: `Ligth/LIGHT_02_02_TERRAIN_RECON.md`
- Target: `skills/feature/steps/02-terrain-recon.md`
- Frontmatter overrides:
  - `step_number: 2`, `step_name: "terrain-recon"`
  - `execution_mode: inline`, `agent_type: ""`
  - `expected_inputs: [intent_doc: from_step_1]`
  - `expected_outputs: [extension_points_map, existing_patterns_to_follow, related_flows_summary]`
  - `expected_next: 3`, `gate_required: false`
  - `allowed_tools: [Read, Grep, Glob]`

- [ ] **Steps 1-4: Same pattern as Task 3** (read 2 sources, write target, verify, commit). Adapt Heavy/Light prompts focusing on: identificar arquitetura em alto nível, módulos relevantes, padrões existentes, pontos de extensão prováveis.

#### Task 5: Step 03 — User Flow + UX (PRIMEIRO GATE)

- Source HEAVY: `Heavy/HEAVY_03_03_USER_FLOW_UX.md`
- Source LIGHT: `Ligth/LIGHT_03_03_USER_FLOW_UX.md`
- Target: `skills/feature/steps/03-user-flow-ux.md`
- Frontmatter overrides:
  - `step_number: 3`, `step_name: "user-flow-ux"`
  - `execution_mode: subagent`, `agent_type: "feature-vertical-slice-planner"`
  - `expected_inputs: [intent_doc: from_step_1, terrain: from_step_2]`
  - `expected_outputs: [acceptance_matrix: { scenarios: [...], priorities: [...] }, ui_states_map]`
  - `expected_next: 4`, `gate_required: true`, `gate_name: "acceptance-matrix-approval"`
  - `allowed_tools: [Read, Grep, Glob, AskUserQuestion]`

- [ ] **Steps 1-4: Same pattern** + **Step 5: Add gate documentation in body**

Após "## Expected outputs", adicionar:

```markdown
## GATE: acceptance-matrix-approval

Antes de prosseguir para Step 04, controller DEVE invocar AskUserQuestion:

```yaml
AskUserQuestion(
  questions: [{
    question: "Aprovar matriz de cenários antes de prosseguir para Domain Rules?",
    header: "Acceptance",
    multiSelect: false,
    options: [
      { label: "Aprovar (Recomendado)", description: "Matriz fixa contrato. Prosseguir para Domain Rules." },
      { label: "Ajustar matriz", description: "Modificar cenários/prioridades antes de fixar." },
      { label: "Voltar para Step 02", description: "Terrain ou intent precisam de revisão." }
    ]
  }]
)
```

BLOQUEAR step 4 até user aprovar.
```

#### Task 6: Step 04 — Domain Rules

- Source HEAVY: `Heavy/HEAVY_04_04_DOMAIN_RULES.md`
- Source LIGHT: `Ligth/LIGHT_04_04_DOMAIN_RULES.md`
- Target: `skills/feature/steps/04-domain-rules.md`
- Frontmatter overrides:
  - `step_number: 4`, `step_name: "domain-rules"`
  - `execution_mode: inline`, `agent_type: ""`
  - `expected_inputs: [acceptance_matrix: from_step_3]`
  - `expected_outputs: [domain_rules: [...], property_test_specs: [...]]`
  - `expected_next: 5`, `gate_required: false`
  - `allowed_tools: [Read, Grep, Glob]`

- [ ] **Steps 1-4: Same pattern** — focar em regras de negócio + property tests RED para regras isoladas.

#### Task 7: Step 05 — Source of Truth

- Source HEAVY: `Heavy/HEAVY_05_05_SOURCE_OF_TRUTH.md`
- Source LIGHT: `Ligth/LIGHT_05_05_SOURCE_OF_TRUTH.md`
- Target: `skills/feature/steps/05-source-of-truth.md`
- Frontmatter overrides:
  - `step_number: 5`, `step_name: "source-of-truth"`
  - `execution_mode: inline`, `agent_type: ""`
  - `expected_inputs: [domain_rules: from_step_4]`
  - `expected_outputs: [ssot_mapping: { state: source, sync_strategy }]`
  - `expected_next: 6`, `gate_required: false`
  - `allowed_tools: [Read, Grep, Glob]`

- [ ] **Steps 1-4: Same pattern** — definir source of truth + invariantes para evitar estados divergentes.

#### Task 8: Step 06 — Data Model + Persistence

- Source HEAVY: `Heavy/HEAVY_06_06_DATA_MODEL_PERSISTENCE.md`
- Source LIGHT: `Ligth/LIGHT_06_06_DATA_MODEL_PERSISTENCE.md`
- Target: `skills/feature/steps/06-data-model-persistence.md`
- Frontmatter overrides:
  - `step_number: 6`, `step_name: "data-model-persistence"`
  - `execution_mode: inline`, `agent_type: ""`
  - `expected_inputs: [ssot_mapping: from_step_5]`
  - `expected_outputs: [schema_design, migration_specs, integration_test_specs]`
  - `expected_next: 7`, `gate_required: false`
  - `allowed_tools: [Read, Grep, Glob]`

- [ ] **Steps 1-4: Same pattern** — schema + migração + integration tests para persistence (save/load/constraints).

#### Task 9: Step 07 — Architecture Design Options (SEGUNDO GATE)

- Source HEAVY: `Heavy/HEAVY_07_07_ARCH_DESIGN_OPTIONS.md`
- Source LIGHT: `Ligth/LIGHT_07_07_ARCH_DESIGN_OPTIONS.md`
- Target: `skills/feature/steps/07-arch-design-options.md`
- Frontmatter overrides:
  - `step_number: 7`, `step_name: "arch-design-options"`
  - `execution_mode: subagent`, `agent_type: "feature-vertical-slice-planner"`
  - `expected_inputs: [domain: from_step_4, ssot: from_step_5, schema: from_step_6]`
  - `expected_outputs: [options: [{ approach, pros, cons, recommended: bool }], chosen_approach]`
  - `expected_next: 8`, `gate_required: true`, `gate_name: "architecture-choice"`
  - `allowed_tools: [Read, Grep, Glob, AskUserQuestion]`

- [ ] **Steps 1-4: Same pattern** + **Step 5: Add architecture choice gate**:

```markdown
## GATE: architecture-choice

Após apresentar 2-3 opções com trade-offs, controller invoca AskUserQuestion:

```yaml
AskUserQuestion(
  questions: [{
    question: "Qual abordagem implementar?",
    header: "Architecture",
    multiSelect: false,
    options: [
      { label: "<Opção A — Recomendada por <razão>>", description: "Prós: ... Contras: ..." },
      { label: "<Opção B>", description: "Prós: ... Contras: ..." },
      { label: "<Opção C>", description: "Prós: ... Contras: ..." }
    ]
  }]
)
```

A escolha define o `chosen_approach` que vira input do Step 08 (Risk Controls) e Step 09 (Implementation Plan).
```

#### Task 10: Step 08 — Risk Controls

- Source HEAVY: `Heavy/HEAVY_08_08_RISK_CONTROLS.md`
- Source LIGHT: `Ligth/LIGHT_08_08_RISK_CONTROLS.md`
- Target: `skills/feature/steps/08-risk-controls.md`
- Frontmatter overrides:
  - `step_number: 8`, `step_name: "risk-controls"`
  - `execution_mode: inline`, `agent_type: ""`
  - `expected_inputs: [chosen_approach: from_step_7]`
  - `expected_outputs: [risk_register, idempotency_test_specs, atomicity_test_specs]`
  - `expected_next: 9`, `gate_required: false`
  - `allowed_tools: [Read, Grep, Glob]`

- [ ] **Steps 1-4: Same pattern** — idempotência/concorrência/atomicidade + property tests.

#### Task 11: Step 09 — Implementation Plan (TERCEIRO GATE + CONDITIONAL SKIP)

- Source HEAVY: `Heavy/HEAVY_09_09_IMPLEMENTATION_PLAN.md`
- Source LIGHT: `Ligth/LIGHT_09_09_IMPLEMENTATION_PLAN.md`
- Target: `skills/feature/steps/09-implementation-plan.md`
- Frontmatter overrides:
  - `step_number: 9`, `step_name: "implementation-plan"`
  - `execution_mode: subagent`, `agent_type: "feature-vertical-slice-planner"`
  - `expected_inputs: [risk_register: from_step_8, chosen_approach: from_step_7]`
  - `expected_outputs: [implementation_plan: { tasks: [...], dod_per_task: [...], risks: [...] }]`
  - `expected_next: 10`, `gate_required: true`, `gate_name: "plan-approval"`
  - `allowed_tools: [Read, Grep, Glob, AskUserQuestion]`

- [ ] **Steps 1-4: Same pattern** + **Step 5: Add conditional skip logic + gate** (CRITICAL — diferente dos outros)

Adicionar PRIMEIRA seção do step body (antes de `## Heavy mode prompt`):

````markdown
## Conditional skip — Phase 1.5 plan-architect detection

**ANTES de qualquer prompt execution:** controller verifica filesystem:

```bash
ls "$PIPELINE_DOC_PATH/05-plan-architect.md" 2>/dev/null
```

Se arquivo existe AND foi gerado nesta run (timestamp dentro da janela de execução):
1. Marcar step 9 como `skipped_inherited_from: phase_1.5` em `gate-decisions.jsonl`
2. Carregar plan-architect output como `implementation_plan` para step 10
3. Pular gate `plan-approval` (Phase 1.5 já teve user approval)
4. Avançar direto para step 10

Se arquivo NÃO existe:
- Executar normalmente (Heavy mode prompt OU Light mode prompt + gate)

Lógica vive na PROSA deste step file (procedural — controller respeita ANTES de spawnar agent).
````

E adicionar gate doc após Expected outputs:

```markdown
## GATE: plan-approval (skip se conditional skip acima ativou)

```yaml
AskUserQuestion(
  questions: [{
    question: "Aprovar implementation plan antes de TDD pre-impl?",
    header: "Plan",
    multiSelect: false,
    options: [
      { label: "Aprovar (Recomendado)", description: "Plan fixa blueprint. Prosseguir para TDD RED tests." },
      { label: "Revisar plan", description: "Modificar tasks, ordem, ou DoD por task." },
      { label: "Voltar para Step 07", description: "Architecture choice precisa revisão." }
    ]
  }]
)
```
```

#### Task 12: Step 10 — TDD Pre-Impl (QUARTO GATE + PARAMETRIZED)

- Source HEAVY: `Heavy/HEAVY_10_TEST_PRE_IMPL.md` (canônico, novo 11/02)
- Source LIGHT: `Ligth/LIGHT_10_TEST_PRE_IMPL.md` (canônico)
- Target: `skills/feature/steps/10-test-pre-impl.md`
- Frontmatter overrides:
  - `step_number: 10`, `step_name: "test-pre-impl"`
  - `execution_mode: subagent`, `agent_type: "pre-tester"`
  - `expected_inputs: [implementation_plan: from_step_9, pre_tester_artifacts: optional_from_phase_2_pre_tester]`
  - `expected_outputs: [test_files_created: [path list], test_status: { red: int, green: int, total: int }]`
  - `expected_next: 11`, `gate_required: true`, `gate_name: "tdd-tests-approval"`
  - `allowed_tools: [Read, Grep, Glob, Write, Bash]`

- [ ] **Steps 1-4: Same pattern** + **Step 5: Replace Pulsar's hardcoded paths with parametrized**

CRITICAL: Pulsar source tem `ls -la functions/src/__tests__/*feature*.test.ts` (Firebase-specific). Adapter:

Substituir TODA a seção "⚠️ Integração TDD v3.0 (VERIFICAR PRIMEIRO)" do Pulsar por:

```markdown
## Pre-Tester integration (parametrized)

**ANTES de criar testes**, verificar `expected_inputs.pre_tester_artifacts`:

- **Se NÃO vazio:** o agente `pre-tester` (Phase 2 do pipeline) já criou testes nesta run. Caminho: `pre_tester_artifacts.test_files`. Ações:
  1. NÃO criar novos testes
  2. Verificar cobertura: contratos de feature/integração/regressão/borda cobertos?
  3. Complementar APENAS se faltar algo crítico
  4. Executar testes existentes
  5. Confirmar feature tests FALHAM (RED)
  6. Confirmar regression tests PASSAM

- **Se vazio:** seguir fluxo abaixo (Heavy ou Light prompt) para criar testes do zero.

**Por que parametrizado e não shell discovery:** Pulsar usa paths Firebase-específicos (`functions/src/__tests__/*feature*.test.ts`) que não generalizam. O agente `pre-tester` conhece o stack do projeto consumer e passa paths corretos via `expected_inputs`. Ver mapping spec §10 decisão 4.
```

E adicionar gate:

```markdown
## GATE: tdd-tests-approval

```yaml
AskUserQuestion(
  questions: [{
    question: "Aprovar testes RED antes de Execution Minimal Diff?",
    header: "TDD RED",
    multiSelect: false,
    options: [
      { label: "Aprovar (Recomendado)", description: "Tests RED definem contrato. Prosseguir para GREEN implementation." },
      { label: "Revisar/adicionar testes", description: "Cobertura insuficiente ou contratos faltando." },
      { label: "Voltar para Step 09", description: "Plan precisa revisão." }
    ]
  }]
)
```

BLOQUEAR step 11 até user aprovar.
```

#### Task 13: Step 11 — Execution Minimal Diff (SEM gate skill-level)

- Source HEAVY: `Heavy/HEAVY_11_10_EXECUTION_MINIMAL_DIFF.md` (canônico)
- Source LIGHT: `Ligth/LIGHT_11_10_EXECUTION_MINIMAL_DIFF.md` (canônico)
- Target: `skills/feature/steps/11-execution-minimal-diff.md`
- Frontmatter overrides:
  - `step_number: 11`, `step_name: "execution-minimal-diff"`
  - `execution_mode: subagent`, `agent_type: "feature-implementer"`
  - `expected_inputs: [implementation_plan: from_step_9, test_files: from_step_10]`
  - `expected_outputs: [files_modified: [...], files_created: [...], green_status: bool]`
  - `expected_next: 12`, `gate_required: false`  ← **CRITICAL: NO gate skill-level**
  - `allowed_tools: [Read, Grep, Glob, Edit, Write, Bash]`

- [ ] **Steps 1-4: Same pattern** + **Step 5: Add note explaining no gate**

Adicionar nota no fim do file:

```markdown
## Por que sem gate skill-level

Step 11 escreve código. Phase 2 do pipeline (`executor-controller`) já tem **adversarial gate** antes de qualquer Edit (per CRITICAL REMINDER #6 do `commands/pipeline.md`). Adicionar gate skill-level seria DOUBLE GATE — usuário aprovando 2x antes do mesmo Edit. Bugfix e Audit ports não fazem isso.

**Ver:** mapping spec §10 decisão 6 (MAJ 9 do adversarial review).
```

#### Task 14: Step 12 — Testing Validation

- Source HEAVY: `Heavy/HEAVY_12_11_TESTING_VALIDATION.md` (canônico)
- Source LIGHT: `Ligth/LIGHT_12_11_TESTING_VALIDATION.md` (canônico)
- Target: `skills/feature/steps/12-testing-validation.md`
- Frontmatter overrides:
  - `step_number: 12`, `step_name: "testing-validation"`
  - `execution_mode: subagent`, `agent_type: "feature-integration-validator"`
  - `expected_inputs: [files_modified: from_step_11, test_files: from_step_10]`
  - `expected_outputs: [unit_results, integration_results, e2e_results, perf_results]`
  - `expected_next: 13`, `gate_required: false`
  - `allowed_tools: [Read, Grep, Glob, Bash]`

- [ ] **Steps 1-4: Same pattern** — rodar suíte completa (unit/integração/E2E + perf/security/mutation).

#### Task 15: Step 13 — Release + Observability

- Source HEAVY: `Heavy/HEAVY_13_12_RELEASE_OBSERVABILITY.md` (canônico)
- Source LIGHT: `Ligth/LIGHT_13_12_RELEASE_OBSERVABILITY.md` (canônico)
- Target: `skills/feature/steps/13-release-observability.md`
- Frontmatter overrides:
  - `step_number: 13`, `step_name: "release-observability"`
  - `execution_mode: inline`, `agent_type: ""`
  - `expected_inputs: [test_results: from_step_12]`
  - `expected_outputs: [release_notes, monitoring_setup, observability_checklist]`
  - `expected_next: "complete"`, `gate_required: false`
  - `allowed_tools: [Read, Grep, Glob, Edit, Write, Bash]`

- [ ] **Steps 1-4: Same pattern** — release notes + monitoring/logs/tracing setup. Inline (sem agent novo) per mapping spec §10 decisão 7.

---

## Phase C: Tests + reference (Tasks 16-17)

### Task 16: tests/tests-feature.md

**Files:**
- Sources: `D:/Projeto Pulsar/.claude/commands/Prompts/Implement_new_feature/Heavy/TESTS_USER_STORY_HEAVY.md` + `Ligth/TESTS_USER_STORY_LIGHT.md`
- Create: `skills/feature/tests/tests-feature.md`

- [ ] **Step 1: Read both sources**

```bash
cat "D:/Projeto Pulsar/.claude/commands/Prompts/Implement_new_feature/Heavy/TESTS_USER_STORY_HEAVY.md"
echo "---LIGHT---"
cat "D:/Projeto Pulsar/.claude/commands/Prompts/Implement_new_feature/Ligth/TESTS_USER_STORY_LIGHT.md"
```

- [ ] **Step 2: Write merged file**

Create `skills/feature/tests/tests-feature.md`:

````markdown
# Diretrizes de testes para tradução de user story (Feature Skill)

> **Fonte:** Pulsar `TESTS_USER_STORY_HEAVY.md` + `TESTS_USER_STORY_LIGHT.md` (absorvidos como referência única). Cada seção marca quando aplica Heavy ou Light.

## Visão geral

Tradução técnica de user stories complexas exige decomposição estruturada, critérios de aceitação completos e testes que sirvam de base para TDD. Este doc apresenta boas práticas usadas pelos steps 03 (User Flow + UX), 04 (Domain Rules), 06 (Data Model + Persistence) e 10 (TDD Pre-Impl) da skill feature.

## Mode-aware sections

### 1. Diagnóstico da história

**Heavy:**
- Mapeamento do contexto: atores, sistemas externos, variáveis de contexto.
- Identificação de requisitos implícitos: políticas tácitas, restrições legais, limites de performance.
- Análise de impacto: regressão risk, refatoração needs.

**Light:**
- Diagnóstico mínimo: ator + sistema afetado + 1 contexto.
- Identificação de regras óbvias.
- Impacto local apenas.

### 2. Critérios de aceitação + matriz de cenários

**Heavy:**
- Decompor em sub-funcionalidades.
- Matriz de cenários: variações de entradas (válidas, inválidas, limites) × estados.
- Priorizar: obrigatórios na primeira entrega + avançados pra depois.

**Light:**
- 1-3 critérios principais.
- Matriz mínima: 1-2 cenários happy + 1 erro.

### 3. Especificação técnica focada em testes

**Heavy:**
- Contratos formais: OpenAPI, GraphQL com exemplos req/res/erro.
- Modelagem de dados: schemas + validações + constraints + relacionamentos.
- Critérios não-funcionais: performance, segurança, conformidade, usabilidade.

**Light:**
- Contratos básicos sem formalização.
- Schema simples se houver persistência.
- Foco em sucesso happy path.

### 4. Planejamento de testes automatizados

**Heavy:**
- BDD scenarios em Gherkin para cada linha da matriz.
- Fixtures versionadas para cenários complexos.
- Níveis: unit + integration + contract + E2E + property-based.

**Light:**
- 1 main + 1 regression + 1 edge case (cap §10.1 do consolidated).
- Fixtures inline.
- Níveis: unit + 1 integration.

### 5. Validação + refinamento

**Heavy:**
- Reuniões de refinamento com PO/stakeholders.
- Cross-review por arquiteto.
- Traçado de dependências completo.

**Light:**
- Auto-validação rápida.
- Sem cross-review formal.
- Dependências mapeadas inline.

### 6. Artefatos de apoio

**Heavy:**
- Specs versionadas em `specs/<feature>.md`.
- Backlog de tasks técnicas.
- Plano de testes executivo.

**Light:**
- Specs inline no PR.
- Tasks no commit message.

## Resultado esperado

Independente do mode:
- Decomposição da história em sub-features + critérios.
- Especificações técnicas (contratos, modelos, restrições).
- Conjunto de testes BDD/pseudo-código para automação.
- Backlog organizado focado em TDD.
````

- [ ] **Step 3: Verify**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
wc -l skills/feature/tests/tests-feature.md
```

Expected: ~70-90 lines.

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add skills/feature/tests/tests-feature.md
git commit -m "feat(feature-skill): tests-feature.md — merged Pulsar TESTS_USER_STORY {HEAVY,LIGHT}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: references/pipelines/feature.md (new — substitui implement-*)

**Files:**
- Create: `references/pipelines/feature.md`

- [ ] **Step 1: Read existing references for format**

```bash
cat "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/references/pipelines/audit-heavy.md" | head -40
```

- [ ] **Step 2: Write feature.md**

Create `references/pipelines/feature.md`:

````markdown
# Pipeline reference: feature

**As of v4.6.0:** thin reference para skill `feature` (single-skill-with-mode-flag pattern). Substitui `implement-heavy.md` e `implement-light.md` (deprecated, mantidos como redirects).

**Skill backing:** `skills/feature/SKILL.md`

## Mode flag

| Mode | Caso de uso | Cap |
|---|---|---|
| `heavy` (default) | Feature com impacto relevante (domínio, dados, integrações, multi-fluxo) | sem cap explícito; gates apertados |
| `light` (--mode=light) | Feature pequena/média com risco controlado | 1 user story, max 5 acceptance criteria, 1 vertical slice (per consolidated §10.1) |

## Sequência (13 passos compartilhados)

| # | Step | Owner | Gate? |
|---|---|---|---|
| 1 | Intent + Value + Scope | inline | não |
| 2 | Terrain Recon | inline | não |
| 3 | User Flow + UX | `feature-vertical-slice-planner` | **sim (acceptance-matrix)** |
| 4 | Domain Rules | inline | não |
| 5 | Source of Truth | inline | não |
| 6 | Data Model + Persistence | inline | não |
| 7 | Architecture Design Options | `feature-vertical-slice-planner` | **sim (architecture-choice)** |
| 8 | Risk Controls | inline | não |
| 9 | Implementation Plan | `feature-vertical-slice-planner` (skip se Phase 1.5) | **sim (plan-approval)** |
| 10 | TDD Pre-Impl (RED) | `pre-tester` (parametrized) | **sim (tdd-tests-approval)** |
| 11 | Execution Minimal Diff (GREEN) | `feature-implementer` | não (executor-controller cobre) |
| 12 | Testing Validation | `feature-integration-validator` | não |
| 13 | Release + Observability | inline | não |

## Sentinel checkpoints

`pre_3`, `pre_10`, `pre_13` — controller seta `expected_next` no `sentinel-state.json` antes de cada.

## Hooks (ADVISORY)

`sequence_lock`, `gates_at`, `sentinel_checkpoints` no SKILL.md frontmatter são declarativos. Hooks (sentinel-hook, dispatch-guard, edit-guard, force-pipeline-agents) cobrem session-level mas NÃO parseiam SKILL.md frontmatter. Ver consolidated §17.4 #8.

## Pre-check

Pré-check Pulsar (`HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md`) **NÃO** virou step da skill — Phase 0 do pipeline (`information-gate` + `design-interrogator`) absorve.
````

- [ ] **Step 3: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add references/pipelines/feature.md
git commit -m "feat(refs): references/pipelines/feature.md (single-skill-with-mode-flag pattern)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase D: Plugin integration (Tasks 18-21)

### Task 18: Deprecate references/pipelines/implement-{heavy,light}.md (redirect)

**Files:**
- Modify: `references/pipelines/implement-heavy.md`
- Modify: `references/pipelines/implement-light.md`

- [ ] **Step 1: Read current implement-heavy.md**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
head -10 references/pipelines/implement-heavy.md
```

- [ ] **Step 2: Add deprecation header to both**

Use Edit tool. For `implement-heavy.md`, prepend at the very top (before existing first line):

```markdown
> **DEPRECATED (as of v4.6.0):** This file is preserved as a redirect. New canonical reference: `references/pipelines/feature.md` (single-skill pattern with mode flag). Slice 3b ([2026-05-03]) replaced separate heavy/light references with unified `feature` skill. Will be removed in v5.0 final.

---

```

Same for `implement-light.md`.

- [ ] **Step 3: Verify both files have deprecation header**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -c "DEPRECATED (as of v4.6.0)" references/pipelines/implement-heavy.md references/pipelines/implement-light.md
```

Expected: 2 (one per file).

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add references/pipelines/implement-heavy.md references/pipelines/implement-light.md
git commit -m "docs(refs): deprecate implement-{heavy,light}.md as redirects to feature.md (Slice 3b)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: commands/pipeline.md update

**Files:**
- Modify: `commands/pipeline.md`

- [ ] **Step 1: Locate STEP 1 modes table**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "force pipeline_variant\|pipeline_variant=light" commands/pipeline.md | head -5
```

- [ ] **Step 2: Add `--variant=feature` + `--mode=light|heavy` rows to modes table**

Use Edit tool. Find the row for `--heavy` (existing). Add immediately after it:

```markdown
| `/pipeline --variant=feature [task]` | FULL + force pipeline_variant=feature | Force feature variant (Slice 3b+, single skill with mode flag) |
| `/pipeline --variant=feature --mode=light [task]` | FULL + force feature + mode=light | Force feature variant in Light mode (1 user story, max 5 AC) |
| `/pipeline --variant=feature --mode=heavy [task]` | FULL + force feature + mode=heavy | Force feature variant in Heavy mode (full 13-step rigor) |
```

- [ ] **Step 3: Verify rows added**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -c "variant=feature" commands/pipeline.md
```

Expected: ≥ 3 (3 new rows + any other refs).

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add commands/pipeline.md
git commit -m "feat(commands): add --variant=feature + --mode=light|heavy to pipeline.md modes (Slice 3b)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: agents/core/task-orchestrator.md update

**Files:**
- Modify: `agents/core/task-orchestrator.md`

- [ ] **Step 1: Locate force_variant section**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "force_variant\|PRE_CLASSIFIED_TYPE" agents/core/task-orchestrator.md | head -10
```

- [ ] **Step 2: Extend force_variant whitelist**

Use Edit tool. Find the section listing valid `force_variant` values (likely a list with `bugfix-light`, `bugfix-heavy`, `audit-light`, `audit-heavy`). Add `feature` to the whitelist (single, not feature-light/feature-heavy — mode flag handles).

Example (adapt to actual content found in step 1):

```markdown
**Valid `force_variant` values (post Slice 3b v4.6.0):**
- `bugfix-light`, `bugfix-heavy` (Slice 1.5)
- `audit-light`, `audit-heavy` (Slice 3a)
- `feature` (Slice 3b — mode flag separate via `force_mode={light,heavy}`)
```

Add `force_mode` parameter handling: when `force_variant=feature`, accept companion `force_mode` (default `heavy`).

- [ ] **Step 3: Verify**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -c "force_variant.*feature\|force_mode" agents/core/task-orchestrator.md
```

Expected: ≥ 2.

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add agents/core/task-orchestrator.md
git commit -m "feat(task-orchestrator): accept force_variant=feature + force_mode={light,heavy}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Plugin metadata bump (plugin.json + marketplace.json + hooks/hooks.json)

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json` (if exists)
- Modify: `hooks/hooks.json` (SessionStart prompt)

- [ ] **Step 1: Bump plugin.json**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "\"version\"" .claude-plugin/plugin.json
```

Use Edit tool to change `"version": "4.5.0"` to `"version": "4.6.0"`. Also extend the `description` field to mention Slice 3b feature import (analógico a como v4.5.0 description menciona Slice 3a).

Example new description fragment to add at start:

```
v4.6.0 (Slice 3b): imports prescriptive 13-step Pulsar Implement_new_feature workflow as single skill `feature` with mode flag (heavy|light) — pattern novo vs Slice 1.5/3a. Reuses 5 existing agents (feature-vertical-slice-planner, feature-implementer, feature-integration-validator, pre-tester, quality-gate-router). 4 AskUserQuestion gates (steps 3, 7, 9, 10). Hooks ADVISORY model documented. v4.5.0 (Slice 3a): audit import. ...
```

- [ ] **Step 2: Bump marketplace.json (if exists)**

```bash
ls "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/.claude-plugin/marketplace.json" 2>&1
```

If exists, update version field same way.

- [ ] **Step 3: Bump hooks/hooks.json SessionStart prompt**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "v4\.5\.0 loaded\|Slice 3a" hooks/hooks.json
```

Use Edit tool. Find `"prompt": "Pipeline Orchestrator v4.5.0 loaded. ..."`. Update to start with `"Pipeline Orchestrator v4.6.0 loaded."` and extend entry list to include `/pipeline-orchestrator:feature`.

Example replacement (adapt based on current text):

```json
"prompt": "Pipeline Orchestrator v4.6.0 loaded. Entry points: /pipeline-orchestrator:pipeline (full classifier, supports --variant + --mode flags), /pipeline-orchestrator:bugfix [task] (auto-classify or --light/--heavy), /pipeline-orchestrator:audit [scope] (auto-classify or --light/--heavy), /pipeline-orchestrator:feature [task] (Slice 3b — single skill with --mode=light|heavy flag controlling verbosity). All entry-points manual-only via disable-model-invocation:true. v4.6.0 (Slice 3b): feature import — single skill with mode flag pattern. v4.5.0 (Slice 3a): audit import. v4.4.x: bugfix import + exec-window wrapper. v4.3.x: skill migration + SEC patches."
```

- [ ] **Step 4: Verify all 3 bumps**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -c "4.6.0" .claude-plugin/plugin.json hooks/hooks.json
```

Expected: ≥ 2 (plugin.json + hooks.json; marketplace.json optional).

- [ ] **Step 5: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add .claude-plugin/plugin.json hooks/hooks.json
# Add marketplace.json if modified:
git add .claude-plugin/marketplace.json 2>/dev/null
git commit -m "chore(release): bump 4.5.0 → 4.6.0 (Slice 3b feature skill import)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E: Spec sync + CHANGELOG (Tasks 22-24)

### Task 22: CLAUDE.md + AGENTS.md update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Bump CLAUDE.md version**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "Atualmente: \*\*4\.5\.0\*\*\|v1\.2.*2026-05-03" CLAUDE.md
```

Use Edit tool. Update the canonical version row to `Atualmente: **4.6.0**`. Extend lineage to include `→ v4.6.0 (Slice 3b — Pulsar feature workflow import, single-skill-with-mode-flag pattern)`.

Add v1.3 entry to "Versão deste arquivo" table:

```markdown
| v1.3 | 2026-05-03 | Bump versão canônica 4.5.0 → 4.6.0 (Slice 3b — feature skill com mode flag). |
```

- [ ] **Step 2: Update AGENTS.md roster**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "skills/audit\|skills/bugfix" AGENTS.md
```

Use Edit tool. Add row for `skills/feature/` to the roster table (analógico a entries existentes para audit-{light,heavy} e bugfix-{light,heavy}).

- [ ] **Step 3: Verify both updated**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -c "4.6.0" CLAUDE.md
grep -c "skills/feature" AGENTS.md
```

Expected: ≥ 1 each.

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add CLAUDE.md AGENTS.md
git commit -m "docs(claude-md, agents-md): bump 4.6.0 + add skills/feature/ roster entry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: CHANGELOG.md entry v4.6.0

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Read top of CHANGELOG**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
head -20 CHANGELOG.md
```

- [ ] **Step 2: Add entry above [4.5.0]**

Use Edit tool. Insert new section between `## [4.5.0] - 2026-05-02` and the changelog header:

````markdown
## [4.6.0] - 2026-05-03

Minor release implementing **Slice 3b**: imports the prescriptive 13-step Pulsar `Implement_new_feature` workflow (`D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\`) as a Claude Code skill. **Pattern novo:** single skill `feature` com mode flag (`heavy|light`) controlando verbosidade de prompt — primeira vez que um port usa essa estrutura (vs 2 skills separadas em Slice 1.5/3a). Design: `designs/pipeline-orchestrator-v5-consolidated.md` §22+ + spec mapping `docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md`.

### Added

- `skills/feature/SKILL.md` — manifest com mode flag (heavy default, --mode=light override), sequence_lock, gates_at: [3, 7, 9, 10], sentinel_checkpoints: [pre_3, pre_10, pre_13]
- `skills/feature/steps/01..13-*.md` — 13 step files mode-aware (Heavy + Light prompts em seções separadas)
- `skills/feature/tests/tests-feature.md` — diretrizes user story (absorve TESTS_USER_STORY_{HEAVY,LIGHT}.md do Pulsar)
- `references/pipelines/feature.md` — reference single (substitui implement-*)
- 4 AskUserQuestion gates obrigatórios (steps 3 acceptance-matrix, 7 architecture-choice, 9 plan-approval com conditional skip, 10 tdd-tests-approval)

### Changed

- `agents/core/task-orchestrator.md` — aceita `force_variant=feature` + `force_mode={light,heavy}`
- `commands/pipeline.md` — adicionado `--variant=feature` + `--mode=light|heavy` na tabela de modes
- `references/pipelines/implement-{heavy,light}.md` — DEPRECATED como redirects para `feature.md`
- `.claude-plugin/plugin.json` — version 4.5.0 → 4.6.0
- `hooks/hooks.json` — SessionStart prompt menciona `/pipeline-orchestrator:feature`
- `CLAUDE.md` + `AGENTS.md` — versão + roster entry

### Reused (no new agents)

- `feature-vertical-slice-planner` (steps 3, 7, 9 — re-spawned 3x com TASK_CONTEXT diferente)
- `feature-implementer` (step 11)
- `feature-integration-validator` (step 12)
- `pre-tester` (step 10 — parametrized via `expected_inputs.pre_tester_artifacts`)
- `quality-gate-router` (step 10 — Phase 2 do pipeline)

### Notes

- **Hooks são ADVISORY:** campos do SKILL.md frontmatter (`sequence_lock`, `gates_at`, etc) são declarativos; controller respeita o contrato mas hooks NÃO parseiam SKILL.md (ver consolidated §17.4 #8)
- **Step 9 conditional skip:** se Phase 1.5 plan-architect rodou (filesystem check em `PIPELINE_DOC_PATH/05-plan-architect.md`), skill pula step 9 e usa output do plan-architect
- **TDD step 10 parametrizado:** Pulsar source usava paths Firebase-específicos (`functions/src/__tests__/`); skill recebe paths via `expected_inputs.pre_tester_artifacts` do agente `pre-tester`
- **Step 11 SEM gate skill-level:** executor-controller (Phase 2) já tem adversarial gate antes de Edits; double gate seria DRY violation
- **Pre-check absorvido por Phase 0:** `HEAVY_A_CHECK_ANTES_DE_NOVA_FEATURE.md` do Pulsar não vira step da skill — `information-gate` + `design-interrogator` da Phase 0 cobrem
- **Userstory + ux ports:** ainda pendentes (futuros v4.7.0 / v4.8.0 — sub-slices Slice 3c/3d)
- **v5.0 final:** continua bloqueado por Slice 4 verde (per consolidated §12.8.3)
````

- [ ] **Step 3: Verify entry added**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -c "## \[4.6.0\] - 2026-05-03" CHANGELOG.md
```

Expected: 1.

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add CHANGELOG.md
git commit -m "docs(changelog): v4.6.0 entry — Slice 3b feature skill import

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: consolidated.md updates (status table + new §23 Slice 3b delivered)

**Files:**
- Modify: `designs/pipeline-orchestrator-v5-consolidated.md`

- [ ] **Step 1: Update §12.2 status table — add Slice 3b row**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "^| 3a \||^Slice 3a" designs/pipeline-orchestrator-v5-consolidated.md | head -3
```

Use Edit tool. Find the row for Slice 3a (`| 3a | 🟢 | v4.5.0 | ...`). Add row after it:

```markdown
| 3b | 🟢 | v4.6.0 | `/feature` thin wrapper + `feature` skill (single, com mode flag) + 13 steps mode-aware. Pattern novo vs Slice 1.5/3a (1 skill em vez de 2). Reusa 5 agentes existentes; 0 novos. Hooks documentados como ADVISORY (§17.4 #8). |
```

Also update the sequence diagram in §12.2 (around line 502-511) to add `Slice 3b` row between `Slice 3a` and `Slice 3`:

```
Slice 3b    Pulsar feature workflow import (§23)            🟢 ENTREGUE (v4.6.0)
```

- [ ] **Step 2: Add new §23 Slice 3b documentation**

Find current end of §22 (audit). Insert new §23 between §22 and the existing §23 (if any) or before final `## Status final`.

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "^## 22\.\|^## 23\.\|^## Status final" designs/pipeline-orchestrator-v5-consolidated.md
```

Use Edit tool to insert:

````markdown
## 23. Slice 3b — Pulsar feature workflow import (NOVO 2026-05-03)

### 23.1 Origem e justificativa

Igual a Slice 1.5 (bugfix) e Slice 3a (audit) — port do workflow Pulsar (`D:\Projeto Pulsar\.claude\commands\Prompts\Implement_new_feature\`) com 13 steps Heavy + 13 Light. **Único entre os 3 ports: usa pattern single-skill-com-mode-flag** em vez de 2 skills separadas. Origem da decisão: bugfix-heavy adversarial review 2026-05-03 (3 reviewers paralelos) cravou que Pulsar Light é estruturalmente igual a Heavy (13=13 passos), só diferindo em verbosidade de prompt. Spec mapping: `docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md` (v2 pós-bugfix com 0 decisões pendentes).

### 23.2 Decisão de design

- **3 skills criados** (vs 5 dos ports anteriores): `skills/feature/SKILL.md` (manifest single) + 13 step files mode-aware + 1 tests file = 16 arquivos novos.
- **Mode flag:** SKILL.md frontmatter declara `mode: heavy` (default). User override via `--mode=light` no argument. Cada step.md tem `## Heavy mode prompt` e `## Light mode prompt` sections; controller seleciona baseado em mode flag.
- **5 agentes existentes reusados, 0 novos.**
- **4 gates** (vs 5 da v1 do mapping): steps 3 (acceptance-matrix), 7 (architecture-choice), 9 (plan-approval; SKIP se Phase 1.5 plan-architect rodou), 10 (tdd-tests-approval). Step 11 sem gate skill-level (executor-controller cobre).
- **3 sentinel checkpoints:** pre_3, pre_10, pre_13.
- **Hooks ADVISORY:** ver §17.4 #8.
- **TDD step 10 parametrizado** via `expected_inputs.pre_tester_artifacts` (não shell discovery hardcoded como Pulsar).
- **Pré-check** (`HEAVY_A_*` do Pulsar) **absorvido por Phase 0** (information-gate + design-interrogator), não vira step da skill.

### 23.3 Forma do pipeline — 13 passos canônicos

Per spec mapping §3 — Heavy = Light em estrutura (mode flag controla verbosidade):

| # | Step | Output Heavy | Output Light |
|---|---|---|---|
| 1 | Intent + Value + Scope | `IntentDoc` completo | `IntentDoc` mínimo |
| 2 | Terrain Recon | mapa detalhado | mapa rápido |
| 3 | User Flow + UX **[GATE]** | matriz cenários completa | top-3 cenários |
| 4 | Domain Rules | regras + property tests | regras + 1 unit test |
| 5 | Source of Truth | SSOT mapping completo | SSOT inline |
| 6 | Data Model + Persistence | schema + migration tests | schema + integration test |
| 7 | Architecture Design Options **[GATE]** | 3 opções + trade-offs | 2 opções |
| 8 | Risk Controls | risk register completo | top risks |
| 9 | Implementation Plan **[GATE; SKIP se Phase 1.5]** | plan completo | plan mínimo |
| 10 | TDD Pre-Impl (RED) **[GATE]** | full coverage | 1 main + 1 regression + 1 edge |
| 11 | Execution Minimal Diff (GREEN) | código completo | código mínimo |
| 12 | Testing Validation | suite completa | unit + integration |
| 13 | Release + Observability | release notes + monitoring | release notes mínimo |

### 23.4 Regras de execução

Mesmas 8 regras herdadas de Slice 1.5 (§21.3) — sequence_lock, execution_mode, agent_type whitelist, output schema, AskUserQuestion gates, STOP RULE, audit log, sentinel checkpoints. Hooks são ADVISORY (não enforcement) — controller respeita o contrato.

### 23.5 Migration plan

Target: **v4.6.0** (minor release). Lineage: v4.5.0 → v4.6.0.

1. Files criados: `skills/feature/SKILL.md`, 13 `steps/*.md`, `tests/tests-feature.md`, `references/pipelines/feature.md`.
2. Files modificados: `commands/pipeline.md` (--variant=feature + --mode flag), `agents/core/task-orchestrator.md` (force_variant), `references/pipelines/implement-{heavy,light}.md` (DEPRECATED redirects), `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`, `plugin.json`, `marketplace.json`, `hooks/hooks.json`.
3. Hooks: NENHUM modificado (ADVISORY model — ver §17.4 #8).
4. Agents: NENHUM novo criado.

### 23.6 Backward compatibility

- ✅ `/pipeline-orchestrator:pipeline [task]` continua funcionando idêntico (auto-classify roteia para variant correto).
- ✅ `/pipeline-orchestrator:feature [task]` é novo entry-point manual (Slice 3b).
- ✅ `references/pipelines/implement-{heavy,light}.md` continuam acessíveis com deprecation header (redirect).
- ✅ Slice 1.5 (bugfix) e Slice 3a (audit) sem mudança.

### 23.7 Critérios de done (DoD do Slice 3b)

- [ ] `skills/feature/SKILL.md` criado com mode flag handling.
- [ ] `skills/feature/steps/01..13-*.md` completos (13 step files mode-aware).
- [ ] `skills/feature/tests/tests-feature.md` criado.
- [ ] `references/pipelines/feature.md` criado; `implement-{heavy,light}.md` deprecated.
- [ ] Plugin metadata bumpado (plugin.json + marketplace.json + hooks.json).
- [ ] CLAUDE.md + AGENTS.md + CHANGELOG.md atualizados.
- [ ] §12.2 status table marca Slice 3b 🟢.
- [ ] Smoke test: invocar `/pipeline-orchestrator:feature test-fixture` confirma execução determinística.
- [ ] Adversarial review round 2 (ce-coherence-reviewer) confirma fixes não introduziram regressão.

### 23.8 Próximos passos

1. **Pós-Slice 3b:** Slice 2 (TRACE.md) ou Slice 3c/3d (`/userstory`, `/ux` — provavelmente também single-skill-com-mode-flag se Pulsar source seguir mesmo pattern).
2. **Backport question:** considerar refactor de `audit-{light,heavy}` para single-skill-com-mode-flag (audit também é Light=Heavy=9). Slice 3e potencial.
3. **v5.0 final:** continua bloqueado por Slice 4 verde (§12.8.3).

---

````

- [ ] **Step 3: Verify**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -c "^## 23\. Slice 3b" designs/pipeline-orchestrator-v5-consolidated.md
grep -c "^| 3b |" designs/pipeline-orchestrator-v5-consolidated.md
```

Expected: 1 + 1.

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add designs/pipeline-orchestrator-v5-consolidated.md
git commit -m "docs(spec): add §23 Slice 3b documentation + §12.2 status row + sequence diagram

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase F: Smoke + Adversarial review (Tasks 25)

### Task 25: Smoke test + adversarial review round + final commit/push

**Files:**
- No edits in smoke phase (verification only).
- Possible edits if adversarial finds issues (max 3 fix-loop attempts).

- [ ] **Step 1: Verify file count + structure**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
echo "skills/feature/ contents:"
find skills/feature -type f | sort
echo "Expected: 1 SKILL.md + 13 step files + 1 tests file = 15"
find skills/feature -type f | wc -l
```

Expected: 15 files (1 SKILL.md + 13 in steps/ + 1 in tests/).

- [ ] **Step 2: Verify all step files have frontmatter + 3 sections**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
for f in skills/feature/steps/*.md; do
  fm_count=$(head -1 "$f" | grep -c "^---")
  heavy_count=$(grep -c "## Heavy mode prompt" "$f")
  light_count=$(grep -c "## Light mode prompt" "$f")
  expected_count=$(grep -c "## Expected outputs" "$f")
  echo "$(basename $f): fm=$fm_count heavy=$heavy_count light=$light_count expected=$expected_count"
done
```

Expected: each row shows `fm=1 heavy=1 light=1 expected=1`.

- [ ] **Step 3: Verify gate documentation in 4 gate steps**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
for n in 03 07 09 10; do
  gate_count=$(grep -c "## GATE:" skills/feature/steps/${n}-*.md)
  echo "step ${n}: gate sections=$gate_count"
done
```

Expected: each shows `gate sections=1`.

- [ ] **Step 4: Spawn adversarial review (round 2 pattern from previous bugfix flow)**

Use Agent tool with `compound-engineering:document-review:ce-coherence-reviewer`:

```
Prompt:
You are reviewing a freshly-implemented Claude Code skill (Slice 3b feature port from Pulsar). Verify the implementation matches the spec at docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md (v2 commit 670a97d).

Files to review:
- skills/feature/SKILL.md
- skills/feature/steps/{01-13}-*.md (13 step files)
- skills/feature/tests/tests-feature.md
- references/pipelines/feature.md

Spec compliance check:
- 1 single skill (not 2 separate)? ✓ skills/feature/ exists, no skills/feature-{light,heavy}/
- 13 step files in steps/? ✓ count 13
- Mode flag in SKILL.md frontmatter? ✓ `mode: heavy`
- Each step has ## Heavy mode prompt + ## Light mode prompt + ## Expected outputs sections?
- 4 gates at steps 3, 7, 9, 10 (each with ## GATE: section in body)?
- Step 11 has explicit "no skill-level gate" note?
- Step 9 has conditional skip logic (Phase 1.5 detection)?
- Step 10 uses parametrized expected_inputs.pre_tester_artifacts (NOT hardcoded shell discovery)?
- Hooks documented as ADVISORY?

Output: SHIP / SHIP WITH FIXES / NEEDS REWORK + findings with file:line. Cap 500 words.
```

- [ ] **Step 5: Apply fixes if reviewer flags issues (max 3 attempts)**

If SHIP → proceed.
If SHIP WITH FIXES → apply fixes inline, commit each fix separately, then proceed.
If NEEDS REWORK after attempt 3 → STOP and escalate to user.

- [ ] **Step 6: Final smoke — manual skill discovery check**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
# Verify SKILL.md is discoverable by plugin loader (frontmatter parses)
node -e "
const fs = require('fs');
const c = fs.readFileSync('skills/feature/SKILL.md', 'utf8');
const fmMatch = c.match(/^---\n([\s\S]*?)\n---/);
console.log('SKILL.md discoverable:', fmMatch ? 'YES' : 'NO');
console.log('Mode default:', c.match(/^mode:\s*(\w+)/m)?.[1] || 'MISSING');
console.log('Sequence:', c.match(/^sequence:\s*\[([^\]]+)\]/m)?.[1] || 'MISSING');
"
```

Expected: `discoverable: YES`, `Mode default: heavy`, `Sequence: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13`.

- [ ] **Step 7: Final push**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git log --oneline -10
git push origin main
```

Expected: All Slice 3b commits + last commit hash matches `git log` HEAD.

- [ ] **Step 8: Print summary**

```
=== Slice 3b Implementation Complete ===
Spec: docs/superpowers/specs/2026-05-03-feature-pulsar-import-mapping.md (v2, commit 670a97d)

Files created (16):
  + skills/feature/SKILL.md
  + skills/feature/steps/{01..13}-*.md (13 files)
  + skills/feature/tests/tests-feature.md
  + references/pipelines/feature.md

Files modified (~10):
  ~ commands/pipeline.md (--variant=feature + --mode flag)
  ~ agents/core/task-orchestrator.md (force_variant accept)
  ~ references/pipelines/implement-{heavy,light}.md (deprecated)
  ~ .claude-plugin/plugin.json (4.5.0 → 4.6.0)
  ~ .claude-plugin/marketplace.json (if exists)
  ~ hooks/hooks.json (SessionStart prompt)
  ~ CLAUDE.md (+v1.3 entry)
  ~ AGENTS.md (skills/feature/ roster row)
  ~ CHANGELOG.md ([4.6.0] entry)
  ~ designs/pipeline-orchestrator-v5-consolidated.md (§23 + §12.2 row)

Pattern: single skill com mode flag (NOVO vs Slice 1.5/3a)
Reused agents: 5 (no new agents created)
Hooks: ADVISORY (no hook changes)
Gates: 4 (steps 3, 7, 9, 10)

Release: v4.6.0
v5.0 final: still blocked by Slice 4 green
Out-of-scope: userstory + ux ports (Slice 3c/3d future)
```

---

## Definition of Done

- [ ] All 25 tasks complete with checkboxes filled.
- [ ] At least 16 commits landed (1 per Phase A-B-C-D-E task + 1 push at end).
- [ ] `find skills/feature -type f | wc -l` returns 15.
- [ ] `git log --oneline | grep -c "Slice 3b\|feature-skill\|4.6.0"` ≥ 10.
- [ ] Adversarial review round 2 verdict: SHIP or SHIP WITH FIXES (FIXES applied).
- [ ] `git push origin main` succeeded.
- [ ] Plugin.json shows 4.6.0.
- [ ] Smoke test confirms SKILL.md discoverable.
- [ ] Iron Law respected: no production code in consumer projects modified; only plugin files.

# Hotfix Fixture + Capture Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 5º fixture (`hotfix-fixture`) e seção "Protocolo de captura" no README do compat suite, fechando 90% estrutural de Slice 4 sem capturar baselines reais (adiado).

**Architecture:** Extensão aditiva do scaffolding existente em `tests/compat/`. Sem novo código — apenas dados (fixture) + docs (README section + spec status updates). Smoke test do runner valida estrutura.

**Tech Stack:** Markdown (input.md, README, spec), YAML (expected.yaml), Node.js (runner.cjs já existente — não modificado).

**Spec:** `docs/superpowers/specs/2026-05-03-hotfix-fixture-and-capture-protocol-design.md` (commit `55d4d42`).

**Estimated time:** 30-45min total para 8 tasks.

---

## Pre-Execution Notes

**Working directory:** `D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/`

**Pipeline session lock:** Edit-guard pode bloquear edits em arquivos fora de `.pipeline/**`. Se vir `PIPELINE_LOCK_ACTIVE` error, abrir exec-window primeiro:

```bash
# Verificar se há lock ativo:
ls "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/.pipeline/sessions/"

# Se houver <session-id>.lock, abrir exec-window:
node "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/scripts/exec-window/open.cjs" \
  "<session-id>" "pipeline-controller" "hotfix-fixture-and-protocol" 30

# Trabalhar... depois fechar:
node "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/scripts/exec-window/close.cjs" "<session-id>"
```

Se não houver lock, edit-guard não dispara — edits diretos funcionam.

**Reference fixtures:** os 4 fixtures existentes em `tests/compat/v4-baseline/scenarios/{bugfix,feature,audit,ux}-fixture/` servem como template estrutural. Manter mesmo formato (input.md + expected.yaml com mesmos campos top-level).

---

## Task 1: Create hotfix-fixture/input.md

**Files:**
- Create: `tests/compat/v4-baseline/scenarios/hotfix-fixture/input.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/tests/compat/v4-baseline/scenarios/hotfix-fixture"
```

Expected: directory created (no output on success).

- [ ] **Step 2: Write input.md content**

Create file `tests/compat/v4-baseline/scenarios/hotfix-fixture/input.md` with content:

````markdown
# hotfix-fixture — Compat Regression Scenario

## Task description (fed to /pipeline)

URGENTE — incidente de produção em curso. Deploy de 2026-05-03 14:32 UTC quebrou autenticação para todos os usuários ativos. Sintoma: cookies de sessão válidos rejeitados como expirados; refresh redireciona para `/login` infinitamente. Rastreado a `auth/session.js:42` — comparação de timezone foi alterada de UTC para local na PR #4287. Mercados abrem em 90 minutos. Fix: reverter linha 42 para `Date.UTC(...)` + commit + deploy. Sem tempo para slice plan completo.

## Why this scenario exists

Cobre o fluxo HOTFIX (emergency bypass mode) descrito em `commands/pipeline.md`:

- **type=Bug Fix forçado, complexity=COMPLEXA forçado, severity=Critical forçado** (per HOTFIX Mode classification)
- **mode=hotfix** (campo extra no contrato observável)
- **Sinais que classifier deve reconhecer SEM flag manual** — palavra "URGENTE", indicador temporal absoluto ("90 minutos para market open"), impacto absoluto ("todos os usuários ativos"), localização cirúrgica ("`auth/session.js:42`"), justificativa de bypass ("sem tempo para slice plan completo")
- **domain=auth** (força ADVERSARIAL_GATE_MANDATORY mesmo em HOTFIX, mas com 2 checklists em vez de 7)
- **TDD reduzido** — 1 regression test, não suite completa
- **HOTFIX Logging obrigatório** — artifact `HOTFIX_LOG.md` com quem, por quê, quais checklists pulados, timestamp
- **Verdict GO esperado** (escopo cirúrgico, fix claro)

Se o pipeline mudar de comportamento neste cenário, HOTFIX mode fica vulnerável: ou (a) acende em casos não-emergência (false positive) ou (b) não acende em emergência real (false negative).

## Como invocar (para captura de baseline)

```bash
# Na CLI claude — método 1 (deixar classifier detectar emergência sozinho):
/pipeline-orchestrator:pipeline URGENTE — incidente de produção em curso. Deploy de 2026-05-03 14:32 UTC quebrou autenticação para todos os usuários ativos. Sintoma: cookies de sessão válidos rejeitados como expirados. Rastreado a auth/session.js:42 — timezone alterada de UTC para local na PR #4287. Mercados abrem em 90 minutos.

# Método 2 (forçar HOTFIX explicitamente via flag):
/pipeline-orchestrator:pipeline --hotfix Login quebrado pós-deploy: timezone offset em auth/session.js:42.
```

Capturar baseline com **método 1** (sem flag manual) — o ponto do fixture é validar que o classifier reconhece urgência por contexto, não por flag.

## Expected baseline behavior

Ver `expected.yaml` na mesma pasta.

## Replay

Modo `--mock` requer `mock-output.json`. Sem ele: SKIPPED+exit 1. Captura via protocolo em `tests/compat/README.md` seção "Protocolo de captura de baseline real".

## Diferenças críticas vs bugfix-fixture (que NÃO podem regredir)

1. **Classification mode=hotfix** está presente (campo novo no contrato).
2. **HOTFIX_LOG.md** está em `artifacts_produced` (auditoria obrigatória per spec).
3. **adversarial-architecture-critic e adversarial-quality-reviewer ausentes** em `agents_invoked` — só `adversarial-security-scanner` invocado (HOTFIX = 2 checklists: auth + injection).
4. **Suite de regression ausente** em sanity (HOTFIX = build+tests sem regression).
5. **FINAL_ADVERSARIAL_GATE.decision = SKIPPED** (per spec "HOTFIX | typically declined under emergency time pressure").

Se runner observar regressão em qualquer desses 5 pontos, HOTFIX mode quebrou.
````

- [ ] **Step 3: Verify file exists and has expected content**

```bash
ls "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/tests/compat/v4-baseline/scenarios/hotfix-fixture/input.md" && \
  grep -c "URGENTE\|hotfix\|HOTFIX_LOG" "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/tests/compat/v4-baseline/scenarios/hotfix-fixture/input.md"
```

Expected: file path printed; count ≥ 5.

- [ ] **Step 4: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add tests/compat/v4-baseline/scenarios/hotfix-fixture/input.md
git commit -m "test(compat): add hotfix-fixture input.md (realistic prod incident scenario)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 1 file changed, ~50 insertions.

---

## Task 2: Create hotfix-fixture/expected.yaml

**Files:**
- Create: `tests/compat/v4-baseline/scenarios/hotfix-fixture/expected.yaml`

- [ ] **Step 1: Write expected.yaml content**

Create file `tests/compat/v4-baseline/scenarios/hotfix-fixture/expected.yaml` with content:

```yaml
# Expected observable contract for hotfix-fixture
# Inferred from commands/pipeline.md "HOTFIX Mode (Emergency Bypass)" section
# + designs/pipeline-orchestrator-v5-consolidated.md §10.5 + §22.4
# Status: TEMPLATE — replace with real values after dogfooding /pipeline

baseline_version: "4.5.0"
baseline_captured_at: "TODO_REPLACE_AFTER_DOGFOODING"
baseline_method: "TEMPLATE — inferred from commands/pipeline.md HOTFIX Mode, not yet validated against real run"

classification:
  type: bugfix             # forced by HOTFIX Mode per spec
  complexity: COMPLEXA     # forced by HOTFIX Mode
  pipeline_variant: bugfix-heavy   # COMPLEXA → heavy
  mode: hotfix             # NEW field — distinguishes from non-hotfix bugfix
  severity: Critical       # forced by HOTFIX Mode

gates_triggered:
  # Cronological order — HOTFIX is reduced (not skipped) validation per spec table
  - gate: INFO_GATE_BLOCKED
    hardness: HARD
    decision: PASS
    detail: "BLOCKER only mode — auth+data questions, skipped clarifications"
  - gate: HOTFIX_CONFIRMATION
    hardness: AUDIT
    decision: PASS
    detail: "1 emergency-confirmation question (not in formal Gate Registry; recorded for audit per HOTFIX Logging requirement)"
  - gate: TDD_APPROVAL
    hardness: HARD
    decision: PASS
    detail: "Minimal — 1 regression test"
  - gate: ADVERSARIAL_GATE_MANDATORY
    hardness: MANDATORY
    decision: PASS
    detail: "Auth domain — 2 checklists (auth + injection), not full 7"
  - gate: CHECKPOINT_FAIL
    hardness: HARD
    decision: PASS
    detail: "Build + tests passed (no regression suite per HOTFIX Mode)"
  - gate: FINAL_ADVERSARIAL_GATE
    hardness: SOFT
    decision: SKIPPED
    detail: "Per commands/pipeline.md: 'HOTFIX | typically declined under emergency time pressure'"
  - gate: CLOSEOUT_CONFIRM
    hardness: SOFT
    decision: PASS

agents_invoked:
  # HOTFIX reduces some agents but keeps the spine
  - task-orchestrator
  - sentinel                              # ORCHESTRATOR_VALIDATION
  - information-gate                      # BLOCKER-only mode
  - quality-gate-router                   # 1 minimal scenario
  - pre-tester                            # 1 regression test (RED)
  - executor-controller
  - executor-implementer-task             # 1 task batch (COMPLEXA + HOTFIX = batch=1)
  - executor-spec-reviewer
  - executor-quality-reviewer
  - checkpoint-validator
  - review-orchestrator                   # adversarial gate (mandatory for auth)
  - adversarial-batch                     # 2 checklists only (auth + injection)
  - adversarial-security-scanner          # explicitly invoked for HOTFIX security focus
  # NOTE: adversarial-architecture-critic ABSENT (not in 2-checklist scope)
  # NOTE: adversarial-quality-reviewer ABSENT (not in 2-checklist scope)
  - sentinel                              # phase_2_to_3 COHERENCE_VALIDATION
  - sanity-checker                        # build + tests (no regression per HOTFIX)
  - final-validator
  # NOTE: final-adversarial-orchestrator ABSENT (gate SKIPPED)

artifacts_produced:
  - PIPELINE_DOC_PATH/sentinel-state.json
  - PIPELINE_DOC_PATH/gate-decisions.jsonl
  - PIPELINE_DOC_PATH/HOTFIX_LOG.md       # MANDATORY per HOTFIX Logging spec
  - PIPELINE_DOC_PATH/01-task-orchestrator.md
  - PIPELINE_DOC_PATH/02-information-gate.md
  - PIPELINE_DOC_PATH/03-quality-gate-router.md
  - PIPELINE_DOC_PATH/04-pre-tester.md
  - PIPELINE_DOC_PATH/05-executor-controller.md
  - PIPELINE_DOC_PATH/06-review-orchestrator.md
  - PIPELINE_DOC_PATH/07-adversarial-security-scanner.md
  - PIPELINE_DOC_PATH/08-sanity-checker.md
  - PIPELINE_DOC_PATH/09-final-validator.md

verdict: GO

# HOTFIX-specific assertions (not in ignore — must always verify)
hotfix_assertions:
  - "HOTFIX_LOG.md present in artifacts (per spec mandatory logging)"
  - "classification.mode == 'hotfix' (distinguishes from non-hotfix bugfix)"
  - "gates_triggered count <= 7 (HOTFIX reduces validation; full COMPLEXA bugfix has more)"
  - "FINAL_ADVERSARIAL_GATE.decision == 'SKIPPED' (default behavior per spec table)"

ignore:
  - "exact wall-clock duration_seconds"
  - "exact agent prose / reasoning"
  - "exact PIPELINE_DOC_PATH timestamp"
  - "exact HOTFIX_LOG.md content (free-form per spec)"

must_match:
  - "classification.type, complexity, pipeline_variant, mode, severity"
  - "set of gates_triggered (presence, hardness, decision)"
  - "set of agents_invoked (presence — adversarial-architecture-critic AND adversarial-quality-reviewer MUST BE ABSENT)"
  - "set of artifacts_produced (basenames only — HOTFIX_LOG.md MUST be present)"
  - "verdict (GO / CONDITIONAL / NO-GO)"
  - "hotfix_assertions ALL true"
```

- [ ] **Step 2: Verify YAML syntax**

```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/tests/compat/v4-baseline/scenarios/hotfix-fixture/expected.yaml', 'utf8');
const requiredKeys = ['baseline_version:', 'baseline_method:', 'classification:', 'gates_triggered:', 'agents_invoked:', 'artifacts_produced:', 'verdict:', 'hotfix_assertions:', 'must_match:'];
const missing = requiredKeys.filter(k => !c.includes(k));
console.log('Size:', c.length, 'bytes');
console.log('Required keys:', missing.length === 0 ? 'ALL PRESENT' : 'MISSING: ' + missing.join(','));
console.log('TEMPLATE marker:', c.includes('TEMPLATE') ? 'YES (will be SKIPPED)' : 'NO (would run as real)');
"
```

Expected: `Required keys: ALL PRESENT`, `TEMPLATE marker: YES`.

- [ ] **Step 3: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add tests/compat/v4-baseline/scenarios/hotfix-fixture/expected.yaml
git commit -m "test(compat): add hotfix-fixture expected.yaml (TEMPLATE per spec inference)

Differences vs bugfix-fixture documented inline:
- classification.mode=hotfix (new field)
- HOTFIX_CONFIRMATION pseudo-gate
- 2 adversarial checklists vs 7
- adversarial-architecture-critic + adversarial-quality-reviewer ABSENT
- FINAL_ADVERSARIAL_GATE.decision=SKIPPED
- HOTFIX_LOG.md mandatory artifact
- hotfix_assertions section (not in ignore — must verify)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 1 file changed, ~95 insertions.

---

## Task 3: Smoke test runner detects 5 fixtures

**Files:**
- No edits — verification only.

- [ ] **Step 1: Run runner in mock mode**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
node tests/compat/runner.cjs --all --mock
echo "exit=$?"
```

Expected output:
```
=== Compat Regression Suite ===
Mode: mock | Scenarios: 5

  audit-fixture ... SKIPPED (0.0s) — expected.yaml is a TEMPLATE ...
  bugfix-fixture ... SKIPPED (0.0s) — expected.yaml is a TEMPLATE ...
  feature-fixture ... SKIPPED (0.0s) — expected.yaml is a TEMPLATE ...
  hotfix-fixture ... SKIPPED (0.0s) — expected.yaml is a TEMPLATE ...
  ux-fixture ... SKIPPED (0.0s) — expected.yaml is a TEMPLATE ...

=== Summary ===
  PASS:     0
  DIVERGED: 0
  ERROR:    0
  SKIPPED:  5
  Total:    0.0s (budget 300s)
  ...
  ⚠ NO REAL VALIDATION — only SKIPPED scenarios. ...
exit=1
```

If you see `Scenarios: 4` instead of `5`, the hotfix-fixture directory wasn't created in Task 1 — go back.

If you see ERROR, the YAML is malformed — re-check Task 2 step 1 content.

- [ ] **Step 2: Verify results.json contains all 5**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
node -e "
const r = JSON.parse(require('fs').readFileSync('tests/compat/results.json', 'utf8'));
console.log('Scenarios:', r.results.length);
console.log('Names:', r.results.map(s => s.name).sort().join(', '));
console.log('All SKIPPED:', r.results.every(s => s.status === 'SKIPPED'));
"
```

Expected:
```
Scenarios: 5
Names: audit-fixture, bugfix-fixture, feature-fixture, hotfix-fixture, ux-fixture
All SKIPPED: true
```

- [ ] **Step 3: No commit needed (no file changes — only verification)**

---

## Task 4: Add "Protocolo de captura" section to README

**Files:**
- Modify: `tests/compat/README.md` (insert section between "Modo mock vs real" and "Limitações conhecidas")

- [ ] **Step 1: Locate insertion point**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "^## " tests/compat/README.md
```

Expected output should include lines like:
```
N1: ## Modo mock vs real
N2: ## Limitações conhecidas (2026-05-03)
```

The new section will be inserted between N1's section content and N2.

- [ ] **Step 2: Insert new section via Edit**

Use Edit tool with `old_string` being the line immediately before "Limitações conhecidas":

```
old_string:
Slice 0 SPIKE-CI-HARNESS.md decidiu: começar com mock, migrar para real se viável.

## Limitações conhecidas (2026-05-03)

new_string:
Slice 0 SPIKE-CI-HARNESS.md decidiu: começar com mock, migrar para real se viável.

## Protocolo de captura de baseline real

Quando você (futuro você) tiver tempo de rodar dogfooding, use este protocolo. 5 passos por fixture, ~10min cada.

### Pré-condições

- Sessão CLI Claude limpa — sem session lock pipeline ativo (ver `.pipeline/sessions/`).
- Plugin instalado na versão que você quer baselinar (idealmente a versão alvo de release, ex: 4.5.0).

### Os 5 passos (por fixture)

1. **Abrir sessão CLI Claude limpa**
   - Fechar sessões pipeline anteriores. Verificar `ls .pipeline/sessions/` — se houver `.lock` files, deixar expirar (10min stale threshold) ou deletar manualmente após confirmar nenhum Claude está rodando.

2. **Invocar o pipeline**
   - Abrir o fixture: `cat tests/compat/v4-baseline/scenarios/<fixture-name>/input.md`
   - Copiar o parágrafo da seção "Task description (fed to /pipeline)"
   - Colar após `/pipeline-orchestrator:pipeline ` (ou usar comando específico, ex: `/pipeline-orchestrator:bugfix` para bugfix-fixture; `/pipeline-orchestrator:audit` para audit-fixture)
   - Aceitar gates conforme prompt — **não pular nada**, o objetivo é o caminho default

3. **Anotar saída observável**
   - Quando o `PIPELINE COMPLETE` block aparecer, copiar destes 4 campos:
     - `Classification:` (type + complexity + variant)
     - `Gates Triggered:` (lista com hardness + decision)
     - `Agents Invoked:` (lista ordenada)
     - `Files Modified` ou `Artifacts Produced:` (basenames)
     - `FINAL DECISION:` (verdict)

4. **Popular `expected.yaml`**
   - Substituir `baseline_method: "TEMPLATE — ..."` por:
     ```yaml
     baseline_method: "captured 2026-MM-DD via dogfooding session <session-id>"
     ```
   - Atualizar `baseline_captured_at` para timestamp ISO 8601 atual.
   - Substituir os 4 campos pelas observações reais.
   - Manter `ignore:` e `must_match:` como estão (são regras do runner, não baseline).

5. **Salvar `mock-output.json` ao lado**
   - Criar `tests/compat/v4-baseline/scenarios/<fixture-name>/mock-output.json`
   - Conteúdo: JSON com mesma estrutura observável (4 campos), serve para CI rodar `--mock` sem claude CLI.
   - Exemplo de estrutura mínima:
     ```json
     {
       "classification": { "type": "...", "complexity": "...", "pipeline_variant": "..." },
       "gates_triggered": [ { "gate": "...", "hardness": "...", "decision": "..." } ],
       "agents_invoked": [ "agent-1", "agent-2" ],
       "artifacts_produced": [ "file1.md", "file2.json" ],
       "verdict": "GO"
     }
     ```

### Validação após cada captura

```bash
node tests/compat/runner.cjs --scenario=<fixture-name> --mock
```

Expected: `PASS` (não SKIPPED, não DIVERGED). Se DIVERGED, `expected.yaml` e `mock-output.json` divergem entre si — corrigir antes de prosseguir.

### Validação final dos 5

```bash
time node tests/compat/runner.cjs --all --mock
```

Expected: `5 PASS, exit 0, total < 5min` (budget). Anotar o número real (`Total: Xs`) para popular Critério 4 em `designs/pipeline-orchestrator-v5-consolidated.md` §12.8.3.

### Notas operacionais

- **Captura é incremental** — 1 fixture por dia funciona; não exige sessão única.
- **Se um fixture diverge durante captura:** o pipeline mudou desde 2026-05-03 — investigar diff antes de aceitar como novo baseline. Pode ser regressão real ou mudança intencional.
- **Se algum fixture toma > 90s:** registrar em `expected.yaml` campo `observed_duration_seconds: <N>` — pode indicar regressão de performance separada do contrato observável.
- **Hotfix-fixture é especial** — tem campo `hotfix_assertions:` que NÃO está em `ignore`. O runner verifica essas asserções sempre. Se mudar comportamento HOTFIX (ex: scope expandir para 7 checklists), a asserção falha mesmo se o resto do contrato bate.

## Limitações conhecidas (2026-05-03)
```

- [ ] **Step 3: Verify section was inserted**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "^## Protocolo de captura\|^## Limitações conhecidas" tests/compat/README.md
```

Expected: 2 lines, "Protocolo" before "Limitações", consecutive sections.

- [ ] **Step 4: Verify section content**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -c "Os 5 passos\|Validação após\|hotfix_assertions" tests/compat/README.md
```

Expected: ≥ 3.

- [ ] **Step 5: Commit**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add tests/compat/README.md
git commit -m "docs(compat): add 'Protocolo de captura de baseline real' section

Per spec docs/superpowers/specs/2026-05-03-hotfix-fixture-and-capture-protocol-design.md
component 2. 5 steps per fixture for when real dogfooding happens, plus
validation commands and operational notes including hotfix-fixture special
case (hotfix_assertions field).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 1 file changed, ~80 insertions.

---

## Task 5: Update §12.8.3 in consolidated.md (Critério 3 → 5/5 estrutural)

**Files:**
- Modify: `designs/pipeline-orchestrator-v5-consolidated.md` (around line 1109, the "🟡 **Critério 3** ..." bullet)

- [ ] **Step 1: Locate current text**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "Critério 3 (5 cenários)" designs/pipeline-orchestrator-v5-consolidated.md
```

Expected: 1 match, around line 1109.

- [ ] **Step 2: Apply Edit**

Use Edit tool:

```
old_string: - 🟡 **Critério 3 (5 cenários):** **4/5 estruturalmente implementados** — `bugfix-fixture/`, `feature-fixture/`, `audit-fixture/`, `ux-fixture/` cada um com `input.md` (task description realista) + `expected.yaml` (contrato observável inferido do spec §7.2.X). Todos marcados `baseline_method: TEMPLATE` → runner detecta e SKIPa, retornando exit 1 com warning "NO REAL VALIDATION" — CI bloqueia merge corretamente. **1/5 ainda faltando** (`hotfix-fixture/` — variação de bugfix, decisão de quando criar). **0/5 com baseline real capturado** — todos precisam de dogfooding em sessão CLI claude para popular `mock-output.json` (modo mock) ou rodar live (modo real). Conversão TEMPLATE → REAL é mecânica: substitui `baseline_method` por `captured 2026-MM-DD via dogfooding`, salva snapshot em `mock-output.json`, re-roda o runner para confirmar PASS.

new_string: - 🟡 **Critério 3 (5 cenários):** **5/5 estruturalmente implementados** [VERIFICADO 2026-05-03] — `bugfix-fixture/`, `feature-fixture/`, `audit-fixture/`, `ux-fixture/`, `hotfix-fixture/` cada um com `input.md` (task description realista) + `expected.yaml` (contrato observável inferido do spec §7.2.X / `commands/pipeline.md` HOTFIX Mode). Todos marcados `baseline_method: TEMPLATE` → runner detecta e SKIPa, retornando exit 1 com warning "NO REAL VALIDATION" — CI bloqueia merge corretamente. **0/5 com baseline real capturado** — todos precisam de dogfooding em sessão CLI claude para popular `mock-output.json` (modo mock) ou rodar live (modo real). Protocolo executável de captura documentado em `tests/compat/README.md` seção "Protocolo de captura de baseline real" (5 passos por fixture, ~10min cada).
```

- [ ] **Step 3: Verify edit applied**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "5/5 estruturalmente implementados" designs/pipeline-orchestrator-v5-consolidated.md
```

Expected: 1 match.

- [ ] **Step 4: Commit deferred — combined with Tasks 6-7 below in single spec-update commit**

---

## Task 6: Update §12.2 status table (Slice 4 → 90% estrutural)

**Files:**
- Modify: `designs/pipeline-orchestrator-v5-consolidated.md` (status table row for Slice 4)

- [ ] **Step 1: Locate current row**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "Slice 4 entry table\|^| 4 | 🟡 (80%" designs/pipeline-orchestrator-v5-consolidated.md
```

Expected: 1 match for the `| 4 | 🟡 (80%` row.

- [ ] **Step 2: Apply Edit**

Use Edit tool:

```
old_string: | 4 | 🟡 (80% estrutural) | — | runner.cjs ✅ + workflow YAML ✅ + 4/5 fixtures estruturais (template) + 0/5 baselines reais + performance N/A. 2/4 critérios fechados; critério 3 80% estrutural mas 0% real. Falta: 1 fixture (hotfix) + capturar 5 baselines via dogfooding + medir wall-clock real. Ver §12.8.3 + §17.3 #10. |

new_string: | 4 | 🟡 (90% estrutural) | — | runner.cjs ✅ + workflow YAML ✅ + 5/5 fixtures estruturais (template) + 0/5 baselines reais + performance N/A + protocolo de captura ✅. 2/4 critérios fechados; critério 3 100% estrutural mas 0% real. Falta: capturar 5 baselines via dogfooding + medir wall-clock real. Ver §12.8.3 + §17.3 #10/#11. |
```

- [ ] **Step 3: Verify edit applied**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "🟡 (90% estrutural)" designs/pipeline-orchestrator-v5-consolidated.md
```

Expected: 1 match.

- [ ] **Step 4: Commit deferred**

---

## Task 7: Add §17.3 entry #11 (Slice 4 fixture-5 + protocol)

**Files:**
- Modify: `designs/pipeline-orchestrator-v5-consolidated.md` (insert new entry after #10 in §17.3 list)

- [ ] **Step 1: Locate insertion point (end of #10 entry)**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "10\. \*\*Slice 4 instalação parcial" designs/pipeline-orchestrator-v5-consolidated.md
```

Expected: 1 match. Insert new #11 right after this entry (before `### 17.4 Aberta` heading).

- [ ] **Step 2: Apply Edit**

Use Edit tool. The `old_string` is the last sentence of #10 + the `### 17.4` heading; `new_string` adds #11 between them.

```
old_string: Owner: dono do plugin.

### 17.4 Aberta — para Slice 3

new_string: Owner: dono do plugin.
11. **Slice 4 fixture-5 + protocolo de captura (2026-05-03 sessão 3).** 📌 **HISTÓRICO REGISTRADO**: brainstorming + writing-plans + execução adicionou `hotfix-fixture/` (5º cenário, contrato observável inferido de `commands/pipeline.md` HOTFIX Mode com diferenças explícitas vs bugfix-fixture: campo `mode=hotfix`, pseudo-gate `HOTFIX_CONFIRMATION`, 2 checklists adversarial em vez de 7, `adversarial-{architecture,quality}-reviewer` ausentes, `FINAL_ADVERSARIAL_GATE.decision=SKIPPED`, artefato `HOTFIX_LOG.md` obrigatório, seção `hotfix_assertions` que runner verifica sempre). Mais: seção "Protocolo de captura de baseline real" no `tests/compat/README.md` documenta 5 passos por fixture para quando dogfooding real acontecer. Captura de baselines reais e medição wall-clock continuam adiadas por decisão do dono ("deixa isso que vemos no decorrer das execuções reais"). Score Slice 4: 90% estrutural, 0% baseline real. Ver spec `docs/superpowers/specs/2026-05-03-hotfix-fixture-and-capture-protocol-design.md`.

### 17.4 Aberta — para Slice 3
```

- [ ] **Step 3: Verify entry added**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
grep -n "11\. \*\*Slice 4 fixture-5" designs/pipeline-orchestrator-v5-consolidated.md
```

Expected: 1 match.

- [ ] **Step 4: Commit (combined with Tasks 5+6 spec updates)**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git add designs/pipeline-orchestrator-v5-consolidated.md
git commit -m "docs(spec): update Slice 4 status — 5/5 fixtures + capture protocol

§12.8.3 critério 3: 4/5 → 5/5 estruturalmente implementados.
§12.2 status table row 4: 80% → 90% estrutural.
§17.3: add entry #11 documenting hotfix-fixture creation + capture
protocol. Captura real e wall-clock continuam adiadas conforme
decisão do dono ('deixa isso que vemos no decorrer das execuções reais').

Spec: docs/superpowers/specs/2026-05-03-hotfix-fixture-and-capture-protocol-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: 1 file changed, ~5 insertions, ~3 deletions.

---

## Task 8: Final smoke test + plan summary

**Files:**
- No edits — verification + summary only.

- [ ] **Step 1: Re-run runner end-to-end**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
time node tests/compat/runner.cjs --all --mock
echo "exit=$?"
```

Expected:
```
=== Compat Regression Suite ===
Mode: mock | Scenarios: 5

  audit-fixture ... SKIPPED ...
  bugfix-fixture ... SKIPPED ...
  feature-fixture ... SKIPPED ...
  hotfix-fixture ... SKIPPED ...
  ux-fixture ... SKIPPED ...

=== Summary ===
  PASS:     0
  SKIPPED:  5
  Total:    0.0s (budget 300s)
  ⚠ NO REAL VALIDATION ...
exit=1

real    0m0.Xs
```

5 SKIPPED, exit 1, total time < 5min. CI bloqueia merge corretamente.

- [ ] **Step 2: Verify all commits landed**

```bash
cd "D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator"
git log --oneline -5
```

Expected: 4 new commits since spec doc commit:
1. `test(compat): add hotfix-fixture input.md` (Task 1)
2. `test(compat): add hotfix-fixture expected.yaml` (Task 2)
3. `docs(compat): add 'Protocolo de captura...'` (Task 4)
4. `docs(spec): update Slice 4 status — 5/5 fixtures + capture protocol` (Task 7)

- [ ] **Step 3: Print summary**

Print to terminal:
```
=== Implementation Complete ===
Spec: docs/superpowers/specs/2026-05-03-hotfix-fixture-and-capture-protocol-design.md (commit 55d4d42)

Files changed:
  + tests/compat/v4-baseline/scenarios/hotfix-fixture/input.md
  + tests/compat/v4-baseline/scenarios/hotfix-fixture/expected.yaml
  ~ tests/compat/README.md (+~80 lines, "Protocolo de captura" section)
  ~ designs/pipeline-orchestrator-v5-consolidated.md (3 surgical edits)

Status:
  Slice 4 estrutural: 80% → 90%
  Critério 3 (5 fixtures): 4/5 → 5/5
  Critério 4 (wall-clock): N/A (still pending)
  Baselines reais: 0/5 (still pending — protocol now documented)

Out-of-scope (per spec Non-Goals):
  - Capture real baselines (deferred — protocol ready for when execução real happens)
  - capture-baseline.cjs script (not built — YAGNI for now)
  - Wall-clock measurement (depends on baselines existing)

Next steps when dogfooding happens:
  Run protocol in tests/compat/README.md "Protocolo de captura de baseline real" section.
  ~10min per fixture × 5 fixtures = ~50min total to convert TEMPLATE → REAL.
```

---

## Definition of Done

- [ ] All 8 tasks complete with checkboxes filled.
- [ ] 4 commits landed (Task 1, 2, 4, 7).
- [ ] Smoke test passes (5 SKIPPED, exit 1, < 5min — CI bloqueia merge corretamente).
- [ ] Spec consolidado refletindo 90% estrutural.
- [ ] Out-of-scope items NÃO foram implementados (verifique nada de capture-baseline.cjs ou wall-clock real).

---
name: pipeline-orchestrator-bugfix-method
description: Metodo cientifico para bug fix — Diagnostic (terrain + hypothesis ranking) → Root Cause (evidence chain) → Fix (TDD via regressao) → Regression Test (suite + adjacent breakage). Usado pelos cargos bugfix-*.
when_to_use: Pipeline tipo "Bug Fix". Carregada por bugfix-diagnostic-agent, bugfix-root-cause-analyzer, bugfix-regression-tester, e executor-fix.
---

# pipeline-orchestrator-bugfix-method

Quatro fases sequenciais, cada uma com criterio de saida explicito. **Nao pular fase**, nao "ja sei o que e".

## Fase 1 — Diagnostic (`bugfix-diagnostic-agent`)

Objetivo: **mapear terreno** e **listar hipoteses ranqueadas**. NAO escreve codigo.

### 1.1 Terrain reconnaissance

1. Ler o report do bug (stack trace, repro steps, contexto de quando comeca)
2. Mapear a arquitetura afetada:
   - Quais modulos estao no caminho?
   - Qual eh o fluxo end-to-end (entrada → ... → falha)?
3. Identificar pontos de medida (logs, metrics, traces que sao disponíveis)

### 1.2 Hypothesis generation

Liste **3-7 hipoteses** ranqueadas por plausibilidade. Cada uma com:

```yaml
- id: H1
  description: "Race condition entre worker A e worker B no acesso ao cache X"
  plausibility: 0.0-1.0
  evidence_for:
    - "Stack trace mostra cache lookup falhando intermitente"
    - "src/cache/store.py:84 nao tem lock"
  evidence_against:
    - "Esse caminho deveria ser single-threaded conforme design.md"
  test_to_confirm: "Reproduzir com 2 workers paralelos chamando X simultaneamente"
```

### 1.3 Saida da fase 1

Comment estruturado:

```markdown
### DIAGNOSTIC_REPORT v1

```yaml
terrain_summary: "..."
flow_path: [module_a, module_b, module_c]
measurement_points: ["log foo", "metric bar"]
hypotheses_ranked:
  - {{H1 com plausibility, evidence, test}}
  - {{H2 ...}}
recommended_first_test: H1
```
```

Status muda pra `blocked by root-cause-analyzer` + dispatch para bugfix-root-cause-analyzer.

### 1.4 Quando POSTAR GATE_REQUEST

Se duas ou mais hipoteses estao **empatadas em plausibilidade** e o teste pra distinguir custa muito tempo/recurso, postar GATE_REQUEST pro Board priorizar.

## Fase 2 — Root Cause Analysis (`bugfix-root-cause-analyzer`)

Objetivo: **confirmar uma das hipoteses** com **cadeia de evidencia objetiva**. NAO escreve codigo.

### 2.1 Confirmacao sistematica

Para cada hipotese (top-ranked primeiro):
1. Executar o test_to_confirm proposto na fase 1
2. Coletar evidence
3. Decidir: confirmed, refuted, partial

### 2.2 Cadeia de evidencia

```yaml
root_cause: "Race condition em src/cache/store.py:84"
evidence_chain:
  - step: "Reproduzi com 2 workers paralelos: 0 falhas em 100 tentativas single-thread, 47 em 100 dual-thread"
    evidence_type: empirical
    command: "pytest tests/concurrency_test.py -k cache_race -p 2"
    output: |
      {{output literal}}
  - step: "Codigo confirma: linha 84 le, linha 86 escreve, sem lock"
    evidence_type: code_inspection
    file: "src/cache/store.py:84-86"
  - step: "Doc original em design.md:42 dizia 'cache thread-safe via lock' — implementacao divergiu"
    evidence_type: spec_divergence
    file: "design.md:42"
domain_model_check:
  ssot: "src/cache/store.py eh SSOT para cache"
  callers: ["src/api/handler.py", "src/worker/task.py"]
  invariants_violated: ["thread-safety"]
fix_guidance: |
  Adicionar threading.Lock() em src/cache/store.py linha 80, envolvendo o read-modify-write em with-block.
```

### 2.3 Saida da fase 2

Comment `### ROOT_CAUSE_RESULT v1` + dispatch para executor-fix.

### 2.4 Quando GATE_REQUEST

Se a fix_guidance abre mais de uma alternativa (ex: "Lock vs CAS vs serialize via fila"), GATE_REQUEST pro Board ou architecture-reviewer escolher.

## Fase 3 — Fix (`executor-fix`)

Carrega skill `pipeline-orchestrator-tdd`. Diferenca para implementacao normal:

1. **RED jah esta dado** — o teste_to_confirm da fase 1 + reproducao da fase 2. Use-o como RED.
2. **GREEN** — aplicar fix conforme fix_guidance da fase 2
3. **REFACTOR** — apenas se IL6 (diff minimo) permitir; geralmente nao em bugfix

Saida: `### TDD_GREEN v1` + dispatch para bugfix-regression-tester.

## Fase 4 — Regression Testing (`bugfix-regression-tester`)

Objetivo: garantir que o fix **resolveu sem quebrar nada adjacente**.

### 4.1 Verificacao tripla

1. **Symptom resolution**: rodar exatamente o repro original — deve passar
2. **Suite completa**: `pytest -q` ou equivalente — 0 falhas regressivas
3. **Adjacent breakage**: rodar testes dos modulos adjacentes ao fix (`tests/` dirs proximos)

### 4.2 Criar regression test permanente

O test_to_confirm da fase 1 (se ainda nao foi commitado) vira regression test:
- File: `tests/regression/test_{{issue-id}}_{{short-desc}}.py`
- Comment no topo do file: `# Regression test for {{issue_id}} — root cause: {{1-line summary}}`

### 4.3 Saida da fase 4

```markdown
### REGRESSION_RESULT v1

```yaml
symptom_resolved: true
repro_command: "..."
repro_output_before: "FAIL"
repro_output_after: "PASS"
full_suite: PASS
full_suite_count: {{N passed, 0 failed}}
adjacent_modules_checked: [tests/cache/, tests/api/, tests/worker/]
adjacent_status: ALL_PASS
regression_test_added: tests/regression/test_ISSUE-42_cache_race.py
new_test_passes: true
```
```

Status muda pra `in_review` ou `done` conforme governance.

## 5. Fluxo end-to-end

```
Issue "Bug Fix"
  → task-orchestrator classifica
  → bugfix-diagnostic-agent (terrain + hypotheses)
    → DIAGNOSTIC_REPORT
  → bugfix-root-cause-analyzer (evidence chain)
    → ROOT_CAUSE_RESULT
  → executor-fix (TDD via regression test)
    → TDD_GREEN
  → bugfix-regression-tester (suite + adjacent)
    → REGRESSION_RESULT
  → review-orchestrator (architecture + adversarial review)
  → final-validator (PA_DE_CAL)
```

## 6. Anti-padroes

❌ "Eu ja sei o que eh" — pular Diagnostic = chance alta de chutar errado e fazer fix cosmetico
❌ "O bug nao acontece mais quando rodo, deve ter sumido" — nunca confiar em flaky. Reproduzir 10+ vezes
❌ Fix sem regression test — bug vai voltar
❌ Aplicar fix sem confirmar root cause (chute) — vai fixar sintoma, problema subjacente fica
❌ Pular Fase 4 "porque o teste novo passa" — adjacent breakage e o que destroi confianca de quem usa o codigo

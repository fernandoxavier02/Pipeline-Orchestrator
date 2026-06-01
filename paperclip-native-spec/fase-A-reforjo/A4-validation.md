# A4 — Critérios de Validação da Fase A (Reforjo)

**Status:** Draft v1.1 (Onda A1 + calibração 2026-06-01)
**Data:** 2026-05-24 · calibrado 2026-06-01
**Depende de:** A1-requirements.md (C7-A — paridade mensurável), A2-design.md (bounded contexts), A3-tasks.md (smoke tests), A0-CALIBRACAO-pos-execucoes-2026-06-01.md

> ⚠️ **CALIBRADO PÓS-EXECUÇÕES — ver `A0-CALIBRACAO-pos-execucoes-2026-06-01.md`.** Onde os cenários Gherkin abaixo dizem `executionState.pipeline.gate_decisions[]` ou `executionState.pipeline.heartbeat_optimization`, leia o **comentário estruturado `PIPELINE_STATE`** equivalente (A0 §3) — o campo `executionState` está morto. A definição da métrica (§1) e o procedimento de medição (§4) já estão corrigidos no texto.

---

## 1. Métrica Principal: Parity Score

```
parity_score = (portões emitidos que eram esperados) / (portões esperados totais)
```

**Onde:**
- "Portões esperados" = lista de portões que DEVEM ser disparados num cenário específico conforme complexity-matrix.md e gates.md
- "Portões emitidos" = portões registrados nos comentários estruturados `PIPELINE_STATE` da issue durante a execução (campo `executionState` descartado — ver A0)

**Thresholds:**
| Score | Veredicto |
|---|---|
| ≥ 0.95 | PASS — paridade plena |
| ≥ 0.80 | PASS_WITH_NOTES — paridade aceitável com ressalvas |
| < 0.80 | FAIL — paridade insuficiente |

**Baseline atual (pré-Fase A):** ~0.70-0.75 (`PARITY_VERDICT=PASS_WITH_NOTES` medido em v7.6.0)

---

## 2. Cenários de Teste E2E por Variant

### Variant 1: bugfix-light

**Portões esperados (mandatory set SIMPLES = 5 + adversarial por auth):**
`INFO_GATE_BLOCKED, TDD_APPROVAL, CHECKPOINT_FAIL, COMPLEXITY_GATE, CLOSEOUT_CONFIRM`

**Cenário BL-01: Bug simples em função utilitária (sem auth)**
```gherkin
Given uma issue de bugfix com título "Corrigir cálculo de percentual no módulo de relatórios"
And a issue é SIMPLES (1 arquivo, < 30 linhas, 1 domínio)
When o pipeline bugfix-light roda com information-gate reforçado
Then os seguintes portões são registrados em executionState.pipeline.gate_decisions[]:
  - INFO_GATE_BLOCKED (decision: APPROVED — 0 gaps)
  - COMPLEXITY_GATE (decision: CONFIRMED — SIMPLES)
  - TDD_APPROVAL (decision: APPROVED — 1 teste unitário aprovado)
  - CHECKPOINT_FAIL (decision: NOT_TRIGGERED — build passou)
  - CLOSEOUT_CONFIRM (decision: CONFIRMED — Board confirmou)
And parity_score = 5/5 = 1.00
```

**Cenário BL-02: Bug com gap de informação**
```gherkin
Given uma issue de bugfix com informação insuficiente para diagnosticar
When o pipeline bugfix-light roda
Then INFO_GATE_BLOCKED é disparado com decision: BLOCKED
And a issue fica com status=paused
And uma approval issue é criada atribuída ao Board
And o pipeline NÃO avança até a approval ser resolvida
And parity_score medido somente após resolução da approval
```

---

### Variant 2: bugfix-heavy

**Portões esperados (mandatory set COMPLEXA = 16):**
`STATE_FILE_INIT_FAIL, INFO_GATE_BLOCKED, TDD_APPROVAL, CHECKPOINT_FAIL, COMPLEXITY_GATE, CLOSEOUT_CONFIRM, PLAN_REJECTED, MICRO_GATE_GAP, ADVERSARIAL_GATE, ADVERSARIAL_BLOCK, STOP_RULE, FINAL_ADVERSARIAL_GATE, FINAL_ADVERSARIAL_REWORK, FIX_LOOP_EXHAUSTED, ADVERSARIAL_GATE_MANDATORY, SSOT_CONFLICT`

**Cenário BH-01: Bug em módulo de autenticação**
```gherkin
Given uma issue de bugfix "Usuários são deslogados aleatoriamente após deploy"
And a issue é COMPLEXA (auth domain, production incident)
When o pipeline bugfix-heavy roda completo
Then STATE_FILE_INIT_FAIL é registrado (decision: NOT_TRIGGERED — executionState criado com sucesso)
And INFO_GATE_BLOCKED é resolvido (0 gaps após 2 perguntas ao Board)
And ADVERSARIAL_GATE_MANDATORY dispara (decisão automática por tocar auth)
And todos os 16 portões mandatórios para COMPLEXA são registrados em executionState
And parity_score ≥ 0.95
```

**Cenário BH-02: Stop rule após 2 falhas de build**
```gherkin
Given um pipeline bugfix-heavy em execução
And o build falha 2 vezes consecutivas no mesmo batch
When o executor-controller detecta a segunda falha
Then STOP_RULE é disparado com decision: BLOCKED
And uma approval issue é criada com as 3 opções de reset
And o pipeline NÃO avança sem decisão do Board
```

---

### Variant 3: implement-light (Feature)

**Portões esperados:** mesmos do bugfix-light = 5 portões SIMPLES

**Cenário IL-01: Feature pequena de UI**
```gherkin
Given uma issue de feature "Adicionar botão de exportar CSV na tela de relatórios"
And a issue é SIMPLES (2 arquivos, < 30 linhas, 1 domínio)
When o pipeline implement-light roda completo
Then os 5 portões mandatórios SIMPLES são registrados
And parity_score ≥ 0.95
```

**Cenário IL-02: Feature que revela complexidade maior**
```gherkin
Given uma issue classificada como SIMPLES
And durante o planejamento o executor descobre que afeta 4 arquivos
When o COMPLEXITY_GATE é acionado
Then a issue é re-classificada como MEDIA
And o pipeline é redirecionado para implement-heavy
And o re-direcionamento é registrado em executionState com decision: CORRECTED
```

---

### Variant 4: implement-heavy (Feature)

**Portões esperados:** mandatory set COMPLEXA = 16 + FINAL_ADVERSARIAL_GATE + FINAL_ADVERSARIAL_REWORK + FIX_LOOP_EXHAUSTED

**Cenário IH-01: Feature de múltiplos domínios**
```gherkin
Given uma issue de feature "Implementar sistema de notificações em tempo real"
And a issue é COMPLEXA (3+ domínios: WebSocket, eventos, notificações, UI)
When o pipeline implement-heavy roda completo
Then todos os 16 portões mandatórios COMPLEXA são registrados
And FINAL_ADVERSARIAL_GATE dispara com 3 revisores em paralelo
And parity_score ≥ 0.95
```

---

### Variant 5: spec-light

**Portões esperados:** mandatory set MEDIA (10) + spec gates: SPEC_ARTIFACT_MISSING, SPEC_FORMAT_GATE_FAIL, SPEC_AC_TRACEABILITY_GAP

**Cenário SL-01: Spec simples de componente**
```gherkin
Given uma spec com requirements.md + design.md + tasks.md preenchidos
And a spec é MEDIA (3-5 arquivos de artefatos, 1-2 domínios)
When o pipeline spec-light roda
Then SPEC_ARTIFACT_MISSING é registrado (decision: NOT_TRIGGERED — todos os artefatos presentes)
And SPEC_FORMAT_GATE_FAIL é registrado (decision: NOT_TRIGGERED — 22/25 checks passam)
And SPEC_AC_TRACEABILITY_GAP é registrado (decision: NOT_TRIGGERED — 100% ACs cobertos)
And os 10 portões mandatórios MEDIA são registrados
And parity_score ≥ 0.95
```

---

### Variant 6: spec-heavy

**Portões esperados:** mandatory set COMPLEXA (16) + spec gates (6): +SPEC_CONTENT_REVIEW_NOGO, SPEC_POST_IMPL_FAIL, ADVERSARIAL_LOOP_CHECKPOINT

**Cenário SH-01: Esta própria Onda A1 (auto-referencial)**
```gherkin
Given a spec paperclip-unified é COMPLEXA (15+ docs, multi-semana)
When o pipeline spec-heavy valida esta spec
Then SPEC_ARTIFACT_MISSING é NOT_TRIGGERED (A1+A2+A3 presentes)
And SPEC_FORMAT_GATE_FAIL avalia os artefatos da Fase A
And SPEC_CONTENT_REVIEW_NOGO valida congruência entre A1, A2, A3, A4
And todos os 22 portões mandatórios (16 COMPLEXA + 6 spec) são registrados
And parity_score ≥ 0.95
```

---

### Cenário Transversal — Scoped Wake (auditoria KB+skills v1.1)

Independente do variant, este cenário valida que a otimização de scoped wake (A2-design.md §2.3.1) funciona corretamente em wakes dirigidos por approval resolvida.

```gherkin
Feature: Scoped wake economiza latência em wakes dirigidos

  Scenario SW-01: Cargo acordado por approval resolvida pula passos 1-4 do heartbeat
    Given uma issue com gate INFO_GATE_BLOCKED resolvido pelo Board < 60s atrás
    And o cargo associado está aguardando wake
    When o cargo Codex inicia heartbeat com PAPERCLIP_WAKE_PAYLOAD = {trigger_kind: "approval_resolved", approval_id: "..."}
    Then o cargo pula passos 1-4 (identity, approval follow-up, planning, assignments)
    And executionState.pipeline.heartbeat_optimization = "scoped_wake_applied"
    And tempo total de execução < 50% do tempo de full heartbeat baseline
    And gates registrados são IDÊNTICOS aos de full heartbeat (paridade preservada)

  Scenario SW-02: Gate com hardness CIRCUIT_BREAKER força full heartbeat
    Given approval issue de gate STOP_RULE resolvida pelo Board com reset_choice
    When cargo é acordado
    Then cargo executa FULL heartbeat (9 passos)
    And executionState.pipeline.heartbeat_optimization = "scoped_wake_skipped_circuit_breaker"

  Scenario SW-03: Resolução stale (> 60s) força full heartbeat
    Given approval resolvida há > 60s
    When cargo é acordado tardiamente
    Then cargo executa FULL heartbeat
    And executionState.pipeline.heartbeat_optimization = "scoped_wake_skipped_stale_resolution"
```

**Medição:** Executar mesmo cenário (ex: BL-01 bugfix-light com TDD_APPROVAL approved) duas vezes — uma com scoped wake habilitado, outra com full heartbeat forçado. Medir (a) tempo wall-clock, (b) gates registrados (devem ser idênticos), (c) tokens consumidos.

**Critério de PASS:** scoped wake reduz tempo em ≥ 40% sem perder fidelidade de gates.

---

## 3. Matriz de Paridade por Variant

| Variant | Cenários | Portões esperados | Threshold | Linha de base pré-Fase A |
|---|---|---|---|---|
| bugfix-light | BL-01, BL-02 | 5 (SIMPLES) | PASS ≥ 0.95 | ~0.60 (estimado) |
| bugfix-heavy | BH-01, BH-02 | 16 (COMPLEXA) | PASS ≥ 0.95 | ~0.50 (estimado) |
| implement-light | IL-01, IL-02 | 5 (SIMPLES) | PASS ≥ 0.95 | ~0.60 (estimado) |
| implement-heavy | IH-01 | 16 (COMPLEXA) | PASS ≥ 0.95 | ~0.50 (estimado) |
| spec-light | SL-01 | 10 + 3 spec = 13 | PASS ≥ 0.95 | ~0.40 (estimado) |
| spec-heavy | SH-01 | 16 + 6 spec = 22 | PASS ≥ 0.95 | ~0.35 (estimado) |

**Nota:** Linha de base pré-Fase A são estimativas baseadas na análise qualitativa `PARITY_VERDICT=PASS_WITH_NOTES`. A medição quantitativa começa na Onda A2 com o cargo piloto.

---

## 4. Procedimento de Medição do Parity Score

```
Para cada cenário de teste:

1. Criar issue de teste no Paperclip conforme cenário
2. Executar o workflow completo com o ambiente da Fase A ativo
3. Ao final, ler os comentários PIPELINE_STATE da issue e reconstruir a corrente por previous_hash
4. Construir a lista de portões emitidos (gate_name de cada entry)
5. Construir a lista de portões esperados conforme a complexity-matrix.md para a complexidade do cenário
6. Calcular parity_score = len(set(emitidos) ∩ set(esperados)) / len(set(esperados))
7. Registrar resultado em planilha de paridade com data, cenário, score, findings
```

**Erros comuns a evitar:**
- Contar portões NOT_TRIGGERED como "emitidos" — são NOT_TRIGGERED, não emitidos
- Não contar portões disparados que não estavam na lista esperada (falsos positivos) — o score mede cobertura dos esperados, não precisão
- Confundir hardness AUDIT (sempre informacional) com SOFT ou HARD

---

## 5. Critérios de Aceitação da Fase A (resumo executivo)

A Fase A é declarada como PASS quando:

1. `parity_score ≥ 0.95` em todos os 6 variants × todos os cenários definidos acima
2. Zero decisões críticas tomadas por cargo sem approval em 48h de operação monitorada
3. Drift detection ativa e testada (detecta desvio simulado em ≤1 heartbeat)
4. Iron Law preservada (zero modificações em Pipeline-Orchestrator/)
5. Board aprovou os resultados dos smoke tests da Onda A3

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — critérios de validação e cenários de teste |

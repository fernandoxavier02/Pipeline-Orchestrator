---
step_number: 04
step_name: "implementation"
description: "Spec Heavy: TDD implementation with Vertical Slices and adversarial loop"
execution_mode: inline
agent_type: ""
expected_inputs:
  - atdd_scenarios: from_step_03
  - content_review_report: from_step_02
  - spec_context: from_spec_context_yaml
  - tasks_md: from_spec_path
expected_outputs:
  - tasks_completed: list
  - test_results: object
  - adversarial_loop_result: object
  - gate_decision: "approved | checkpoint | abort"
expected_next: 5
gate_required: true
gate_name: "adversarial-loop-checkpoint"
allowed_tools: [Read, Grep, Glob, Edit, Write, Bash, AskUserQuestion]
---

# Spec Lifecycle (Heavy) — Step 04: Implementation (TDD + Vertical Slices + adversarial loop)

> **Position in pipeline:** Step 4 — passo mais pesado do pipeline. Drives the executor (TDD per task, adversarial review per batch, build+test per checkpoint) ate `tasks.md` estar inteiramente ticked OU uma falha irrecuperavel halt o pipeline.
> **Goal:** Produzir codigo que transforma testes RED (de cenarios ATDD + subtasks TDD em tasks.md) em GREEN, slice por slice, com revisao adversarial squashando issues de seguranca/arquitetura por batch.

---

## Quando usar

Use apos o ATDD seed (step 03) ter sido aprovado. Entradas obrigatorias: (a) cenarios ATDD com matriz de rastreabilidade; (b) `tasks.md` da spec (validado pelo Format Gate em D1-D7 e pelo Content Review eixos 1-3 e 7); (c) acesso ao codigo do repo. O content_review_report do step 02 informa o implementer sobre eixos com warnings — por exemplo, eixo 7 (vertical slices): se o agrupamento de tasks foi flaggeado como `HORIZONTAL_SMELL`, o implementer pode reagrupar dinamicamente as tasks em slices verticais durante a execucao (sem reescrever tasks.md).

## Regras

- Siga o `tasks.md` da spec linha a linha. Reagrupamento por vertical slice e permitido (autorizado pelo content review eixo 7); reordenacao livre de tasks NAO e — exige checkpoint.
- TDD obrigatorio: para cada task implementadora, escrever teste RED → codigo GREEN → REFACTOR.
- Build obrigatorio ao final de cada CHECKPOINT (declarado em tasks.md a cada 3-5 tasks).
- Nao inventar funcionalidades fora da spec. Se surgir necessidade, pause via AskUserQuestion.
- STOP RULE: 3 falhas consecutivas de build/teste no mesmo checkpoint, PARAR e analisar causa raiz. (Heavy permite 3 retries vs 2 do Light por ser pipeline mais longo com mais oportunidades de fix parcial.)

---

## Inputs

- `atdd_scenarios` (do step 03) — contrato de comportamento ja aprovado pelo usuario.
- `content_review_report` (do step 02) — sinaliza warnings (ex: vertical slices, contracts incompletos).
- `tasks_md` (da spec) — checklist de implementacao com subtasks de teste.
- `spec_context.scope` — limites do que pode ser tocado.

---

## Etapa 1 — Validation Gate (pre-implementacao)

Antes de tocar qualquer arquivo, emitir tabela GO/NO-GO consolidando:

| Criterio | Status |
|---|---|
| Format Gate (step 01) PASS ou GO-WARN | GO/NO-GO |
| Content Review (step 02) PASS ou GO-WARN | GO/NO-GO |
| ATDD scenarios (step 03) aprovados | GO/NO-GO |
| tasks.md tem CHECKPOINTS distribuidos | GO/NO-GO |
| Repo limpo (working tree clean ou apenas spec edits) | GO/NO-GO |
| Build atual passa (baseline antes de tocar) | GO/NO-GO |

Se qualquer item NO-GO: pausar e reportar antes de seguir.

---

## Etapa 2 — Loop de Vertical Slices

Para cada slice (grupo de tasks ate o proximo CHECKPOINT):

### 2.1 RED — escrever testes que falham
- Para cada task com subtask de teste (e ATDD scenario tagged `AC#N`):
  - Criar arquivo de teste em layer apropriada (unit/integration/e2e).
  - Implementar o cenario GIVEN/WHEN/THEN como `it('...')`.
  - Rodar testes — confirmar que falham (RED).

### 2.2 GREEN — codigo minimo para passar
- Implementar o codigo de producao mais simples que faz os testes RED ficarem GREEN.
- Sem inventar campos, metodos ou abstracoes nao previstos na spec.

### 2.3 REFACTOR — melhorar sem mudar comportamento
- Reorganizar codigo se ficou confuso, mas SEM alterar testes.
- Rodar testes de novo — devem continuar GREEN.

### 2.4 Marcar `[x]` em tasks.md
- Apenas apos GREEN + REFACTOR confirmados.

### 2.5 CHECKPOINT — build + testes
- Rodar build completo do projeto.
- Rodar suite de testes completa (incluindo regressao).
- Status esperado: build PASS + 0 testes em FAIL.

---

## Etapa 3 — Loop adversarial (per batch)

Apos cada CHECKPOINT verde, dispatchar revisao adversarial paralela com os dois agentes via Agent calls em FQDN canonico: `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic` e `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner`. No Heavy, esses mesmos agentes rodarao de forma exaustiva nos steps 06 e 07; o loop aqui e leve (focado nos arquivos do slice atual) — review profundo fica para 06+07.

**Zero-trust:** Os subagentes adversariais recebem APENAS a lista de arquivos do slice; eles DEVEM reler cada arquivo e formar findings a partir do código fonte — NUNCA confiar em resumos narrativos do implementer. Comentarios de commit, descricoes de tasks ou auto-relato do executor sao descartaveis: a unica fonte verdadeira aqui e o conteudo lido diretamente do disco.

### Loop com escalation a cada 3 tentativas + hard cap

Estado por slice:
- `loop_attempt` (counter per-slice, comeca em 0; reseta a cada slice; usado pra trigger AskUserQuestion escalation a cada 3).
- `findings_signature` (hash dos findings da rodada anterior — ver definicao abaixo).

Estado pipeline-level (acumula across slices):
- `total_adversarial_rounds` (counter, max 12 no Heavy; usado pra hard cap absoluto).

Definicao de `findings_signature` (Node.js):

```js
const crypto = require('crypto');
const payload = JSON.stringify(findings.map(f => f.id + '|' + f.severity).sort());
const findings_signature = crypto.createHash('sha256').update(payload).digest('hex');
```

Duas rodadas consecutivas com a MESMA assinatura forcam checkpoint imediato sem incrementar `loop_attempt`.

Algoritmo:
1. Rodar adversarial review.
2. Se 0 findings: prosseguir para proximo slice.
3. Se findings > 0: incrementar `loop_attempt` E `total_adversarial_rounds`; aplicar fixes; rodar build+testes. Se `loop_attempt > 0 AND loop_attempt % 3 == 0`, pausar via AskUserQuestion com 4 opcoes:
   - **Continuar loop (Recomendado se progresso visivel)** — fazer mais 3 tentativas.
   - **Escalar steps 06+07** — promover findings remanescentes para o adversarial profundo (steps 06 e 07 ja vao rodar; antecipar a checagem deep ali).
   - **Aceitar warnings** — registrar findings nao-bloqueantes e seguir.
   - **Abortar pipeline** — encerrar sem closure.

   Voltar a (1).
4. Same-findings detection: se `findings_signature` igual ao da rodada anterior, forcar checkpoint imediato (sem incrementar `loop_attempt` nem `total_adversarial_rounds`).

### Stop rule do loop adversarial

- 3 falhas consecutivas de build/teste durante fix-loop → PARAR e analisar causa raiz.
- Findings classificados como BLOCKER nunca podem ser "aceitos como warnings" — apenas escalar ou abortar.
- **Hard cap:** se `total_adversarial_rounds >= 12`, ABORT pipeline (manual user decision required).

---

## Formato de resposta obrigatorio

```markdown
## IMPLEMENTATION REPORT (HEAVY) — [feature-name]

### Validation Gate
| Criterio | Status |
| ... | ... |

### Slices
Slice 1 (tasks 1-4):
  - Tasks: [x] T1, [x] T2, [x] T3, [x] T4
  - Tests: 7 RED → GREEN; 0 regression broken
  - Adversarial (light): 1 round, 0 findings
  - Checkpoint: PASS

Slice 2 (tasks 5-8):
  - Tasks: [x] T5, [x] T6, [x] T7, [x] T8
  - Tests: ...
  - Adversarial (light): 2 rounds (1 finding fixed)
  - Checkpoint: PASS

### Resumo
- N tasks completas / N total
- N testes RED → GREEN
- N rondas adversariais leves
- Build status: PASS | FAIL
- loop_attempt final: N
- total_adversarial_rounds: N

### Decisao
approved | checkpoint (escalation needed) | abort
```

---

## Gate (AskUserQuestion mandatorio)

A cada 3 tentativas adversariais, ou ao final do step, abrir AskUserQuestion com header `Adversarial` e as 4 opcoes acima. Recomendacao default: `Continuar loop` se progresso, `Aceitar warnings` se findings sao todos LOW e bloqueio nao e estrutural.

---

**Proximo step:** 05

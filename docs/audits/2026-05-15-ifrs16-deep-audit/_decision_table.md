# Tabela de Decisão Pré-Aprovada por Gate-ID

> Política unificada de resposta aos gates durante a Fase B.
> Objetivo: respostas **consistentes e comparáveis** entre os 7 cenários.
> Nenhuma resposta é "aprovar cegamente" — toda decisão tem critério.

## Princípios

1. **Não automatizar Aprovação cega.** Toda decisão tem critério auditável documentado abaixo.
2. **Preferir caminho que mais exercita o pipeline.** Quando há trade-off entre rapidez e cobertura, escolho cobertura — o objetivo é mapear comportamento, não obter run verde.
3. **Closeout sempre = Discard** (`keep uncommitted` / nada de commit/PR). Evita poluir a branch base.
4. **Adversarial sempre = Yes.** Forçamos o pipeline a executar o caminho completo de adversarial.
5. **Findings vagos = Reject.** Se um subagent não cita `file:line` ou descrição concreta, rejeito e marco como achado.
6. **Quando o pipeline pedir info que está no prompt original** → respondo com o conteúdo verbatim do prompt do cenário (não invento informação nova).

## Tabela canônica

| Gate-ID | Decisão padrão | Critério |
|---------|----------------|----------|
| `phase-1-pipeline-proposal` | **Yes** | se classifier acertou complexidade alvo (declarada na tabela do plano). Se errou: **Adjust** com explicação `classifier returned X, expected Y` |
| `phase-1-5-plan-approval` | **Approve** | se plan tem ≥3 seções substantivas (objetivo, abordagem, tasks). **Reject** se for genérico |
| `phase-2-adversarial-batch-[N]` | **Yes** | sempre. Queremos disparar adversarial. Se cenário tocar auth/data → MANDATORY de qualquer forma |
| `phase-3-final-adversarial` | **Yes** | sempre. Forçar para garantir cobertura |
| `CLOSEOUT_CONFIRM` | **Discard / keep uncommitted** | nunca commitar/PR durante teste |
| `INFO_GATE_BLOCKED` | Responder com info do prompt original | se a info não está no prompt, responder `INFO_NOT_PROVIDED_BY_USER` |
| `TDD_APPROVAL` | **Approve** | se cenários estão em plain language com Given/When/Then. **Reject** se vagos ou só usar termo técnico |
| `STOP_RULE` | **Aceitar parada** | é dado válido, não tentar bypass |
| `FIX_LOOP_EXHAUSTED` | **Aceitar parada** | idem |
| `STEP_1_7_RECURSION_GUARD` | **Aceitar parada** | idem |
| `SPEC_FORMAT_GATE_FAIL` | **NoGo** se findings concretos; **Override** apenas se findings forem trivial style | registrar como achado se override |
| `SPEC_CONTENT_REVIEW_NOGO` | **NoGo** | toda findings é evidência |
| `SPEC_AC_TRACEABILITY_GAP` | **Block** | gap em traceability é falha real |
| `SPEC_POST_IMPL_FAIL` | **Block** | falha forte |
| `STALE_CONTEXT` (em CONTINUE) | **Refresh** | sempre rebuild |
| `COMPLEXITY_GATE` (override de classifier) | **Aceitar valor do classifier** | só override se evidência forte; registrar como achado se classifier errou |
| `STEP_1_7_ROUTING` (brainstorm intake) | **dispatch-brainstorm** para C1; **no-prep-override** para outros | seguir o cenário |
| brainstorm `01-explore` Q1-Q7 | Respostas curtas verbatim do prompt do cenário | nada inventado |
| brainstorm `08-handoff` | **Run-now** para C1 | queremos handoff completo |

## Decisões por cenário (override / contextual)

### C1 — brainstorm-handoff
- Q1-Q7 do explore: respostas curtas reais sobre o endpoint /api/contracts/lease-summary
- Handoff: Run-now
- Após handoff, segue regras padrão de FULL

### C2 — full-light
- Se classifier classificar como SIMPLES ou COMPLEXA (não MEDIA): registrar achado mas seguir adiante com **Yes**

### C3 — full-heavy COMPLEXA
- `--force-level=COMPLEXA` deve aparecer em TRACE.md; se não aparecer: achado
- Per-batch adversarial: **Yes** em todos os batches

### C4 — diagnostic
- Após proposta, pipeline DEVE encerrar sem executar
- Se invocar executor-controller: **violação crítica**

### C5 — review-only
- Espera adversarial findings em `temp_review_target.py`
- Se reviewers não detectarem divisão por zero e SQL concat: achado

### C6 — hotfix
- Emergency-confirm: **Confirm**
- TDD reduzido: aceitar 1 regression test
- Adversarial só auth+injection: aceitar bypass do resto

### C7 — grill
- design-interrogator DEVE aparecer apesar de SIMPLES
- Se não aparecer: **violação do contrato de `--grill`**

## Loop adversarial pós-batch (Fase B)

Após **cada cenário B1-B7**, spawn 3 reviewers em paralelo do EVAL_REPORT gerado:
- `compound-engineering:ce-adversarial-reviewer`
- `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner`
- `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic`

Critério zero erros: zero CRITICAL + zero HIGH.
Max 3 iterações; após, registrar `ADVERSARIAL_LOOP_BREAK` no relatório.

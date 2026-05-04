---
step_number: 8
step_name: "risk-controls"
execution_mode: inline
agent_type: ""
expected_inputs:
  - chosen_approach: from_step_7
expected_outputs:
  - risk_register: [{ risk_id, description, likelihood, impact, mitigation }]
  - idempotency_test_specs: [{ scenario, expected }]
  - atomicity_test_specs: [{ scenario, expected }]
expected_next: 9
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 08 — Risk Controls

> **Posição no Pipeline:** Passo 8 — Após escolha arquitetural. Identifica riscos operacionais (idempotência, concorrência, atomicidade) e gera test specs.
> **Objetivo:** Listar riscos da abordagem escolhida + property test specs para idempotência e atomicidade.

## Heavy mode prompt

Você é meu arquiteto/engenheiro sênior. Faça análise profunda focada em "Controles de risco operacional", mantendo governança e impacto mínimo.

**Contexto:**
- `chosen_approach` (Step 07).
- Restrições: preservar arquitetura; mudanças mínimas.

**Tarefas obrigatórias:**
1. Listar riscos operacionais da abordagem escolhida: idempotência, concorrência, atomicidade, retries, timeouts, deadlocks, race conditions, falhas parciais.
2. Para cada risco: likelihood (alta/média/baixa) + impact (alto/médio/baixo) + mitigação concreta.
3. Avaliar execução repetida: double click, retries do client, jobs duplicados — onde precisa de chave de idempotência? Como derivá-la?
4. Avaliar multi-etapas: se falhar no meio, há estado intermediário? Onde precisa transação? Onde precisa compensação (saga)?
5. Avaliar concorrência: 2 requests simultâneos no mesmo recurso — qual comportamento esperado? Lock pessimista, otimista, last-write-wins?
6. Especificar property test specs para idempotência: rodar a mesma operação N vezes com a mesma chave → estado final igual ao de 1 execução.
7. Especificar property test specs para atomicidade: forçar falha no meio → estado deve voltar ou completar, nunca ficar parcial.

**Regras:**
- Não implementar código.
- Não-Invenção: se o sistema atual não documenta política de retry/timeout, perguntar ao user antes de assumir.
- Property test specs viram input do Step 10 (TDD pre-impl).

**Formato da resposta:**
- Risk register (tabela)
- Estratégia de idempotência
- Estratégia de atomicidade
- Estratégia de concorrência
- Property test specs (lista)
- Lacunas que precisam decisão do user

## Light mode prompt

**Contexto:**
- `chosen_approach` curto (Step 07).

**Tarefa:**
1. Listar 1-3 riscos principais com mitigação 1-linha.
2. Idempotência se aplica? (sim/não + justificativa curta)
3. Atomicidade se aplica?
4. 1-2 property test specs (se idempotência ou atomicidade aplicam).

**Sinal de migração para Heavy:** se múltiplos riscos críticos, ou concorrência/atomicidade ambígua → migre.

**Formato:**
- Riscos (lista curta)
- Idempotência: sim/não + por quê
- Atomicidade: sim/não + por quê
- Test specs (1-2)
- Próximo passo

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/08-feature-risk-controls.md`:

- `risk_register`: tabela
- `idempotency_test_specs`: lista para Step 10
- `atomicity_test_specs`: lista para Step 10

**Próximo:** Step 09 — Implementation Plan (GATE: plan-approval; pode ser SKIPPED se Phase 1.5 plan-architect já rodou).

---
step_number: 6
step_name: "data-model-persistence"
execution_mode: inline
agent_type: ""
expected_inputs:
  - ssot_mapping: from_step_5
expected_outputs:
  - schema_design: { entities: [...], keys: [...], constraints: [...] }
  - migration_specs: { changes: [...], reversibility: bool }
  - integration_test_specs: [{ scenario, expected }]
expected_next: 7
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 06 — Data Model + Persistence

> **Posição no Pipeline:** Passo 6 — Após SSOT. Modela entidades, chaves, constraints e migrações.
> **Objetivo:** Definir schema, migração (se houver) e integration test specs para persistence layer (save/load/constraints).

## Heavy mode prompt

Você é meu arquiteto/engenheiro sênior. Faça análise profunda focada em "Modelo de dados e persistência", mantendo governança e impacto mínimo.

**Contexto:**
- SSOT mapping (Step 05).
- Restrições: preservar arquitetura; mudanças mínimas em schema; aditivas preferencialmente.

**Tarefas obrigatórias:**
1. Listar entidades novas + modificadas. Para cada: campos, tipos, constraints (NOT NULL, UNIQUE, FK, CHECK).
2. Definir chaves primárias + secundárias (indexes) — justificar cada index.
3. Mapear relacionamentos (1:1, 1:N, N:M) e cascade behavior.
4. Identificar invariantes que precisam constraint no banco vs validação na app.
5. Especificar migração: aditiva ou breaking? Reversível? Backfill necessário? Janela de manutenção?
6. Avaliar risco de registros órfãos/inconsistentes durante migração.
7. Especificar integration tests para persistence: save valid, save invalid (constraint), load by key, load by index, edge cases (campo null, FK quebrada).

**Regras:**
- Preferir mudanças aditivas (cf. `~/.claude/rules/20-quality.md`).
- Declare "EVIDÊNCIA" (schema existente) vs "ASSUNÇÃO".
- Não implementar; só especificar.

**Formato da resposta:**
- Tabela de entidades + campos + constraints
- Indexes + justificativa
- Migração (aditiva/breaking, plano)
- Integration test specs (lista)
- Riscos de inconsistência

## Light mode prompt

**Contexto:**
- SSOT mapping do Step 05.

**Tarefa:**
1. Schema simples: entidade(s) afetada(s) + campos novos.
2. Constraint mínimo: o que protege invariante.
3. Migração: aditiva (preferencial) ou justificar breaking.
4. 1-2 integration test specs (save + load).

**Sinal de migração para Heavy:** schema com múltiplos relacionamentos, migração breaking, dados sensíveis (financial, PII) → migre.

**Formato:**
- Schema curto (entidades + campos)
- Constraints mínimos
- Migração (1 frase)
- Test specs (1-2)
- Próximo passo

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/06-feature-data-model.md`:

- `schema_design`: como acima
- `migration_specs`: plano + reversibilidade
- `integration_test_specs`: lista para Step 10

**Próximo:** Step 07 — Architecture Design Options (GATE: architecture-choice).

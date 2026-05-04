---
step_number: 4
step_name: "domain-rules"
execution_mode: inline
agent_type: ""
expected_inputs:
  - acceptance_matrix: from_step_3
expected_outputs:
  - domain_rules: [{ rule_id, statement, invariant, edge_cases }]
  - property_test_specs: [{ rule_id, properties: [...] }]
expected_next: 5
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 04 — Domain Rules

> **Posição no Pipeline:** Passo 4 — Após contrato de cenários aprovado. Extrai regras de negócio + property tests RED.
> **Objetivo:** Listar regras de domínio que governam a feature, com invariantes testáveis isoladamente.

## Heavy mode prompt

Você é meu arquiteto/engenheiro sênior. Faça análise profunda focada em "Regras de domínio e invariantes", mantendo governança e impacto mínimo.

**Contexto:**
- Acceptance matrix (Step 03) já aprovada pelo user.
- Restrições: preservar arquitetura; mudanças mínimas.

**Tarefas obrigatórias:**
1. Extrair regras de negócio da matriz de cenários — uma por uma, nomeadas (`rule_id`).
2. Para cada regra: enunciado declarativo + invariantes (o que sempre vale) + edge cases (limites, vazios, falhas).
3. Marcar ambiguidades — onde duas regras conflitam ou ficam mal definidas.
4. Especificar property tests para regras isoladas (regras que não dependem de I/O): geradores, propriedades verificáveis, contraexemplos esperados.
5. Distinguir regras de negócio (domínio puro) de regras de aplicação (orquestração) e de regras de UI.
6. Listar quais regras precisam de SSOT antes de implementar (vai virar input do Step 05).

**Regras:**
- Não implementar código.
- Declare "EVIDÊNCIA" (regra explícita em docs/spec/cliente) vs "ASSUNÇÃO" (regra inferida).
- Property tests vão começar RED — o teste é parte do contrato, não do código.

**Formato da resposta:**
- Resumo executivo das regras
- Tabela `rule_id | enunciado | invariantes | edge cases`
- Ambiguidades a resolver
- Property test specs (sem implementar — apenas spec)
- Regras que precisam SSOT do Step 05

## Light mode prompt

**Contexto:**
- Acceptance matrix do Step 03 (mínima).

**Tarefa:**
1. Listar 1-3 regras principais de negócio embutidas na matriz.
2. Para cada uma: enunciado curto + 1 edge case.
3. Marcar ambiguidades óbvias.
4. Indicar se property test isolado é viável (sim/não).

**Sinal de migração para Heavy:** múltiplas regras conflitantes, regras dependentes de SSOT externa, ou domínio sensível (cobrança, segurança) → migre.

**Formato:**
- Regras (lista 1-3)
- Edge cases
- Ambiguidades
- Próximo passo

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/04-feature-domain-rules.md`:

- `domain_rules`: tabela como acima
- `property_test_specs`: lista de specs (não código)
- `ambiguities_to_resolve`: prosa
- `rules_needing_ssot`: lista (vira input do Step 05)

**Próximo:** Step 05 — Source of Truth.

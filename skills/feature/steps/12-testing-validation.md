---
step_number: 12
step_name: "testing-validation"
execution_mode: subagent
agent_type: "feature-integration-validator"
expected_inputs:
  - files_modified: from_step_11
  - test_files: from_step_10
expected_outputs:
  - unit_results: { passed, failed, skipped }
  - integration_results: { passed, failed, skipped }
  - e2e_results: { passed, failed, skipped }
  - perf_results: prosa ou métricas
expected_next: 13
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash]
---

# Step 12 — Testing Validation

> **Posição no Pipeline:** Passo 12 — Após GREEN. Roda suíte completa + checks de sanidade antes de release.
> **Objetivo:** Confirmar que feature tests passam, regression tests continuam verdes, e integração/E2E/performance/security/mutation estão saudáveis.

## Heavy mode prompt

Você é o agente `feature-integration-validator`. Faça análise profunda focada em "Testes, validação e checks de sanidade", mantendo governança e impacto mínimo.

**Contexto:**
- `files_modified` (Step 11) e `test_files` (Step 10).
- Restrições: não modificar código de produção (apenas validar e reportar).

**Tarefas obrigatórias:**
1. Rodar a suíte completa: unit + integration + contract + E2E (se aplicável).
2. Comparar com baseline pré-feature: nenhum teste novo falhando, nenhum teste antigo regredindo.
3. Rodar checks de performance (se feature tem código quente): latência média, p95, throughput.
4. Rodar checks de security (lint de regras, scan de secrets, fuzz se aplicável).
5. Rodar mutation testing (se ferramenta disponível): score de mutantes mortos vs sobreviventes.
6. Verificar lint, type-check, format pass.
7. Confirmar que invariantes do Step 04 (domain rules) e Step 08 (idempotência/atomicidade) são protegidos por testes verdes.
8. Identificar gaps: testes faltando para edge cases listados no plan.

**Regras:**
- Não alterar código.
- Declare "EVIDÊNCIA" (saída de comandos) vs "ASSUNÇÃO".
- Se algum red aparecer, NÃO encobrir — reportar e voltar ao Step 11.

**Formato da resposta:**
- Tabela por suíte: passed/failed/skipped + tempo de execução
- Comparação com baseline (regressões)
- Métricas de performance (se aplicável)
- Resultado de security checks
- Mutation score (se aplicável)
- Gaps identificados
- Próximo passo (Step 13 ou volta para Step 11)

## Light mode prompt

**Contexto:**
- Files modified do Step 11 + tests do Step 10.

**Tarefa:**
1. Rodar suíte (unit + 1 integration mínimo).
2. Confirmar feature tests verdes + regression verdes.
3. Lint + type-check pass.
4. Reportar resultados em prosa curta.

**Sinal de migração para Heavy:** se feature toca código sensível (financial, security), ou se baseline tem regressão sutil → migre para suíte completa.

**Formato:**
- Suíte (lista curta com pass/fail)
- Lint/type-check status
- Próximo passo

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/12-feature-testing-validation.md`:

- `unit_results`, `integration_results`, `e2e_results`, `perf_results`
- `regressions_detected`: bool + detalhes
- `gaps`: lista de cobertura faltante

**Próximo:** Step 13 — Release + Observability.

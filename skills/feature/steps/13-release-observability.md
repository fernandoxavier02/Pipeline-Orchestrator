---
step_number: 13
step_name: "release-observability"
execution_mode: inline
agent_type: ""
expected_inputs:
  - test_results: from_step_12
expected_outputs:
  - release_notes: prosa estruturada
  - monitoring_setup: { metrics, logs, traces, alerts }
  - observability_checklist: [...]
expected_next: "complete"
gate_required: false
allowed_tools: [Read, Grep, Glob, Edit, Write, Bash]
---

# Step 13 — Release + Observability

> **Posição no Pipeline:** Passo 13 — Último step. Inline (sem agent novo) per mapping spec §10 decisão 7.
> **Objetivo:** Preparar release notes + setup de observabilidade (métricas, logs, traces, alertas) + plano de rollback.

## Heavy mode prompt

Você é meu arquiteto/engenheiro sênior. Faça análise profunda focada em "Prontidão de release, observabilidade e rollback", mantendo governança e impacto mínimo.

**Contexto:**
- `test_results` (Step 12) — todos verdes.
- `files_modified` (Step 11), `implementation_plan` (Step 09), `risk_register` (Step 08).
- Restrições: preservar arquitetura; mudanças mínimas em config.

**Tarefas obrigatórias:**
1. Gerar release notes: o que mudou (do ponto de vista do user), breaking changes (se houver), migrações necessárias.
2. Definir métricas a instrumentar: contadores (uso da feature), gauges (estado), histogramas (latência), error rate.
3. Definir logs estruturados nos pontos críticos (entrada, decisões, falhas) — sem PII.
4. Definir traces (se sistema usa distributed tracing): spans em chamadas externas + SSOT writes.
5. Definir alertas: thresholds para error rate, latência p95, taxa de falha de retry, divergência de SSOT.
6. Plano de rollback: feature flag off, revert de migração, versão anterior do binário — qual é mais rápido?
7. Checklist de release: lint/type/test verde, doc atualizada, monitoring ligado, on-call avisado, runbook escrito.
8. Avaliar canário/gradual rollout: 1% → 10% → 100%? Janela mínima entre etapas?

**Regras:**
- Não alterar código de produção sem necessidade — preferir flags + monitoring.
- Declare "EVIDÊNCIA" (config existente) vs "ASSUNÇÃO".
- Se faltar política (ex.: sem alerting setup), perguntar antes de assumir.

**Formato da resposta:**
- Release notes (markdown)
- Tabela `métrica | tipo | onde instrumentar`
- Logs estruturados (lista de pontos)
- Alertas (thresholds + ação)
- Plano de rollback (passo a passo)
- Checklist de release
- Estratégia de gradual rollout (se aplicável)

## Light mode prompt

**Contexto:**
- Test results verdes + files modified.

**Tarefa:**
1. Release notes: 3-5 linhas (o que mudou, impacto).
2. 1-2 métricas mínimas para observar a feature (counter de uso + error rate).
3. 1-2 logs nos pontos críticos.
4. Rollback: 1 frase (revert do PR ou flag off).

**Sinal de migração para Heavy:** se feature crítica (financial, security, alto tráfego), ou rollback complexo (migração breaking) → migre.

**Formato:**
- Release notes (curto)
- Métricas + logs (lista mínima)
- Rollback (1 frase)
- Checklist mínimo (lint/test/doc)

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/13-feature-release-observability.md`:

- `release_notes`: markdown
- `monitoring_setup`: estrutura
- `observability_checklist`: lista
- `rollback_plan`: passos

**Próximo:** Skill complete. Pipeline-controller fecha o vertical slice e entrega ao closeout.

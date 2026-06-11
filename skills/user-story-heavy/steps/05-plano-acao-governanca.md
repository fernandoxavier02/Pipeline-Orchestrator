---
step_number: 5
step_name: "plano-acao-governanca"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
production_writes_allowed: false
expected_inputs:
  - DomainSSOT: from_step_4
  - ContractAudit: from_step_4
  - RootCauseMatrix: from_step_3
expected_outputs:
  - action_plan_narrative: string
  - ActionPlan: object
  - GovernancePlan: object
expected_next: 6
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 05 — Plano de ação com guardrails, impacto e governança mínima

> **Ported 1:1 from Pulsar** `HEAVY_05_Plano_Acao_Governanca.md`. The prompt body below is preserved verbatim.

```text
Proponha um plano de ação em etapas, com:

1) análise de impacto por dependências (onde pode haver efeito cascata),
2) estratégia A (preferida): isolamento por módulo novo + integração por ponto único,
3) estratégia B (core) apenas se necessário, com mitigação (feature flag, adapter/facade),
4) guardrails de atomicidade e independência,
5) plano de testes,
6) plano de rollback,
7) governança mínima: branch, commits pequenos por intenção, revisão orientada a risco.

Explique:
- atomicidade = mudança pequena, intenção única, reversível,
- independência = evitar mexer no núcleo quando dá para estender,
- adapter/facade = camada tradutora que protege o resto.

Entregue:
- ActionPlan (JSON)
- GovernancePlan (JSON)
```

## Next

→ `steps/06-test-pre-impl.md` (TDD gate — tests must FAIL before execution).

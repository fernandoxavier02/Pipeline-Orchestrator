---
step_number: 5
step_name: "plano-acao-controlado"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
production_writes_allowed: false
expected_inputs:
  - DomainSSOT: from_step_4
  - RootCauseMatrix: from_step_3
expected_outputs:
  - action_plan_narrative: string
  - ActionPlan: object
expected_next: 6
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 05 — Plano de ação controlado (evitar regressão antes de tocar no código)

> **Ported 1:1 from Pulsar** `LIGHT_05_Plano_Acao_Controlado.md`. The prompt body below is preserved verbatim.

```text
Agora proponha um plano de ação controlado para corrigir, com foco em evitar regressão.

Você deve:
- explicar qual é a menor mudança que corrige,
- onde ela deve ser aplicada,
- como reduzir acoplamento (dependência excessiva),
- como evitar efeito cascata,
- e como garantir compatibilidade (não quebrar versões antigas do app, se aplicável).

Entregue:
1) Um texto fluido com o plano em etapas curtas, cada etapa com “o que muda” e “como validar”.
2) Um JSON chamado ActionPlan com: steps, minimal_change_strategy, dependency_impact_guess, regression_risks, guardrails (atomicidade e independência), and rollback_plan.

Atomicidade = “cada mudança é pequena, com intenção única e reversível”.
Independência = “preferir criar algo novo e integrar num ponto específico, sem mexer no núcleo”.
```

## Next

→ `steps/06-test-pre-impl.md` (TDD gate — tests must FAIL before execution).

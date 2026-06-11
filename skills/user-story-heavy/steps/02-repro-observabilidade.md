---
step_number: 2
step_name: "repro-observabilidade"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
production_writes_allowed: false
expected_inputs:
  - IntakeNLP: from_step_1
  - suspect_inventory_by_layer: from_step_1
expected_outputs:
  - repro_narrative: string
  - ReproPlan: object
  - ObservabilityPlan: object
expected_next: 3
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 02 — Repro + Observabilidade mínima (parar de "achar")

> **Ported 1:1 from Pulsar** `HEAVY_02_Repro_Observabilidade.md`. The prompt body below is preserved verbatim.

```text
Produza um plano de reprodução com variações e, se aplicável, um plano de observabilidade mínima.

Observabilidade significa: como “enxergar por dentro” com logs, métricas ou sinais para transformar o sintoma em evidência.
Explique observabilidade em linguagem simples no texto.

Entregue:
- ReproPlan (JSON): repro_steps, variations, expected_signals, failure_signals, fast_checks
- ObservabilityPlan (JSON): where_to_log, what_to_log, minimal_metrics, how_to_read
```

## Next

→ `steps/03-matriz-causa-raiz.md`.

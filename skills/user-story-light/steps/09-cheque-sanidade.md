---
step_number: 9
step_name: "cheque-sanidade"
execution_mode: subagent
agent_type: "pipeline-orchestrator:core:sanity-checker"
production_writes_allowed: false
expected_inputs:
  - ImplementationReport: from_step_7
  - AdversarialReview: from_step_8
  - tests_green: from_step_7
expected_outputs:
  - sanity_narrative: string
  - SanityCheck: object
expected_next: 10
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 09 — Cheque de sanidade (smoke test + consistência)

> **Ported 1:1 from Pulsar** `LIGHT_09_Cheque_Sanidade.md` (byte-identical to the legacy `LIGHT_08_Cheque_Sanidade.md` body). The prompt body below is preserved verbatim.

```text
Agora faça um cheque de sanidade final, curto e prático.

Você deve produzir:
- um smoke test que um leigo consiga executar,
- um smoke test técnico leve (build e um teste essencial),
- e um checklist de sinais de sucesso e sinais de falha.

Entregue:
1) Texto fluido com os testes e resultados esperados.
2) Um JSON chamado SanityCheck com: smoke_test_user, smoke_test_tech, pass_fail_signals, and “monitoring_notes”.
```

## Next

→ `steps/10-pa-de-cal-fechamento.md`.

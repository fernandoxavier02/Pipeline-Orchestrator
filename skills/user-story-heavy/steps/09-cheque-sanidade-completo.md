---
step_number: 9
step_name: "cheque-sanidade-completo"
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

# Step 09 — Cheque de sanidade completo (smoke + regressão) e checklist operacional

> **Ported 1:1 from Pulsar** `HEAVY_09_Cheque_Sanidade_Completo.md` (byte-identical to the legacy `HEAVY_08_Cheque_Sanidade_Completo.md` body). The prompt body below is preserved verbatim.

```text
Produza um pacote de validação final:

- smoke test leigo (passos e resultado esperado),
- smoke test técnico (build + testes disponíveis),
- checklist de regressão focado em áreas sensíveis,
- e notas de monitoramento pós-release.

Entregue SanityCheck (JSON).
```

## Next

→ `steps/10-pa-de-cal-release-notes.md`.

---
step_number: 4
step_name: "dominio-ssot-contrato"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
production_writes_allowed: false
expected_inputs:
  - RootCauseMatrix: from_step_3
  - IntakeNLP: from_step_1
expected_outputs:
  - domain_narrative: string
  - DomainSSOT: object
  - ContractAudit: object
expected_next: 5
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 04 — Domínio, regras de negócio e SSOT + auditoria de contrato

> **Ported 1:1 from Pulsar** `HEAVY_04_Dominio_SSOT_Contrato.md`. The prompt body below is preserved verbatim.

```text
Modele o domínio do problema (entidades e regras de negócio). Identifique candidatos a SSOT (fonte única da verdade) e como validar qual é a correta.

Audite contrato de API/dados:
- request/response esperado,
- campos obrigatórios e opcionais,
- e como manter compatibilidade retroativa (evitar breaking change = mudança que quebra versões antigas).

Explique cada termo técnico em uma frase simples ao usar.

Entregue:
- DomainSSOT (JSON)
- ContractAudit (JSON)
```

## Next

→ `steps/05-plano-acao-governanca.md`.

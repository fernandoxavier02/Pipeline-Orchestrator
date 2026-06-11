---
step_number: 3
step_name: "matriz-causa-raiz"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer"
production_writes_allowed: false
expected_inputs:
  - ReproPlan: from_step_2
  - ObservabilityPlan: from_step_2
  - IntakeNLP: from_step_1
expected_outputs:
  - root_cause_narrative: string
  - RootCauseMatrix: object
expected_next: 4
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 03 — Matriz de causa raiz (provas e refutações por camada)

> **Ported 1:1 from Pulsar** `HEAVY_03_Matriz_Causa_Raiz.md`. The prompt body below is preserved verbatim.

```text
Crie uma matriz de hipóteses por camada (frontend, backend/API, dados, infra/cache).

Para cada hipótese, defina:
- prova (o que confirma),
- refutação (o que derruba),
- teste mínimo (o jeito mais barato e conclusivo de verificar).

Inclua explicitamente e explique em linguagem simples:
- endpoint (endereço do servidor),
- contrato de API/dados (o combinado request/response),
- acoplamento (dependência apertada),
- efeito cascata (mudança que se espalha e causa regressão),
- e estado/ciclo de vida do frontend (memória temporária e quando a tela atualiza).

Entregue RootCauseMatrix (JSON) e uma narrativa explicativa.
```

## Next

→ `steps/04-dominio-ssot-contrato.md`.

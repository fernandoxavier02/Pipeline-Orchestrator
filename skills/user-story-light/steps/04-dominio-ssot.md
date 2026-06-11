---
step_number: 4
step_name: "dominio-ssot"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
production_writes_allowed: false
expected_inputs:
  - RootCauseMatrix: from_step_3
  - IntakeNLP: from_step_1
expected_outputs:
  - domain_narrative: string
  - DomainSSOT: object
expected_next: 5
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 04 — Domínio e fonte única da verdade (SSOT)

> **Ported 1:1 from Pulsar** `LIGHT_04_Dominio_SSOT.md`. The prompt body below is preserved verbatim.

```text
Agora assuma que uma hipótese está mais forte e queremos checar o “domínio” e a “fonte única da verdade”.

Domínio significa: qual é a regra de negócio por trás do comportamento esperado (por exemplo, quem pode ver o quê, quando um registro é criado, qual estado é válido).
Fonte única da verdade (SSOT) significa: qual lugar manda no comportamento final (por exemplo, banco de dados, endpoint, fila/cron, configuração, ou regra no backend).

Entregue:
1) Um texto fluido explicando qual domínio está envolvido, quais regras de negócio podem estar sendo violadas e quais são os candidatos a SSOT.
2) Um JSON chamado DomainSSOT com: domain_entities, business_rules_suspected, ssot_candidates, contract_touchpoints (se envolver API/dados), and “what_must_not_change” (coisas que não podem mudar por compatibilidade).

Se mencionar API ou endpoint, explique em uma frase simples.
Se mencionar contrato, explique que é “o combinado do formato de entrada/saída”.
```

## Next

→ `steps/05-plano-acao-controlado.md`.

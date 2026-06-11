---
step_number: 10
step_name: "pa-de-cal-fechamento"
execution_mode: subagent
agent_type: "pipeline-orchestrator:core:final-validator"
production_writes_allowed: false
expected_inputs:
  - SanityCheck: from_step_9
  - ImplementationReport: from_step_7
  - AdversarialReview: from_step_8
  - acceptance_criteria: from_step_1
expected_outputs:
  - closing_narrative: string
  - FinalSeal: object
  - go_no_go: "GO | CONDITIONAL | NO-GO"
  - askuserquestion_response: string
  - gate_decision: "GO | CONDITIONAL | NO-GO"
expected_next: null
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, Bash, AskUserQuestion]
---

# Step 10 — Pá de cal (fechamento final) — REQUIRES GO/NO-GO

> **Ported 1:1 from Pulsar** `LIGHT_10_Pa_de_Cal_Fechamento.md` (byte-identical to the legacy `LIGHT_09_Pa_de_Cal_Fechamento.md` body). The prompt body below is preserved verbatim. This is the terminal Pa de Cal gate — GO / CONDITIONAL / NO-GO via AskUserQuestion.

```text
Agora faça a verificação final de fechamento (“pá de cal”).

Você deve confirmar:
- o problema original foi resolvido conforme critérios de aceitação,
- não houve regressão nas áreas sensíveis,
- o contrato (API/dados) permanece compatível,
- existe plano de rollback claro.

Entregue:
1) Texto fluido de fechamento, como relatório final para alguém não técnico.
2) Um JSON chamado FinalSeal com: acceptance_criteria_status, regression_status, contract_status, rollback_ready, and “release_notes”.

Se algo não puder ser provado, declare explicitamente.
```

## Pá de Cal gate (mandatory — no prose substitute)

```
header: "GO/NO-GO"
question: "Pá de Cal: aprovar a user story como entregue?"
multiSelect: false
options:
  - label: "GO — critérios atendidos, encerrar (Recomendado)"
    description: "Critérios de aceitação atendidos, sem regressão, contrato compatível, rollback pronto."
  - label: "CONDITIONAL — aprovar com follow-up"
    description: "Entregar agora, mas registrar pendências para próxima iteração."
  - label: "NO-GO — voltar à etapa apropriada"
    description: "Algo não pôde ser provado ou um critério falhou; reentrar antes de fechar."
```

(AskUserQuestion automatically appends "Other".)

Record `go_no_go` + `askuserquestion_response`; append to `.pipeline/gate-decisions.jsonl`.

## Skill exit

Terminal step. On `GO` / `CONDITIONAL`, return control to the caller. On `NO-GO`, re-enter at the appropriate earlier step.

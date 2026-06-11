---
step_number: 10
step_name: "pa-de-cal-release-notes"
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
  - release_notes: string
  - go_no_go: "GO | CONDITIONAL | NO-GO"
  - askuserquestion_response: string
  - gate_decision: "GO | CONDITIONAL | NO-GO"
expected_next: null
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, Bash, AskUserQuestion]
---

# Step 10 — Pá de cal (critério de fechamento + release notes) — REQUIRES GO/NO-GO

> **Ported 1:1 from Pulsar** `HEAVY_10_Pa_de_Cal_Release_Notes.md` (byte-identical to the legacy `HEAVY_09_Pa_de_Cal_Release_Notes.md` body). The prompt body below is preserved verbatim. This is the terminal Pa de Cal gate — GO / CONDITIONAL / NO-GO via AskUserQuestion.

```text
Faça o fechamento final (“pá de cal”):

Confirme:
- critérios de aceitação atendidos,
- regressões comuns descartadas,
- compatibilidade de contrato confirmada,
- rollback pronto,
- e gere release notes em linguagem simples.

Entregue FinalSeal (JSON).

Se algo não puder ser comprovado, declare isso explicitamente.
```

## Pá de Cal gate (mandatory — no prose substitute)

```
header: "GO/NO-GO"
question: "Pá de Cal: aprovar a user story (COMPLEXA) como entregue?"
multiSelect: false
options:
  - label: "GO — critérios atendidos, encerrar (Recomendado)"
    description: "Critérios de aceitação atendidos, regressões descartadas, contrato compatível, rollback pronto, release notes geradas."
  - label: "CONDITIONAL — aprovar com follow-up"
    description: "Entregar agora, mas registrar pendências para próxima iteração."
  - label: "NO-GO — voltar à etapa apropriada"
    description: "Algo não pôde ser comprovado ou um critério falhou; reentrar antes de fechar."
```

(AskUserQuestion automatically appends "Other".)

Record `go_no_go` + `askuserquestion_response`; append to `.pipeline/gate-decisions.jsonl`.

## Skill exit

Terminal step. On `GO` / `CONDITIONAL`, return control to the caller. On `NO-GO`, re-enter at the appropriate earlier step.

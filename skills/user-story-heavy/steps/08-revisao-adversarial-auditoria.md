---
step_number: 8
step_name: "revisao-adversarial-auditoria"
execution_mode: subagent
agent_type: "pipeline-orchestrator:quality:review-orchestrator"
production_writes_allowed: false
expected_inputs:
  - ImplementationReport: from_step_7
  - DomainSSOT: from_step_4
  - ContractAudit: from_step_4
  - atomic_commits: from_step_7
expected_outputs:
  - adversarial_narrative: string
  - AdversarialReview: object
  - must_fix_before_merge: list
  - askuserquestion_response: string
  - gate_decision: "approved | fix | abort"
expected_next: 9
gate_required: true
allowed_tools: [Task, Read, Grep, Glob, AskUserQuestion]
---

# Step 08 — Revisão adversarial + auditoria (contrato, impacto, regressão) — ADVERSARIAL GATE

> **Ported 1:1 from Pulsar** `HEAVY_08_Revisao_Adversarial_Auditoria.md` (byte-identical to the legacy `HEAVY_07_Revisao_Adversarial_Auditoria.md` body). The prompt body below is preserved verbatim. The ADVERSARIAL GATE (AskUserQuestion to approve the review start, then a fix loop max 3 if findings surface) is enforced before transitioning.

```text
Atue como revisor adversarial e auditor.

Verifique:
- regressões prováveis,
- quebras de contrato,
- mudanças em pontos sensíveis (componentes compartilhados, dados/migrations, autenticação, cache/PWA),
- e impactos indiretos por dependência (efeito cascata).

Se encontrar risco, proponha ajuste pontual (sem refatoração ampla).

Entregue:
- AdversarialReview (JSON)
- parecer narrativo com “must_fix_before_merge”.
```

## Adversarial gate (mandatory — no prose substitute)

```
header: "Adversarial"
question: "Revisão adversarial + auditoria concluída. Como proceder?"
multiSelect: false
options:
  - label: "Aprovar — sem must_fix, seguir para sanidade (Recomendado)"
    description: "Nenhuma regressão provável, quebra de contrato ou ponto sensível exige correção antes do merge."
  - label: "Corrigir — aplicar must_fix_before_merge (loop max 3)"
    description: "Há ajustes pontuais a aplicar antes de seguir (sem refatoração ampla)."
  - label: "Abortar — replanejar"
    description: "Os achados indicam que o plano precisa ser revisto."
```

(AskUserQuestion automatically appends "Other". Mandatory if auth/crypto/data/migrations touched. Fix loop is capped at 3 attempts per the STOP RULE.)

Record `gate_decision` + `askuserquestion_response`; append to `.pipeline/gate-decisions.jsonl`.

## Next

If `approved` → `steps/09-cheque-sanidade-completo.md`.

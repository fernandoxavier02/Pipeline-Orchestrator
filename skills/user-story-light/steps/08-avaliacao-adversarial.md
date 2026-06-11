---
step_number: 8
step_name: "avaliacao-adversarial"
execution_mode: subagent
agent_type: "pipeline-orchestrator:quality:review-orchestrator"
production_writes_allowed: false
expected_inputs:
  - ImplementationReport: from_step_7
  - DomainSSOT: from_step_4
  - files_changed: from_step_7
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

# Step 08 — Avaliação adversarial (tente quebrar) — ADVERSARIAL GATE

> **Ported 1:1 from Pulsar** `LIGHT_08_Avaliacao_Adversarial.md` (byte-identical to the legacy `LIGHT_07_Avaliacao_Adversarial.md` body). The prompt body below is preserved verbatim. The ADVERSARIAL GATE (AskUserQuestion to approve the review start, then a fix loop max 3 if findings surface) is enforced before transitioning.

```text
Agora atue como um revisor adversarial. Assuma que a correção pode estar errada e tente encontrar como ela falha.

Procure:
- efeitos colaterais (efeito cascata),
- cenários reais do usuário (não óbvios),
- dados ausentes,
- cache antigo,
- permissão/autorização,
- qualquer quebra de contrato de API/dados (contrato = combinado do formato de request/response).

Entregue:
1) Um texto fluido com os principais vetores de falha e como testá-los.
2) Um JSON chamado AdversarialReview com: attack_scenarios, likely_regressions, and “must_fix_before_merge”.
```

## Adversarial gate (mandatory — no prose substitute)

```
header: "Adversarial"
question: "Avaliação adversarial concluída. Como proceder?"
multiSelect: false
options:
  - label: "Aprovar — sem must_fix, seguir para sanidade (Recomendado)"
    description: "Nenhum vetor de falha exige correção antes do merge."
  - label: "Corrigir — aplicar must_fix_before_merge (loop max 3)"
    description: "Há regressões prováveis ou quebras de contrato a corrigir antes de seguir."
  - label: "Abortar — replanejar"
    description: "Os achados indicam que o plano precisa ser revisto."
```

(AskUserQuestion automatically appends "Other". Mandatory if auth/crypto/data touched. Fix loop is capped at 3 attempts per the STOP RULE.)

Record `gate_decision` + `askuserquestion_response`; append to `.pipeline/gate-decisions.jsonl`.

## Next

If `approved` → `steps/09-cheque-sanidade.md`.

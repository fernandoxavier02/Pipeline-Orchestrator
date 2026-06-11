---
step_number: 1
step_name: "intake-spec-nlp"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:feature-vertical-slice-planner"
production_writes_allowed: false
expected_inputs:
  - user_story_narrative: from_user
  - semi_technical_report: from_user (optional)
expected_outputs:
  - spec_narrative: string
  - IntakeNLP: object
  - suspect_inventory_by_layer: object
expected_next: 2
gate_required: false
allowed_tools: [Task, Read, Grep, Glob, Bash]
---

# Step 01 — Intake leigo com Spec formal e NLP estruturado

> **Ported 1:1 from Pulsar** `HEAVY_01_Intake_Spec_NLP.md`. The prompt body below is preserved verbatim. A worked example of the IntakeNLP output is available at the ancestor path `INTAKE_NLP_01_Audio_Mismatch.json` (see SKILL.md reference docs).

```text
Você é o agente principal. Transforme relatos leigos e semi-técnicos em um processo spec-driven completo.

Primeiro, escreva um Spec em texto fluido com:
- história do usuário,
- escopo e fora de escopo,
- critérios de aceitação,
- severidade e impacto,
- e um inventário inicial de suspeitos por camada: frontend (UI/estado), backend/API (endpoints e regras), dados (persistência/schema) e infra/cache (deploy, env, service worker se for PWA).

Depois, gere IntakeNLP (JSON) com entidades extraídas via NLP (tela, botão, ação, mensagens, “carregando”, “sumiu”, “versão antiga”, etc.), ambiguidades e lacunas.

Não implemente nada. Não assuma nada sem evidência.
```

## Next

→ `steps/02-repro-observabilidade.md`.

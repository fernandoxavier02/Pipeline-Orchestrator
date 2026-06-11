---
step_number: 3
step_name: "causa-raiz-confirmacao"
execution_mode: subagent
agent_type: "pipeline-orchestrator:executor:type-specific:bugfix-root-cause-analyzer"
production_writes_allowed: false
expected_inputs:
  - ReproPlan: from_step_2
  - IntakeNLP: from_step_1
expected_outputs:
  - root_cause_narrative: string
  - RootCauseMatrix: object
expected_next: 4
gate_required: false
allowed_tools: [Task, Read, Grep, Glob]
---

# Step 03 — Ter certeza da causa raiz (confirmar e não "achar")

> **Ported 1:1 from Pulsar** `LIGHT_03_Causa_Raiz_Confirmacao.md`. The prompt body below is preserved verbatim.

```text
Agora que temos um plano de reprodução, quero que você conduza um processo de confirmação de causa raiz em camadas, começando do mais barato e conclusivo.

Você deve trabalhar com hipóteses e evidências. Para cada hipótese, diga:
- o que eu preciso observar para confirmar,
- o que eu preciso observar para refutar,
- e qual camada ela pertence: interface (frontend), servidor (backend/API), dados (banco/persistência) ou infraestrutura/cache.

Entregue:
1) Um texto fluido explicando como você vai “fechar” a causa com evidência, sem chute.
2) Um JSON chamado RootCauseMatrix com: hypotheses (id, descrição, camada, probabilidade, impacto, evidência_necessária, evidência_de_refutação).

Obrigatório: inclua o conceito de “efeito cascata” e explique como você vai evitar que a correção cause regressão.
Efeito cascata = “mexeu num lugar e quebrou outro porque as partes são muito dependentes (acoplamento)”.
Acoplamento = “dependência apertada entre módulos/partes do sistema”.
```

## Next

→ `steps/04-dominio-ssot.md`.

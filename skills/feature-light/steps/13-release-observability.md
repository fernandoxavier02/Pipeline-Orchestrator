---
step_number: 13
step_name: "release-observability"
source: "Pulsar/LIGHT_13_12_RELEASE_OBSERVABILITY.md"
description: "Light 12: Prontidao de release e observabilidade"
execution_mode: inline
agent_type: ""
expected_inputs:
  - test_results: from_step_12
  - sanity_report: from_step_12
expected_outputs:
  - release_notes: object
  - observability_plan: object
  - rollback_plan: object
expected_next: "complete"
gate_required: false
allowed_tools: [Read, Grep, Glob, Bash]
---

# Feature Pipeline (Light) - Prontidao de release, observabilidade e rollback

## Quando usar
Use quando a feature/melhoria e pequena a media, com risco controlado, e voce quer velocidade com disciplina.

## Regra
Nao implemente codigo nesta etapa (a menos que eu peça explicitamente). Se durante a analise surgirem persistencia sensivel,
regras de negocio complexas, integracao critica, concorrencia ou grande impacto em UX/contratos, sinalize e recomende migrar para o Heavy.

---

## Prompt

Contexto da feature:
- Feature/melhoria: [descreva em 2-5 linhas]
- Valor para o usuario/negocio: [1-2 linhas]
- Onde imagino que entra: [tela/rota/service/job]
- Restricoes: mudancas minimas; preservar padroes; evitar refatoracao ampla; manter estilo/UI.

Tarefa:
1) Entregue uma analise objetiva para "Prontidao de release, observabilidade e rollback".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** Skill complete

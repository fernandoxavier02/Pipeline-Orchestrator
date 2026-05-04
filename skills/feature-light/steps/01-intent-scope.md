---
step_number: 01
step_name: "intent-scope"
source: "Pulsar/LIGHT_01_01_INTENT_SCOPE.md"
description: "Light 01: Intencao, valor e limites de escopo"
execution_mode: inline
agent_type: ""
expected_inputs:
  - feature_request: from_user
  - business_value: from_user
expected_outputs:
  - intent_doc: object
  - scope_boundaries: object
  - applicability_assessment: object
expected_next: 2
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Feature Pipeline (Light) - Intencao, valor e limites de escopo

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
1) Entregue uma analise objetiva para "Intencao, valor e limites de escopo".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 02

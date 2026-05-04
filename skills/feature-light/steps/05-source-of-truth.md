---
step_number: 05
step_name: "source-of-truth"
source: "Pulsar/LIGHT_05_05_SOURCE_OF_TRUTH.md"
description: "Light 05: Fonte da verdade e modelo de estado"
execution_mode: inline
agent_type: ""
expected_inputs:
  - domain_rules: from_step_04
  - terrain_map: from_step_02
expected_outputs:
  - ssot_mapping: object
  - state_model: object
expected_next: 6
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Feature Pipeline (Light) - Fonte da verdade e modelo de estado

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
1) Entregue uma analise objetiva para "Fonte da verdade e modelo de estado".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 06

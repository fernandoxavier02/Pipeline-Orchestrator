---
step_number: 02
step_name: "terrain-recon"
source: "Pulsar/LIGHT_02_02_TERRAIN_RECON.md"
description: "Light 02: Reconhecimento do terreno do projeto"
execution_mode: inline
agent_type: ""
expected_inputs:
  - intent_doc: from_step_01
  - scope_boundaries: from_step_01
expected_outputs:
  - terrain_map: object
  - existing_patterns: list
  - integration_points: list
expected_next: 3
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Feature Pipeline (Light) - Reconhecimento do terreno do projeto

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
1) Entregue uma analise objetiva para "Reconhecimento do terreno do projeto".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 03
